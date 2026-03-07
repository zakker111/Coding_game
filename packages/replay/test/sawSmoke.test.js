import test from 'node:test'
import assert from 'node:assert/strict'

import { generateSampleReplay } from '../src/index.js'

test('generateSampleReplay: SAW smoke test + determinism', () => {
  const seed = 1337
  const tickCap = 120

  const bots = [
    {
      slotId: 'BOT1',
      sourceText: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n',
    },
    {
      slotId: 'BOT2',
      sourceText: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n',
    },
    {
      slotId: 'BOT3',
      sourceText: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n',
    },
    {
      slotId: 'BOT4',
      sourceText: 'LABEL LOOP\nSAW ON\nWAIT 1\nGOTO LOOP\n',
    },
  ]

  const a = generateSampleReplay(seed, { tickCap, bots })
  const b = generateSampleReplay(seed, { tickCap, bots })

  assert.equal(a.tickCap, tickCap)
  assert.equal(a.state.length, tickCap + 1)
  assert.equal(a.events.length, tickCap + 1)

  const bot4 = a.bots.find((hb) => hb.slotId === 'BOT4')
  assert.ok(bot4?.sourceText?.includes('SAW ON'))

  const flatEvents = a.events.flat()

  const hasSawDamage = flatEvents.some(
    (e) => e && e.type === 'DAMAGE' && /** @type {any} */ (e).source === 'SAW'
  )

  const hasSawToggleExec = flatEvents.some(
    (e) =>
      e &&
      e.type === 'BOT_EXEC' &&
      typeof /** @type {any} */ (e).instrText === 'string' &&
      /^SAW\s+(ON|OFF)\b/i.test(/** @type {any} */ (e).instrText)
  )

  assert.ok(
    hasSawDamage || hasSawToggleExec,
    'expected at least one SAW damage event or SAW toggle BOT_EXEC event'
  )

  assert.deepStrictEqual(a, b)
})
