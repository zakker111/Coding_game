import assert from 'node:assert/strict'

import {
  ARENA_MAX,
  ARENA_MIN,
  BOT_CENTER_MAX,
  BOT_CENTER_MIN,
  POWERUP_TYPES,
  SLOT_IDS,
} from '../../src/sim/constants.js'

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n)
}

function assertFinitePos(pos, label) {
  assert.ok(pos && typeof pos === 'object', `${label}: expected pos object`)
  assert.ok(isFiniteNumber(pos.x), `${label}: expected pos.x to be finite number`)
  assert.ok(isFiniteNumber(pos.y), `${label}: expected pos.y to be finite number`)
}

function assertInRange(n, lo, hi, label) {
  assert.ok(isFiniteNumber(n), `${label}: expected finite number`)
  assert.ok(n >= lo && n <= hi, `${label}: expected ${n} in [${lo}..${hi}]`)
}

/**
 * Replay invariant checker (Phase 4 Slice 0).
 *
 * This is intended for tests only: it asserts basic structure and numeric bounds
 * so determinism/collision changes don't silently introduce NaNs or out-of-bounds
 * entities.
 *
 * @param {any} replay
 */
export function assertReplayInvariants(replay) {
  assert.ok(replay && typeof replay === 'object', 'replay: expected object')

  assert.equal(typeof replay.schemaVersion, 'string', 'replay.schemaVersion: expected string')
  assert.ok(replay.schemaVersion.length > 0, 'replay.schemaVersion: expected non-empty')

  assert.equal(typeof replay.rulesetVersion, 'string', 'replay.rulesetVersion: expected string')
  assert.ok(replay.rulesetVersion.length > 0, 'replay.rulesetVersion: expected non-empty')

  assert.ok(isFiniteNumber(replay.ticksPerSecond), 'replay.ticksPerSecond: expected finite number')

  // matchSeed may be number or string, but must exist.
  assert.ok(replay.matchSeed !== undefined, 'replay.matchSeed: expected present')

  assert.ok(Number.isInteger(replay.tickCap) && replay.tickCap >= 0, 'replay.tickCap: expected integer >= 0')

  assert.ok(Array.isArray(replay.state), 'replay.state: expected array')
  assert.ok(Array.isArray(replay.events), 'replay.events: expected array')
  assert.equal(replay.state.length, replay.events.length, 'expected state/events to have same length')
  assert.equal(replay.state.length, replay.tickCap + 1, 'expected state/events length to equal tickCap+1')

  for (let t = 0; t < replay.state.length; t++) {
    const s = replay.state[t]
    assert.ok(s && typeof s === 'object', `state[${t}]: expected object`)
    assert.equal(s.t, t, `state[${t}].t: expected ${t}`)

    assert.ok(Array.isArray(s.bots) && s.bots.length === 4, `state[${t}].bots: expected length 4`)
    assert.ok(Array.isArray(s.bullets), `state[${t}].bullets: expected array`)
    assert.ok(Array.isArray(s.powerups), `state[${t}].powerups: expected array`)

    for (const b of s.bots) {
      assert.ok(b && typeof b === 'object', `state[${t}].bots[*]: expected object`)
      assert.ok(SLOT_IDS.includes(b.botId), `state[${t}].bots[*].botId: expected one of ${SLOT_IDS.join(',')}`)

      assertFinitePos(b.pos, `state[${t}].bots(${b.botId}).pos`)
      assertInRange(b.pos.x, BOT_CENTER_MIN, BOT_CENTER_MAX, `state[${t}].bots(${b.botId}).pos.x`)
      assertInRange(b.pos.y, BOT_CENTER_MIN, BOT_CENTER_MAX, `state[${t}].bots(${b.botId}).pos.y`)

      assertInRange(b.hp, 0, 100, `state[${t}].bots(${b.botId}).hp`)
      assertInRange(b.ammo, 0, 100, `state[${t}].bots(${b.botId}).ammo`)
      assertInRange(b.energy, 0, 100, `state[${t}].bots(${b.botId}).energy`)

      assert.equal(typeof b.alive, 'boolean', `state[${t}].bots(${b.botId}).alive: expected boolean`)

      assert.ok(Number.isInteger(b.pc) && b.pc >= 1, `state[${t}].bots(${b.botId}).pc: expected integer >= 1`)
    }

    for (const bullet of s.bullets) {
      assert.ok(bullet && typeof bullet === 'object', `state[${t}].bullets[*]: expected object`)
      assert.equal(typeof bullet.bulletId, 'string', `state[${t}].bullets[*].bulletId: expected string`)
      assert.ok(bullet.bulletId.length > 0, `state[${t}].bullets[*].bulletId: expected non-empty`)

      assert.ok(
        SLOT_IDS.includes(bullet.ownerBotId),
        `state[${t}].bullets(${bullet.bulletId}).ownerBotId: expected one of ${SLOT_IDS.join(',')}`
      )

      assertFinitePos(bullet.pos, `state[${t}].bullets(${bullet.bulletId}).pos`)
      assertInRange(bullet.pos.x, ARENA_MIN, ARENA_MAX, `state[${t}].bullets(${bullet.bulletId}).pos.x`)
      assertInRange(bullet.pos.y, ARENA_MIN, ARENA_MAX, `state[${t}].bullets(${bullet.bulletId}).pos.y`)

      assertFinitePos(bullet.vel, `state[${t}].bullets(${bullet.bulletId}).vel`)
    }

    for (const p of s.powerups) {
      assert.ok(p && typeof p === 'object', `state[${t}].powerups[*]: expected object`)
      assert.equal(typeof p.powerupId, 'string', `state[${t}].powerups[*].powerupId: expected string`)
      assert.ok(p.powerupId.length > 0, `state[${t}].powerups[*].powerupId: expected non-empty`)

      assert.ok(POWERUP_TYPES.includes(p.type), `state[${t}].powerups(${p.powerupId}).type: expected one of ${POWERUP_TYPES.join(',')}`)

      assert.ok(p.loc && typeof p.loc === 'object', `state[${t}].powerups(${p.powerupId}).loc: expected object`)
      assert.ok(Number.isInteger(p.loc.sector), `state[${t}].powerups(${p.powerupId}).loc.sector: expected integer`)
      assert.ok(p.loc.sector >= 1 && p.loc.sector <= 9, `state[${t}].powerups(${p.powerupId}).loc.sector: expected 1..9`)

      assert.ok(Number.isInteger(p.loc.zone), `state[${t}].powerups(${p.powerupId}).loc.zone: expected integer`)
      assert.ok(p.loc.zone >= 0 && p.loc.zone <= 4, `state[${t}].powerups(${p.powerupId}).loc.zone: expected 0..4`)
    }

    const tickEvents = replay.events[t]
    assert.ok(Array.isArray(tickEvents), `events[${t}]: expected array`)
  }
}
