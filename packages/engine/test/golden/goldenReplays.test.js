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
  // Exclude header.sourceText blobs to keep the golden stable when comments change.
  const headerBots = (replay.header?.bots ?? []).map((b) => {
    if (!b || typeof b !== 'object') return b
    if ('sourceText' in b) return { ...b, sourceText: undefined }
    return b
  })

  return { ...(replay.header ?? {}), bots: headerBots }
}

function parseLoadoutFromSourceHeader(sourceText) {
  const lines = String(sourceText || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')

  /** @type {[any, any, any]} */
  const loadout = [null, null, null]

  let headerCommentLinesSeen = 0
  let sawDirective = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Only scan the leading comment header.
    if (!trimmed.startsWith(';')) break

    headerCommentLinesSeen++

    // Accept `;@slot1 BULLET` as well as `;@slot1: BULLET` / `;@slot1 = BULLET`.
    const m = trimmed.match(/^;\s*@slot([123])\s*[:=]?\s*(\S+)\s*$/i)
    if (m) {
      sawDirective = true

      const slot = Number(m[1])
      const raw = String(m[2] || '')
        .trim()
        .toUpperCase()

      if (slot < 1 || slot > 3) continue

      if (raw === 'EMPTY' || raw === 'NONE') loadout[slot - 1] = null
      else if (raw === 'BULLET' || raw === 'SAW' || raw === 'SHIELD' || raw === 'ARMOR') loadout[slot - 1] = raw
      else loadout[slot - 1] = null
    }

    if (headerCommentLinesSeen >= 3) break
  }

  if (!sawDirective) return [null, null, null]
  return loadout
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
  if (!Array.isArray(expected)) {
    assert.fail(`${kind} fixture is missing an array of per-tick hashes (run \`pnpm golden:update\`)`)
  }

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
    { slotId: 'BOT1', sourceText: sources[0], loadout: parseLoadoutFromSourceHeader(sources[0]) },
    { slotId: 'BOT2', sourceText: sources[1], loadout: parseLoadoutFromSourceHeader(sources[1]) },
    { slotId: 'BOT3', sourceText: sources[2], loadout: parseLoadoutFromSourceHeader(sources[2]) },
    { slotId: 'BOT4', sourceText: sources[3], loadout: parseLoadoutFromSourceHeader(sources[3]) },
  ]

  const replay = runMatchToReplay({ seed, tickCap, bots })

  return {
    coreReplaySha256: hashReplayCore(replay),
    stateTickSha256: hashTicks(replay.state),
    eventsTickSha256: hashTicks(replay.events),
  }
}

test('golden: examples smoke (bot0..bot3)', (t) => {
  const fixture = loadFixture('examples_smoke_seed123')
  if (!fixture) {
    t.skip('golden fixture missing: examples_smoke_seed123.json')
    return
  }

  if (fixture.coreReplaySha256 === '__REPLACE_BY_RUNNING_pnpm_golden_update__') {
    t.skip('golden fixture not generated yet; run `pnpm golden:update` to populate hashes')
    return
  }

  assert.equal(fixture.name, 'examples_smoke_seed123')
  assert.deepStrictEqual(fixture.params, { seed: 123, tickCap: 50, bots: [0, 1, 2, 3] })
  assert.ok(Array.isArray(fixture.stateTickSha256), 'fixture.stateTickSha256 must be an array')
  assert.ok(Array.isArray(fixture.eventsTickSha256), 'fixture.eventsTickSha256 must be an array')
  assert.ok(fixture.stateTickSha256.length > 0, 'fixture.stateTickSha256 must be non-empty')
  assert.ok(fixture.eventsTickSha256.length > 0, 'fixture.eventsTickSha256 must be non-empty')

  const got = runScenarioExampleBots({ seed: 123, tickCap: 50, botNums: [0, 1, 2, 3] })

  assert.equal(got.coreReplaySha256, fixture.coreReplaySha256)
  assertTickHashesEqual('state', got.stateTickSha256, fixture.stateTickSha256)
  assertTickHashesEqual('events', got.eventsTickSha256, fixture.eventsTickSha256)
})

test('golden: modules + powerups (bot0,bot5,bot6,bot4)', (t) => {
  const fixture = loadFixture('modules_powerups_seed999')
  if (!fixture) {
    t.skip('golden fixture missing: modules_powerups_seed999.json')
    return
  }

  if (fixture.coreReplaySha256 === '__REPLACE_BY_RUNNING_pnpm_golden_update__') {
    t.skip('golden fixture not generated yet; run `pnpm golden:update` to populate hashes')
    return
  }

  assert.equal(fixture.name, 'modules_powerups_seed999')
  assert.deepStrictEqual(fixture.params, { seed: 999, tickCap: 120, bots: [0, 5, 6, 4] })
  assert.ok(Array.isArray(fixture.stateTickSha256), 'fixture.stateTickSha256 must be an array')
  assert.ok(Array.isArray(fixture.eventsTickSha256), 'fixture.eventsTickSha256 must be an array')
  assert.ok(fixture.stateTickSha256.length > 0, 'fixture.stateTickSha256 must be non-empty')
  assert.ok(fixture.eventsTickSha256.length > 0, 'fixture.eventsTickSha256 must be non-empty')

  const got = runScenarioExampleBots({ seed: 999, tickCap: 120, botNums: [0, 5, 6, 4] })

  assert.equal(got.coreReplaySha256, fixture.coreReplaySha256)
  assertTickHashesEqual('state', got.stateTickSha256, fixture.stateTickSha256)
  assertTickHashesEqual('events', got.eventsTickSha256, fixture.eventsTickSha256)
})
  
