import test from 'node:test'
import assert from 'node:assert/strict'

import { generateSampleReplay } from '../src/index.js'

test('ammo is consumable; ammo only increases via AMMO powerups', () => {
  const seed = 909090
  const tickCap = 240

  // Keep everyone except BOT2 idle so BOT2 has stable targets and we minimize powerup pickups.
  // BOT2 must be non-idle so the sample generator doesn't short-circuit it.
  const bots = [
    { slotId: 'BOT1', sourceText: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n' },
    { slotId: 'BOT2', sourceText: 'LABEL LOOP\nMOVE LEFT\nGOTO LOOP\n' },
    { slotId: 'BOT3', sourceText: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n' },
    { slotId: 'BOT4', sourceText: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n' },
  ]

  const a = generateSampleReplay(seed, { tickCap, bots })
  const b = generateSampleReplay(seed, { tickCap, bots })

  // Determinism
  assert.deepStrictEqual(a, b)

  assert.equal(a.tickCap, tickCap)
  assert.equal(a.state.length, tickCap + 1)
  assert.equal(a.events.length, tickCap + 1)

  let sawAmmoConsumed = false

  for (let t = 1; t <= tickCap; t++) {
    const prevBot2 = a.state[t - 1].bots.find((x) => x.botId === 'BOT2')
    const bot2 = a.state[t].bots.find((x) => x.botId === 'BOT2')

    assert.ok(prevBot2, 'missing BOT2 in state[t-1]')
    assert.ok(bot2, 'missing BOT2 in state[t]')

    const prevAmmo = prevBot2.ammo
    const currAmmo = bot2.ammo

    const tickEvents = a.events[t] ?? []

    const bot2ResourceDeltas = tickEvents.filter(
      (e) => e && e.type === 'RESOURCE_DELTA' && e.botId === 'BOT2'
    )

    const ammoDeltaSum = bot2ResourceDeltas.reduce((sum, e) => sum + (e.ammoDelta ?? 0), 0)

    for (const e of bot2ResourceDeltas) {
      if (e.cause === 'SHOOT') {
        sawAmmoConsumed = true
        assert.equal(e.ammoDelta, -1)
      }

      if ((e.ammoDelta ?? 0) > 0) {
        assert.equal(e.cause, 'PICKUP_AMMO')
      }
    }

    // The only thing allowed to change ammo is RESOURCE_DELTA events.
    assert.equal(currAmmo, prevAmmo + ammoDeltaSum)

    // If ammo increased, it must have been from an AMMO pickup.
    if (currAmmo > prevAmmo) {
      const hasAmmoPickupDelta = bot2ResourceDeltas.some((e) => (e.ammoDelta ?? 0) > 0 && e.cause === 'PICKUP_AMMO')
      assert.ok(hasAmmoPickupDelta)
    }
  }

  assert.ok(sawAmmoConsumed, 'expected at least one SHOOT resource delta for BOT2')
})
