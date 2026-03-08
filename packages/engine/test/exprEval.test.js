import test from 'node:test'
import assert from 'node:assert/strict'

import { evalExpr } from '../src/dsl/evalExpr.js'

test('evalExpr: smoke test (HEALTH < 45 && POWERUP_EXISTS(HEALTH))', () => {
  const ctx = {
    vars: {
      HEALTH: 40,
    },
    powerups: new Set(['HEALTH']),
  }

  const r = evalExpr('HEALTH < 45 && POWERUP_EXISTS(HEALTH)', ctx)
  assert.deepStrictEqual(r, { ok: true, value: true })
})

test('evalExpr: short-circuit (0 == 1 && UNKNOWN()) does not call UNKNOWN()', () => {
  let calls = 0

  const ctx = {
    functions: {
      UNKNOWN() {
        calls++
        return true
      },
    },
  }

  const r = evalExpr('0 == 1 && UNKNOWN()', ctx)
  assert.deepStrictEqual(r, { ok: true, value: false })
  assert.equal(calls, 0)
})

test('evalExpr: BOT_ALIVE + unary !', () => {
  const ctx = {
    botsAlive: {
      BOT1: false,
    },
  }

  const r = evalExpr('!BOT_ALIVE(BOT1)', ctx)
  assert.deepStrictEqual(r, { ok: true, value: true })
})

test('evalExpr: TIMER semantics (TIMER_DONE && !TIMER_ACTIVE)', () => {
  const ctx = {
    timers: {
      T1: 0,
    },
  }

  const r = evalExpr('TIMER_DONE(T1) && !TIMER_ACTIVE(T1)', ctx)
  assert.deepStrictEqual(r, { ok: true, value: true })
})

test('evalExpr: SLOT_READY(SLOT1) uses token args', () => {
  const ctx = {
    slotReady(slot) {
      return slot === 1
    },
  }

  const r = evalExpr('SLOT_READY(SLOT1)', ctx)
  assert.deepStrictEqual(r, { ok: true, value: true })
})

test('evalExpr: DIST_TO_CLOSEST_BOT returns an int', () => {
  const ctx = {
    distToClosestBot: 12,
  }

  const r = evalExpr('DIST_TO_CLOSEST_BOT() <= 12', ctx)
  assert.deepStrictEqual(r, { ok: true, value: true })
})

test('evalExpr: unknown identifier returns {ok:false} (does not throw)', () => {
  assert.doesNotThrow(() => {
    const r = evalExpr('NOT_A_REAL_IDENTIFIER == 1', {})
    assert.equal(r.ok, false)
    assert.equal(r.error.code, 'UNKNOWN_IDENTIFIER')
  })
})
