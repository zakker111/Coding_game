import test from 'node:test'
import assert from 'node:assert/strict'

import { initBotVm, stepBotVm } from '../src/vm/botVm.js'
import { parseExpression } from '../src/dsl/expr.js'

test('botVm: pc increments and wraps (len=2)', () => {
  const program = { instructions: [{ kind: 'NOP' }, { kind: 'NOP' }] }
  let vm = initBotVm(program)

  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.pc, 2)

  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.pc, 1)
})

test('botVm: JUMP sets pc to targetPc', () => {
  const program = {
    instructions: [{ kind: 'JUMP', targetPc: 2 }, { kind: 'NOP' }],
  }

  const vm = initBotVm(program)
  const r = stepBotVm(vm, {})

  assert.equal(r.debug.executedKind, 'JUMP')
  assert.equal(r.vm.pc, 2)
})

test('botVm: WAIT 2 blocks the next 2 ticks and pc stays unchanged while waiting', () => {
  const program = { instructions: [{ kind: 'WAIT', ticks: 2 }, { kind: 'NOP' }] }
  let vm = initBotVm(program)

  // Execute WAIT.
  let r = stepBotVm(vm, {})
  vm = r.vm
  assert.equal(vm.waitRemaining, 2)
  assert.equal(vm.pc, 2)
  assert.equal(r.debug.waiting, false)

  // Tick 1 waiting.
  r = stepBotVm(vm, {})
  vm = r.vm
  assert.equal(r.debug.waiting, true)
  assert.equal(r.debug.executedKind, null)
  assert.equal(vm.pc, 2)
  assert.equal(vm.waitRemaining, 1)

  // Tick 2 waiting.
  r = stepBotVm(vm, {})
  vm = r.vm
  assert.equal(r.debug.waiting, true)
  assert.equal(vm.pc, 2)
  assert.equal(vm.waitRemaining, 0)

  // Next tick executes NOP.
  r = stepBotVm(vm, {})
  assert.equal(r.debug.waiting, false)
  assert.equal(r.debug.executedKind, 'NOP')
  assert.equal(r.vm.pc, 1)
})

test('botVm: SET_TIMER decrements at start-of-step', () => {
  const program = { instructions: [{ kind: 'SET_TIMER', timer: 1, ticks: 3 }, { kind: 'NOP' }] }
  let vm = initBotVm(program)

  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.timers[1], 3)

  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.timers[1], 2)
})

test('botVm: timers decrement and TIMER_DONE(T1) is observable next tick (IF_DO + PING())', () => {
  let pings = 0

  const program = {
    instructions: [
      { kind: 'SET_TIMER', timer: 1, ticks: 1 },
      {
        kind: 'IF_DO',
        expr: parseExpression('TIMER_DONE(T1) && PING()'),
        instruction: { kind: 'NOP' },
      },
    ],
  }

  let vm = initBotVm(program)

  // Step 1: set timer to 1.
  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.pc, 2)
  assert.equal(vm.timers[1], 1)

  // Step 2: timer decrements to 0 at start-of-step; IF_DO sees TIMER_DONE(T1).
  ;({ vm } = stepBotVm(vm, {
    functions: {
      PING() {
        pings++
        return 1
      },
    },
  }))

  assert.equal(vm.timers[1], 0)
  assert.equal(pings, 1)
})

test('botVm: IF_DO executes nested instruction when condition true (TIMER_ACTIVE)', () => {
  const program = {
    instructions: [
      { kind: 'SET_TIMER', timer: 1, ticks: 2 },
      {
        kind: 'IF_DO',
        expr: parseExpression('TIMER_ACTIVE(T1)'),
        instruction: { kind: 'MOVE_DIR', dir: 'UP' },
      },
      { kind: 'NOP' },
    ],
  }

  let vm = initBotVm(program)

  // Step 1: set timer.
  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.pc, 2)
  assert.equal(vm.timers[1], 2)

  // Step 2: timer decrements to 1, IF_DO true, emits MOVE_DIR.
  const r = stepBotVm(vm, {})
  assert.equal(r.vm.timers[1], 1)
  assert.deepStrictEqual(r.effects, [{ kind: 'MOVE_DIR', dir: 'UP' }])
  assert.equal(r.vm.pc, 3)
})

test('botVm: IF_JUMP short-circuit (HEALTH < 10 || UNKNOWN()) does not call UNKNOWN()', () => {
  let calls = 0

  const program = {
    instructions: [
      {
        kind: 'IF_JUMP',
        expr: parseExpression('HEALTH < 10 || UNKNOWN()'),
        targetPc: 2,
      },
      { kind: 'NOP' },
    ],
  }

  const vm = initBotVm(program)
  const r = stepBotVm(vm, {
    vars: { HEALTH: 5 },
    functions: {
      UNKNOWN() {
        calls++
        return 1
      },
    },
  })

  assert.equal(r.vm.pc, 2)
  assert.equal(calls, 0)
})

test('botVm: IF_JUMP true jumps to targetPc', () => {
  const program = {
    instructions: [
      { kind: 'IF_JUMP', expr: parseExpression('1 == 1'), targetPc: 2 },
      { kind: 'NOP' },
    ],
  }

  const vm = initBotVm(program)
  const r = stepBotVm(vm, {})
  assert.equal(r.debug.executedKind, 'IF_JUMP')
  assert.equal(r.vm.pc, 2)
})
