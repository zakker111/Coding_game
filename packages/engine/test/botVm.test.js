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

  assert.equal(r.exec.kind, 'JUMP')
  assert.equal(r.exec.result, 'EXECUTED')
  assert.equal(r.exec.pcAfter, 2)
  assert.equal(r.vm.pc, 2)
})

test('botVm: WAIT semantics (WAIT 2)', () => {
  const program = { instructions: [{ kind: 'WAIT', ticks: 2 }, { kind: 'NOP' }] }
  let vm = initBotVm(program)

  // Step 1: execute WAIT 2.
  let r = stepBotVm(vm, {})
  vm = r.vm
  assert.equal(r.exec.kind, 'WAIT')
  assert.equal(vm.waitRemaining, 1)
  assert.equal(vm.pc, 1)

  // Step 2: waiting tick decrements and advances when done.
  r = stepBotVm(vm, {})
  vm = r.vm
  assert.equal(r.exec.result, 'NOP')
  assert.equal(r.exec.reason, 'WAITING')
  assert.equal(vm.waitRemaining, 0)
  assert.equal(vm.pc, 2)

  // Step 3: NOP executes and pc wraps.
  r = stepBotVm(vm, {})
  assert.equal(r.exec.kind, 'NOP')
  assert.equal(r.vm.pc, 1)
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

  assert.equal(r.exec.kind, 'IF_JUMP')
  assert.equal(r.exec.pcAfter, 2)
  assert.equal(r.vm.pc, 2)
  assert.equal(calls, 0)
})

test('botVm: timers decrement end-of-tick + TIMER_DONE observable next tick (IF_DO + PING())', () => {
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

  // Step 1: set timer to 1; end-of-tick decrement makes it 0.
  ;({ vm } = stepBotVm(vm, {}))
  assert.equal(vm.pc, 2)
  assert.equal(vm.timers[1], 0)

  // Step 2: TIMER_DONE(T1) is true; PING runs once.
  ;({ vm } = stepBotVm(vm, {
    functions: {
      PING() {
        pings++
        return 1
      },
    },
  }))

  assert.equal(pings, 1)
})
