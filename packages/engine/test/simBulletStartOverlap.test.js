import test from 'node:test'
import assert from 'node:assert/strict'

import { stepBullets } from '../src/sim/bulletSim.js'

function mkBot(botId, pos) {
  return {
    botId,
    pos,
    hp: 100,
    alive: true,
    shieldActive: false,
    armorEquipped: false,
    lastDamageByBotId: null,
  }
}

test('stepBullets: detects start-of-tick overlap by sampling fromPos', () => {
  // Victim bot AABB is centered at (50,50) with half-size 8.
  // Bullet starts exactly on the right boundary (x=58) and moves right.
  // If collision sampling excludes the starting point, the first checked point
  // would be (59,50) which is already outside the AABB.
  const bots = [
    mkBot('BOT1', { x: 50, y: 50 }),
    mkBot('BOT2', { x: 16, y: 16 }),
    mkBot('BOT3', { x: 16, y: 176 }),
    mkBot('BOT4', { x: 176, y: 176 }),
  ]

  const bullets = [
    {
      bulletId: 'B1',
      ownerBotId: 'BOT2',
      pos: { x: 58, y: 50 },
      vel: { x: 16, y: 0 },
      ttl: 18,
    },
  ]

  const tickEvents = []
  const next = stepBullets(bullets, bots, tickEvents)

  assert.equal(next.length, 0, 'expected bullet to despawn on immediate hit')

  const move = tickEvents.find((e) => e.type === 'BULLET_MOVE')
  const hit = tickEvents.find((e) => e.type === 'BULLET_HIT')
  const despawn = tickEvents.find((e) => e.type === 'BULLET_DESPAWN')

  assert.ok(move, 'expected BULLET_MOVE')
  assert.ok(hit, 'expected BULLET_HIT')
  assert.ok(despawn, 'expected BULLET_DESPAWN')

  assert.deepStrictEqual(hit.hitPos, { x: 58, y: 50 })
  assert.deepStrictEqual(move.toPos, { x: 58, y: 50 })
  assert.deepStrictEqual(despawn.pos, { x: 58, y: 50 })
  assert.equal(despawn.reason, 'HIT')
  assert.equal(hit.victimBotId, 'BOT1')
})
