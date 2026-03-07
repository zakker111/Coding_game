import test from 'node:test'
import assert from 'node:assert/strict'

import { generateSampleReplay } from '../src/index.js'

function positionsByBotId(replay) {
  /** @type {Record<string, {x:number,y:number}>} */
  const out = {}
  for (const b of replay.state[0].bots) out[b.botId] = b.pos
  return out
}

test('generateSampleReplay is deterministic for a given seed', () => {
  const a = generateSampleReplay(12345)
  const b = generateSampleReplay(12345)

  assert.deepStrictEqual(a, b)
})

test('generateSampleReplay changes output when seed changes', () => {
  const a = generateSampleReplay(12345)
  const b = generateSampleReplay(12346)

  assert.notDeepStrictEqual(a, b)
})

test('generateSampleReplay spawns bots in the 4 corner anchors', () => {
  const replay = generateSampleReplay(12345)

  assert.deepStrictEqual(positionsByBotId(replay), {
    BOT1: { x: 16, y: 16 },
    BOT2: { x: 176, y: 16 },
    BOT3: { x: 16, y: 176 },
    BOT4: { x: 176, y: 176 },
  })
})

test('generateSampleReplay does not change spawns based on bot scripts', () => {
  const seed = 12345

  const bots = [
    { slotId: 'BOT1', sourceText: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n' },
    { slotId: 'BOT2', sourceText: 'LABEL LOOP\nSAW ON\nWAIT 1\nGOTO LOOP\n' },
    { slotId: 'BOT3', sourceText: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n' },
    { slotId: 'BOT4', sourceText: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n' },
  ]

  const replay = generateSampleReplay(seed, { bots })

  assert.deepStrictEqual(positionsByBotId(replay), {
    BOT1: { x: 16, y: 16 },
    BOT2: { x: 176, y: 16 },
    BOT3: { x: 16, y: 176 },
    BOT4: { x: 176, y: 176 },
  })
})

function oppositeDir(dir) {
  switch (dir) {
    case 'UP':
      return 'DOWN'
    case 'DOWN':
      return 'UP'
    case 'LEFT':
      return 'RIGHT'
    case 'RIGHT':
      return 'LEFT'
    case 'UP_LEFT':
      return 'DOWN_RIGHT'
    case 'UP_RIGHT':
      return 'DOWN_LEFT'
    case 'DOWN_LEFT':
      return 'UP_RIGHT'
    case 'DOWN_RIGHT':
      return 'UP_LEFT'
    default:
      return dir
  }
}

function botsOverlap16(a, b) {
  return Math.abs(a.x - b.x) < 16 && Math.abs(a.y - b.y) < 16
}

test('generateSampleReplay can produce BUMP_BOT events', () => {
  const replay = generateSampleReplay(12345)

  const bumpBot = replay.events.flat().filter((e) => e.type === 'BUMP_BOT')
  assert.ok(bumpBot.length > 0)
})

test('generateSampleReplay: BUMP_BOT events are paired and bots never overlap', () => {
  const tickCap = 120
  const replay = generateSampleReplay(12345, { tickCap })

  for (let t = 1; t < replay.events.length; t++) {
    const tickEvents = replay.events[t]

    for (const e of tickEvents) {
      if (e.type !== 'BUMP_BOT') continue
      const bump = /** @type {any} */ (e)

      const hasCounterpart = tickEvents.some((other) => {
        if (other.type !== 'BUMP_BOT') return false
        const o = /** @type {any} */ (other)
        return (
          o.botId === bump.otherBotId &&
          o.otherBotId === bump.botId &&
          o.dir === oppositeDir(bump.dir)
        )
      })

      assert.ok(hasCounterpart)
    }
  }

  for (const tickState of replay.state) {
    const alive = tickState.bots.filter((b) => b.alive)

    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        assert.equal(botsOverlap16(alive[i].pos, alive[j].pos), false)
      }
    }
  }
})

test('generateSampleReplay can produce SAW events', () => {
  const replay = generateSampleReplay(12345)

  const flatEvents = replay.events.flat()

  const hasSawDamage = flatEvents.some((e) => e.type === 'DAMAGE' && e.source === 'SAW')
  const hasSawToggleExec = flatEvents.some(
    (e) =>
      e.type === 'BOT_EXEC' &&
      typeof /** @type {any} */ (e).instrText === 'string' &&
      /^SAW\s+(ON|OFF)\b/i.test(/** @type {any} */ (e).instrText)
  )

  assert.ok(hasSawDamage || hasSawToggleExec)
})
