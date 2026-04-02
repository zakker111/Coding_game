import test from 'node:test'
import assert from 'node:assert/strict'

import { BULLET_DAMAGE, SLOT_IDS } from '../src/sim/constants.js'
import { stepBullets } from '../src/sim/bulletSim.js'

function makeBot(botId, pos, overrides = {}) {
  return {
    botId,
    alive: true,
    pos,
    hp: 100,
    shieldActive: false,
    armorEquipped: false,
    lastDamageByBotId: null,
    ...overrides,
  }
}

function makeBots(overrides = {}) {
  return SLOT_IDS.map((botId, index) => {
    const basePos = { x: 160 + index * 8, y: 32 + index * 8 }
    const botOverrides = overrides[botId] ?? {}
    return makeBot(botId, botOverrides.pos ?? basePos, botOverrides)
  })
}

test('stepBullets: resolves the earliest bot hit along the segment', () => {
  const bots = makeBots({
    BOT1: { pos: { x: 75, y: 107 } },
    BOT2: { pos: { x: 67, y: 110 } },
    BOT4: { pos: { x: 170, y: 170 } },
  })

  const bullet = {
    bulletId: 'bullet-earliest-bot',
    ownerBotId: 'BOT4',
    pos: { x: 81, y: 117 },
    vel: { x: -13, y: -4 },
    ttl: 5,
  }

  const tickEvents = []
  const next = stepBullets([bullet], bots, tickEvents)

  assert.deepStrictEqual(next, [])
  assert.equal(tickEvents[0]?.type, 'BULLET_MOVE')
  assert.deepStrictEqual(tickEvents[0]?.fromPos, { x: 81, y: 117 })

  const hit = tickEvents.find((e) => e.type === 'BULLET_HIT')
  assert.ok(hit, 'expected a BULLET_HIT event')
  assert.equal(hit.victimBotId, 'BOT2', 'expected the earliest continuous collision to win')

  const damage = tickEvents.find((e) => e.type === 'DAMAGE')
  assert.deepStrictEqual(damage, {
    type: 'DAMAGE',
    victimBotId: 'BOT2',
    amount: BULLET_DAMAGE,
    source: 'BULLET',
    sourceBotId: 'BOT4',
    kind: 'DIRECT',
    sourceRef: { type: 'BULLET', id: 'bullet-earliest-bot' },
  })

  assert.deepStrictEqual(tickEvents.at(-1), {
    type: 'BULLET_DESPAWN',
    bulletId: 'bullet-earliest-bot',
    reason: 'HIT',
    pos: hit.hitPos,
  })
})

test('stepBullets: bot hit wins before a later wall exit near the arena edge', () => {
  const bots = makeBots({
    BOT2: { pos: { x: 8, y: 183 } },
  })

  const bullet = {
    bulletId: 'bullet-bot-before-wall',
    ownerBotId: 'BOT1',
    pos: { x: 20, y: 178 },
    vel: { x: -16, y: 4 },
    ttl: 5,
  }

  const tickEvents = []
  const next = stepBullets([bullet], bots, tickEvents)

  assert.deepStrictEqual(next, [])
  assert.deepStrictEqual(tickEvents, [
    {
      type: 'BULLET_MOVE',
      bulletId: 'bullet-bot-before-wall',
      fromPos: { x: 20, y: 178 },
      toPos: { x: 16, y: 179 },
    },
    {
      type: 'BULLET_HIT',
      bulletId: 'bullet-bot-before-wall',
      victimBotId: 'BOT2',
      damage: BULLET_DAMAGE,
      hitPos: { x: 16, y: 179 },
    },
    {
      type: 'DAMAGE',
      victimBotId: 'BOT2',
      amount: BULLET_DAMAGE,
      source: 'BULLET',
      sourceBotId: 'BOT1',
      kind: 'DIRECT',
      sourceRef: { type: 'BULLET', id: 'bullet-bot-before-wall' },
    },
    {
      type: 'BULLET_DESPAWN',
      bulletId: 'bullet-bot-before-wall',
      reason: 'HIT',
      pos: { x: 16, y: 179 },
    },
  ])
})

test('stepBullets: lower bot id wins an equal-time collision tie', () => {
  const bots = makeBots({
    BOT1: { pos: { x: 120, y: 88 } },
    BOT2: { pos: { x: 120, y: 104 } },
    BOT4: { pos: { x: 24, y: 24 } },
  })

  const bullet = {
    bulletId: 'bullet-equal-time-tie',
    ownerBotId: 'BOT4',
    pos: { x: 96, y: 96 },
    vel: { x: 16, y: 0 },
    ttl: 5,
  }

  const tickEvents = []
  const next = stepBullets([bullet], bots, tickEvents)

  assert.deepStrictEqual(next, [])

  const hit = tickEvents.find((e) => e.type === 'BULLET_HIT')
  assert.ok(hit, 'expected a BULLET_HIT event')
  assert.equal(hit.victimBotId, 'BOT1')
  assert.deepStrictEqual(hit.hitPos, { x: 112, y: 96 })
  assert.deepStrictEqual(tickEvents.at(-1), {
    type: 'BULLET_DESPAWN',
    bulletId: 'bullet-equal-time-tie',
    reason: 'HIT',
    pos: { x: 112, y: 96 },
  })
})

test('stepBullets: wall despawn emits an explicit reason and clamped position', () => {
  const bots = makeBots()
  const bullet = {
    bulletId: 'bullet-wall',
    ownerBotId: 'BOT1',
    pos: { x: 2, y: 10 },
    vel: { x: -8, y: 0 },
    ttl: 5,
  }

  const tickEvents = []
  const next = stepBullets([bullet], bots, tickEvents)

  assert.deepStrictEqual(next, [])
  assert.deepStrictEqual(tickEvents, [
    {
      type: 'BULLET_MOVE',
      bulletId: 'bullet-wall',
      fromPos: { x: 2, y: 10 },
      toPos: { x: 0, y: 10 },
    },
    {
      type: 'BULLET_DESPAWN',
      bulletId: 'bullet-wall',
      reason: 'WALL',
      pos: { x: 0, y: 10 },
    },
  ])
})

test('stepBullets: ttl despawn emits an explicit reason and final position', () => {
  const bots = makeBots()
  const bullet = {
    bulletId: 'bullet-ttl',
    ownerBotId: 'BOT1',
    pos: { x: 50, y: 50 },
    vel: { x: 3, y: 4 },
    ttl: 1,
  }

  const tickEvents = []
  const next = stepBullets([bullet], bots, tickEvents)

  assert.deepStrictEqual(next, [])
  assert.deepStrictEqual(tickEvents, [
    {
      type: 'BULLET_MOVE',
      bulletId: 'bullet-ttl',
      fromPos: { x: 50, y: 50 },
      toPos: { x: 53, y: 54 },
    },
    {
      type: 'BULLET_DESPAWN',
      bulletId: 'bullet-ttl',
      reason: 'TTL',
      pos: { x: 53, y: 54 },
    },
  ])
})
