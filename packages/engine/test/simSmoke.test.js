import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileBotSource, runMatchToReplay } from '@coding-game/engine'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../..')

/**
 * @param {string} md
 */
function extractTextFence(md) {
  const normalized = md.replace(/\r\n?/g, '\n')
  const m = normalized.match(/```text\s*\n([\s\S]*?)\n```/)
  if (!m) throw new Error('No ```text code fence found')
  return m[1]
}

function loadExampleBot(n) {
  const filename = path.join(repoRoot, 'examples', `bot${n}.md`)
  const md = readFileSync(filename, 'utf8')
  return extractTextFence(md)
}

test('runMatchToReplay: deterministic smoke test (examples bot0..bot3)', () => {
  const sources = [0, 1, 2, 3].map((n) => loadExampleBot(n))

  // Integration requirement: ensure example bots compile before sim.
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

  const r1 = runMatchToReplay(params)
  const r2 = runMatchToReplay(params)

  assert.deepStrictEqual(r2, r1, 'expected deterministic replay output')

  assert.equal(r1.schemaVersion, '0.1.0')
  assert.equal(r1.rulesetVersion, '0.1.0')
  assert.equal(r1.matchSeed, 123)
  assert.ok(r1.tickCap <= 50)

  // state/events should be indexed by tick, including t=0.
  assert.equal(r1.state.length, r1.tickCap + 1)
  assert.equal(r1.events.length, r1.tickCap + 1)

  // Tick 1 should have one BOT_EXEC per alive bot.
  const execsT1 = r1.events[1].filter((e) => e.type === 'BOT_EXEC')
  assert.equal(execsT1.length, 4)

  // End-to-end sanity: should see at least one move/shoot/powerup.
  const allEvents = r1.events.flat()
  assert.ok(allEvents.some((e) => e.type === 'BOT_MOVED'), 'expected at least one movement event')
  assert.ok(allEvents.some((e) => e.type === 'BULLET_SPAWN'), 'expected at least one bullet spawn event')
  assert.ok(allEvents.some((e) => e.type === 'POWERUP_SPAWN'), 'expected at least one powerup spawn event')
})
