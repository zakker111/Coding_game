import test from 'node:test'
import assert from 'node:assert/strict'

import { generateSampleReplay } from '../src/index.js'

test('generateSampleReplay: powerup max-active + lifetime TTL', () => {
  const seed = 424242
  const tickCap = 220
  const lifetimeTicks = 30

  const bots = [
    { slotId: 'BOT1', sourceText: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n' },
    { slotId: 'BOT2', sourceText: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n' },
    { slotId: 'BOT3', sourceText: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n' },
    { slotId: 'BOT4', sourceText: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n' },
  ]

  const a = generateSampleReplay(seed, { tickCap, bots })
  const b = generateSampleReplay(seed, { tickCap, bots })

  assert.equal(a.tickCap, tickCap)
  assert.equal(a.state.length, tickCap + 1)
  assert.equal(a.events.length, tickCap + 1)

  // 2) Assert powerup max-active
  for (let t = 0; t < a.state.length; t++) {
    const tickState = a.state[t]
    assert.ok(Array.isArray(tickState.powerups))
    assert.ok(tickState.powerups.length <= 6)
  }

  /** @type {Map<string, number>} */
  const spawnTickByPowerupId = new Map()

  /** @type {Map<string, number>} */
  const rulesDespawnTickByPowerupId = new Map()

  /** @type {any[]} */
  const pickupDespawnEvents = []

  // 3-4) Gather spawn/despawn ticks from events
  for (let t = 0; t < a.events.length; t++) {
    const tickEvents = a.events[t]
    for (const e of tickEvents) {
      if (!e) continue

      if (e.type === 'POWERUP_SPAWN') {
        const spawn = /** @type {any} */ (e)
        assert.equal(typeof spawn.powerupId, 'string')
        assert.equal(spawnTickByPowerupId.has(spawn.powerupId), false)
        spawnTickByPowerupId.set(spawn.powerupId, t)
      }

      if (e.type === 'POWERUP_DESPAWN') {
        const despawn = /** @type {any} */ (e)
        assert.equal(typeof despawn.powerupId, 'string')
        assert.equal(typeof despawn.reason, 'string')

        if (despawn.reason === 'RULES') {
          assert.equal(rulesDespawnTickByPowerupId.has(despawn.powerupId), false)
          rulesDespawnTickByPowerupId.set(despawn.powerupId, t)
        }

        if (despawn.reason === 'PICKUP') pickupDespawnEvents.push(despawn)
      }
    }
  }

  assert.ok(spawnTickByPowerupId.size > 0)

  // 5) TTL: if a spawn has enough time to expire, expect a RULES despawn at spawnTick + 30.
  for (const [powerupId, spawnTick] of spawnTickByPowerupId) {
    const expectedDespawnTick = spawnTick + lifetimeTicks
    if (expectedDespawnTick > tickCap) continue

    assert.equal(rulesDespawnTickByPowerupId.has(powerupId), true)
    assert.equal(rulesDespawnTickByPowerupId.get(powerupId), expectedDespawnTick)
  }

  // 6) No pickups in this run
  assert.equal(pickupDespawnEvents.length, 0)

  // 7) Determinism
  assert.deepStrictEqual(a, b)
})
