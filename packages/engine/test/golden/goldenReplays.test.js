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

function stripHeaderSourceText(replay) {
  // Exclude header.sourceText blobs to keep the golden stable when comments change.
  const headerBots = (replay.header?.bots ?? []).map((b) => ({
    ...b,
    ...(b && typeof b === 'object' && 'sourceText' in b ? { sourceText: undefined } : {}),
  }))

  return { ...replay.header, bots: headerBots }
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

function assertTickHashesEqual(kind, got, expected) {
  if (!Array.isArray(expected)) return

  if (got.length !== expected.length) {
    assert.fail(`${kind} hash length mismatch: got ${got.length}, expected ${expected.length}`)
  }

  for (let i = 0; i < got.length; i++) {
    if (got[i] !== expected[i]) {
      assert.fail(`${kind} first diverged at tick t=${i}: got ${got[i]}, expected ${expected[i]}`)
    }
  }
}

function loadFixture(name) {
  const fixturePath = path.join(__dirname, 'fixtures', `${name}.json`)
  if (!existsSync(fixturePath)) return null
  return JSON.parse(readFileSync(fixturePath, 'utf8'))
}

function runScenarioExampleBots({ seed, tickCap, botNums }) {
  const sources = botNums.map((n) => loadExampleBot(n))
  for (let i = 0; i < sources.length; i++) {
    const compiled = compileBotSource(sources[i])
    assert.deepStrictEqual(compiled.errors ?? [], [], `expected bot${botNums[i]} to compile`)
  }

  const bots = [
    { slotId: 'BOT1', sourceText: sources[0] },
    { slotId: 'BOT2', sourceText: sources[1] },
    { slotId: 'BOT3', sourceText: sources[2] },
    { slotId: 'BOT4', sourceText: sources[3] },
  ]

  const replay = runMatchToReplay({ seed, tickCap, bots })

  return {
    coreReplaySha256: hashReplayCore(replay),
    stateTickSha256: hashTicks(replay.state),
    eventsTickSha256: hashTicks(replay.events),
  }
}

test('golden: examples smoke (bot0..bot3)', () => {
  const fixture = loadFixture('examples_smoke_seed123')
  if (!fixture) {
    test.skip('golden fixture missing: examples_smoke_seed123.json')
    return
  }

  if (fixture.coreReplaySha256 === '__REPLACE_BY_RUNNING_pnpm_golden_update__') {
    assert.fail('golden fixture not generated yet; run `pnpm golden:update` to populate hashes')
  }

  const got = runScenarioExampleBots({ seed: 123, tickCap: 50, botNums: [0, 1, 2, 3] })

  assert.equal(got.coreReplaySha256, fixture.coreReplaySha256)
  assertTickHashesEqual('state', got.stateTickSha256, fixture.stateTickSha256)
  assertTickHashesEqual('events', got.eventsTickSha256, fixture.eventsTickSha256)
})

test('golden: modules + powerups (bot0,bot5,bot6,bot4)', () => {
  const fixture = loadFixture('modules_powerups_seed999')
  if (!fixture) {
    test.skip('golden fixture missing: modules_powerups_seed999.json')
    return
  }

  if (fixture.coreReplaySha256 === '__REPLACE_BY_RUNNING_pnpm_golden_update__') {
    assert.fail('golden fixture not generated yet; run `pnpm golden:update` to populate hashes')
  }

  const got = runScenarioExampleBots({ seed: 999, tickCap: 120, botNums: [0, 5, 6, 4] })

  assert.equal(got.coreReplaySha256, fixture.coreReplaySha256)
  assertTickHashesEqual('state', got.stateTickSha256, fixture.stateTickSha256)
  assertTickHashesEqual('events', got.eventsTickSha256, fixture.eventsTickSha256)
})
