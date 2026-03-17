import { writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileBotSource, runMatchToReplay } from '@coding-game/engine'

import { stableStringify } from '../_util/stableStringify.js'
import { sha256Hex } from '../_util/sha256.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../../..')

function extractTextFence(md) {
  const normalized = md.replace(/\r\n?/g, '\n')
  const m = normalized.match(/```text\s*\n([\s\S]*?)\n?```/)
  if (!m) throw new Error('No ```text code fence found')
  return `${m[1]}\n`
}

function loadExampleBot(n) {
  const filename = path.join(repoRoot, 'examples', `bot${n}.md`)
  const md = readFileSync(filename, 'utf8')
  return extractTextFence(md)
}

function stripHeaderSourceText(replay) {
  const headerBots = (replay.header?.bots ?? []).map((b) => {
    if (!b || typeof b !== 'object') return b
    if ('sourceText' in b) return { ...b, sourceText: undefined }
    return b
  })

  return { ...(replay.header ?? {}), bots: headerBots }
}

function hashReplayCore(replay) {
  const core = {
    schemaVersion: replay.schemaVersion,
    rulesetVersion: replay.rulesetVersion,
    matchSeed: replay.matchSeed,
    tickCap: replay.tickCap,
    header: stripHeaderSourceText(replay),
    state: replay.state,
    events: replay.events,
  }

  return sha256Hex(stableStringify(core))
}

function hashTicks(arr) {
  return arr.map((v) => sha256Hex(stableStringify(v)))
}

function stablePrettyJson(obj) {
  // Ensure stable key ordering across runs/Node versions.
  return JSON.stringify(JSON.parse(stableStringify(obj)), null, 2)
}

function writeFixture(name, obj) {
  const outPath = path.join(__dirname, 'fixtures', `${name}.json`)
  writeFileSync(outPath, `${stablePrettyJson(obj)}\n`)
  process.stdout.write(`wrote ${path.relative(repoRoot, outPath)}\n`)
}

function buildScenario({ name, seed, tickCap, botNums }) {
  if (!Array.isArray(botNums) || botNums.length !== 4) {
    throw new Error(`expected botNums to be an array of 4 bot indices; got: ${JSON.stringify(botNums)}`)
  }

  const sources = botNums.map((n) => loadExampleBot(n))
  for (let i = 0; i < sources.length; i++) {
    const compiled = compileBotSource(sources[i])
    if ((compiled.errors ?? []).length) {
      throw new Error(`expected bot${botNums[i]} to compile; got errors: ${JSON.stringify(compiled.errors)}`)
    }
  }

  const bots = [
    { slotId: 'BOT1', sourceText: sources[0] },
    { slotId: 'BOT2', sourceText: sources[1] },
    { slotId: 'BOT3', sourceText: sources[2] },
    { slotId: 'BOT4', sourceText: sources[3] },
  ]

  const replay = runMatchToReplay({ seed, tickCap, bots })

  return {
    name,
    params: { seed, tickCap, bots: [...botNums] },
    coreReplaySha256: hashReplayCore(replay),
    stateTickSha256: hashTicks(replay.state),
    eventsTickSha256: hashTicks(replay.events),
  }
}

writeFixture(
  'examples_smoke_seed123',
  buildScenario({ name: 'examples_smoke_seed123', seed: 123, tickCap: 50, botNums: [0, 1, 2, 3] })
)

writeFixture(
  'modules_powerups_seed999',
  buildScenario({ name: 'modules_powerups_seed999', seed: 999, tickCap: 120, botNums: [0, 5, 6, 4] })
)
