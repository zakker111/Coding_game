import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * @param {string} s
 */
export function normalizeNewlines(s) {
  return s.replace(/\r\n?/g, '\n')
}

/**
 * @param {string} md
 */
export function extractTextFence(md) {
  const normalized = normalizeNewlines(md)
  const m = normalized.match(/```text\s*\n([\s\S]*?)\n```/)
  if (!m) throw new Error('No ```text code fence found')

  // The source in markdown fences always ends with a newline right before the closing ```.
  // Our regex excludes that trailing newline, so we restore it to match the exact script text.
  return `${m[1]}\n`
}

/**
 * @param {string} sourceText
 */
export function parseDisplayNameFromScript(sourceText) {
  const firstLine = normalizeNewlines(sourceText).split('\n')[0] ?? ''
  const m = firstLine.match(/^;\s*bot\d+\s*—\s*(.+?)\s*$/)
  if (!m) throw new Error(`Unable to parse display name from first script line: ${JSON.stringify(firstLine)}`)
  return m[1]
}

/**
 * @param {string} repoRoot
 */
export async function readExampleBot(repoRoot, botId) {
  const mdPath = path.join(repoRoot, 'examples', `${botId}.md`)
  const md = await fs.readFile(mdPath, 'utf8')
  const sourceText = extractTextFence(md)

  return {
    id: botId,
    displayName: parseDisplayNameFromScript(sourceText),
    sourceText,
  }
}

/**
 * Escape a string for inclusion in a JavaScript template literal.
 *
 * @param {string} s
 */
function escapeForTemplateLiteral(s) {
  return s.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

/**
 * @param {string} s
 */
function escapeForSingleQuotedJsString(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * @param {string} repoRoot
 */
export async function generateWorkshopExampleBotsJs(repoRoot) {
  const exampleDir = path.join(repoRoot, 'examples')
  const entries = await fs.readdir(exampleDir)

  const botIds = entries
    .filter((f) => /^bot\d+\.md$/.test(f))
    .map((f) => f.replace(/\.md$/, ''))
    .sort((a, b) => {
      const an = Number(a.replace(/^bot/, ''))
      const bn = Number(b.replace(/^bot/, ''))
      return an - bn
    })

  const bots = []
  for (const botId of botIds) bots.push(await readExampleBot(repoRoot, botId))

  const lines = []
  lines.push('// Copied from /examples/*.md (scripts only) for the buildless deploy workshop.')
  lines.push('// Keep this file in sync with `/examples/`.')
  lines.push('')
  lines.push('export const EXAMPLE_BOTS = {')

  for (let i = 0; i < bots.length; i++) {
    const bot = bots[i]
    const escaped = escapeForTemplateLiteral(normalizeNewlines(bot.sourceText))

    lines.push(`  ${bot.id}: {`)
    lines.push(`    id: '${bot.id}',`)
    lines.push(`    displayName: '${escapeForSingleQuotedJsString(bot.displayName)}',`)
    lines.push(`    sourceText: \`${escaped}\`,`)
    lines.push('  },')

    if (i !== bots.length - 1) lines.push('')
  }

  lines.push('}')
  lines.push('')

  const poolIds = bots.map((b) => b.id).filter((id) => id !== 'bot0')
  lines.push(`export const OPPONENT_EXAMPLE_POOL_IDS = [${poolIds.map((id) => `'${id}'`).join(', ')}]`)
  lines.push(`export const DEFAULT_OPPONENT_EXAMPLE_IDS = ['bot2', 'bot3', 'bot4']`)
  lines.push('')

  // Keep a trailing newline (matches repo style in deploy files).
  return lines.join('\n')
}

/**
 * @param {string} repoRoot
 */
export async function syncDeployFiles(repoRoot) {
  const botInstructionsSrc = path.join(repoRoot, 'BotInstructions.md')
  const botInstructionsDst = path.join(repoRoot, 'deploy', 'bot-instructions.md')
  const instructions = await fs.readFile(botInstructionsSrc, 'utf8')
  await fs.writeFile(botInstructionsDst, instructions)

  const exampleBotsDst = path.join(repoRoot, 'deploy', 'workshop', 'exampleBots.js')
  const generated = await generateWorkshopExampleBotsJs(repoRoot)
  await fs.writeFile(exampleBotsDst, generated)
}

/**
 * @param {string} repoRoot
 */
export async function checkDeployFiles(repoRoot) {
  const botInstructionsSrc = path.join(repoRoot, 'BotInstructions.md')
  const botInstructionsDst = path.join(repoRoot, 'deploy', 'bot-instructions.md')

  const src = normalizeNewlines(await fs.readFile(botInstructionsSrc, 'utf8')).trimEnd()
  const dst = normalizeNewlines(await fs.readFile(botInstructionsDst, 'utf8')).trimEnd()
  if (src !== dst) {
    throw new Error('deploy/bot-instructions.md is out of sync with BotInstructions.md')
  }

  const exampleBotsPath = path.join(repoRoot, 'deploy', 'workshop', 'exampleBots.js')
  const exampleBotsJs = normalizeNewlines(await fs.readFile(exampleBotsPath, 'utf8'))

  /**
   * @param {string} s
   */
  function unescapeTemplateLiteralBody(s) {
    return s.replace(/\\`/g, '`').replace(/\\\$\{/g, '${')
  }

  /**
   * @param {string} s
   */
  function unescapeSingleQuotedJsString(s) {
    return s.replace(/\\'/g, "'").replace(/\\\\/g, '\\')
  }

  /** @type {Record<string, { displayName: string, sourceText: string }>} */
  const parsed = {}

  const re =
    /\n\s*(bot\d+):\s*\{[\s\S]*?displayName:\s*'((?:\\'|[^'])*)',[\s\S]*?sourceText:\s*`([\s\S]*?)`,[\s\S]*?\n\s*\},/g

  for (const m of exampleBotsJs.matchAll(re)) {
    const botId = m[1]
    parsed[botId] = {
      displayName: unescapeSingleQuotedJsString(m[2]),
      sourceText: unescapeTemplateLiteralBody(m[3]),
    }
  }

  const expectedBots = []
  for (let i = 0; i <= 99; i++) {
    const botId = `bot${i}`
    try {
      expectedBots.push(await readExampleBot(repoRoot, botId))
    } catch (err) {
      // stop at the first missing file (bots are contiguous in v1)
      if (err && typeof err === 'object' && err.code === 'ENOENT') break
      throw err
    }
  }

  const expectedIds = new Set(expectedBots.map((b) => b.id))
  for (const botId of Object.keys(parsed)) {
    if (!expectedIds.has(botId)) throw new Error(`deploy/workshop/exampleBots.js has unexpected bot id: ${botId}`)
  }

  for (const b of expectedBots) {
    const got = parsed[b.id]
    if (!got) throw new Error(`deploy/workshop/exampleBots.js is missing ${b.id}`)

    const wantScript = normalizeNewlines(b.sourceText).trimEnd()
    const gotScript = normalizeNewlines(got.sourceText).trimEnd()
    if (wantScript !== gotScript) {
      throw new Error(`deploy/workshop/exampleBots.js script mismatch for ${b.id}`)
    }

    const wantName = b.displayName
    const gotName = got.displayName
    if (wantName !== gotName) {
      throw new Error(`deploy/workshop/exampleBots.js displayName mismatch for ${b.id}`)
    }
  }
}
