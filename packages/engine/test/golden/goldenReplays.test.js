import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
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
  // Exclude header.sourceText blobs to keep the golden stable when comments change.
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

function loadFixture(name) {
  const fixturePath = path.join(__dirname, 'fixtures', `${name}.json`)
  if (!existsSync(fixturePath)) return null
  return JSON.parse(readFileSync(fixturePath, 'utf8'))
}

test('golden: examples smoke (bot0..bot3) replay hash', () => {
  const fixture = loadFixture('examples_smoke_seed123')
  if (!fixture) {
    test.skip('golden fixture missing: examples_smoke_seed123.json')
    return
  }

  const sources = [0, 1, 2, 3].map((n) => loadExampleBot(n))
  for (let i = 0; i < sources.length; i++) {
    const compiled = compileBotSource(sources[i])
    assert.deepStrictEqual(compiled.errors ?? [], [], `expected bot${i} to compile`)
  }

  const bots = [
    { slotId: 'BOT1', sourceText: sources[0] },
    { slotId: 'BOT2', sourceText: sources[1] },
    { slotId: 'BOT3', sourceText: sources[2] },
    { slotId: 'BOT4', sourceText: sources[3] },
  ]

  const params = { seed: 123, tickCap: 50, bots }
  const replay = runMatchToReplay(params)

  if (fixture.coreReplaySha256 === '__REPLACE_BY_RUNNING_pnpm_golden_update__') {
    test.skip('golden fixture not generated yet; run `pnpm golden:update` to populate hashes')
    return
  }

  const got = hashReplayCore(replay)
  assert.equal(got, fixture.coreReplaySha256)
})
