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
  const m = normalized.match(/```text\s*\n([\s\S]*?)\n```/)
  if (!m) throw new Error('No ```text code fence found')
  return `${m[1]}\n`
}

function loadExampleBot(n) {
  const filename = path.join(repoRoot, 'examples', `bot${n}.md`)
  const md = readFileSync(filename, 'utf8')
  return extractTextFence(md)
}

function hashReplayCore(replay) {
  const headerBots = (replay.header?.bots ?? []).map((b) => ({
    ...b,
    ...(b && typeof b === 'object' && 'sourceText' in b ? { sourceText: undefined } : {}),
  }))

  const core = {
    schemaVersion: replay.schemaVersion,
    rulesetVersion: replay.rulesetVersion,
    matchSeed: replay.matchSeed,
    tickCap: replay.tickCap,
    header: { ...replay.header, bots: headerBots },
    state: replay.state,
    events: replay.events,
  }

  return sha256Hex(stableStringify(core))
}

function writeFixture(name, obj) {
  const outPath = path.join(__dirname, 'fixtures', `${name}.json`)
  writeFileSync(outPath, `${JSON.stringify(obj, null, 2)}\n`)
  process.stdout.write(`wrote ${path.relative(repoRoot, outPath)}\n`)
}

function scenarioExamplesSmokeSeed123() {
  const sources = [0, 1, 2, 3].map((n) => loadExampleBot(n))
  for (let i = 0; i < sources.length; i++) {
    const compiled = compileBotSource(sources[i])
    if ((compiled.errors ?? []).length) {
      throw new Error(`expected bot${i} to compile; got errors: ${JSON.stringify(compiled.errors)}`)
    }
  }

  const bots = [
    { slotId: 'BOT1', sourceText: sources[0] },
    { slotId: 'BOT2', sourceText: sources[1] },
    { slotId: 'BOT3', sourceText: sources[2] },
    { slotId: 'BOT4', sourceText: sources[3] },
  ]

  const params = { seed: 123, tickCap: 50, bots }
  const replay = runMatchToReplay(params)

  return {
    name: 'examples_smoke_seed123',
    params: { seed: 123, tickCap: 50, bots: [0, 1, 2, 3] },
    coreReplaySha256: hashReplayCore(replay),
  }
}

writeFixture('examples_smoke_seed123', scenarioExamplesSmokeSeed123())
