import { evalExpr } from '../dsl/evalExpr.js'

// Control-flow instructions are not allowed as the nested instruction of IF_DO.
const CONTROL_FLOW_KINDS = new Set(['WAIT', 'JUMP', 'IF_JUMP', 'IF_DO'])

/**
 * @param {{ instructions: any[] }} program
 */
export function initBotVm(program) {
  return {
    program,
    pc: 1,
    waitRemaining: 0,
    timers: { 1: 0, 2: 0, 3: 0 },
    target: { botSelector: null, powerupType: null },
    moveGoal: null,
  }
}

/**
 * Execute exactly one VM tick.
 *
 * Semantics:
 * 1) Start-of-step: decrement timers >0 by 1.
 * 2) If waitRemaining>0: decrement by 1 and return early (no execution, pc unchanged).
 * 3) Execute current instruction at pc (1-indexed; invalid/out-of-range pc coerces to 1).
 * 4) Advance pc by default; JUMP/IF_JUMP override; IF_DO advances once.
 *
 * @param {ReturnType<typeof initBotVm>} vm
 * @param {any} observation
 * @returns {{ vm: ReturnType<typeof initBotVm>, effects: any[], debug: { pcBefore: number, pcAfter: number, executedKind: string|null, waiting: boolean } }}
 */
export function stepBotVm(vm, observation) {
  const instrs = vm?.program?.instructions ?? []
  const len = instrs.length

  const nextVm = {
    ...vm,
    timers: { ...vm.timers },
    target: { ...vm.target },
  }

  // 1) Start-of-step: decrement active timers.
  for (const t of [1, 2, 3]) {
    const v = nextVm.timers[t] ?? 0
    nextVm.timers[t] = v > 0 ? v - 1 : 0
  }

  // 2) Waiting blocks instruction execution.
  if ((nextVm.waitRemaining ?? 0) > 0) {
    const pcBefore = nextVm.pc
    nextVm.waitRemaining -= 1

    return {
      vm: nextVm,
      effects: [],
      debug: { pcBefore, pcAfter: nextVm.pc, executedKind: null, waiting: true },
    }
  }

  const pcBefore = normalizePc(nextVm.pc, len)
  nextVm.pc = pcBefore

  /** @type {any[]} */
  const effects = []

  const instr = len > 0 ? instrs[pcBefore - 1] : { kind: 'INVALID' }
  const kind = instr?.kind ?? 'INVALID'

  /** @type {number} */
  let pcAfter

  if (kind === 'JUMP') {
    pcAfter = normalizePc(instr.targetPc, len)
  } else if (kind === 'IF_JUMP') {
    const cond = evalCond(instr.expr, nextVm, observation)
    pcAfter = cond ? normalizePc(instr.targetPc, len) : advancePc(pcBefore, len)
  } else if (kind === 'IF_DO') {
    const cond = evalCond(instr.expr, nextVm, observation)

    if (cond) {
      const nested = instr.instruction
      const nestedKind = nested?.kind

      if (!CONTROL_FLOW_KINDS.has(nestedKind)) {
        execInstr(nested, nextVm, effects)
      }
    }

    pcAfter = advancePc(pcBefore, len)
  } else {
    execInstr(instr, nextVm, effects)
    pcAfter = advancePc(pcBefore, len)
  }

  nextVm.pc = normalizePc(pcAfter, len)

  return {
    vm: nextVm,
    effects,
    debug: { pcBefore, pcAfter: nextVm.pc, executedKind: kind, waiting: false },
  }
}

/**
 * @param {number} pc
 * @param {number} len
 */
function normalizePc(pc, len) {
  if (!len) return 1
  if (!Number.isInteger(pc) || pc < 1 || pc > len) return 1
  return pc
}

/**
 * @param {number} pc
 * @param {number} len
 */
function advancePc(pc, len) {
  if (!len) return 1
  const next = pc + 1
  return next > len ? 1 : next
}

/**
 * @param {any} expr
 * @param {ReturnType<typeof initBotVm>} vm
 * @param {any} observation
 */
function evalCond(expr, vm, observation) {
  const timers = { T1: vm.timers[1] ?? 0, T2: vm.timers[2] ?? 0, T3: vm.timers[3] ?? 0 }

  const ctx = {
    ...(observation && typeof observation === 'object' ? observation : {}),
    timers,
    hasTargetBot: vm?.target?.botSelector != null,
  }

  const r = evalExpr(expr, ctx)
  if (!r.ok) return false
  return Boolean(r.value)
}

/**
 * Execute a non-control-flow instruction.
 *
 * @param {any} instr
 * @param {ReturnType<typeof initBotVm>} vm
 * @param {any[]} effects
 */
function execInstr(instr, vm, effects) {
  const kind = instr?.kind ?? 'INVALID'

  if (kind === 'NOP' || kind === 'INVALID') return

  if (kind === 'WAIT') {
    const ticks = Number.isInteger(instr.ticks) ? instr.ticks : 0
    vm.waitRemaining = ticks > 0 ? ticks : 0
    return
  }

  if (kind === 'SET_TIMER') {
    const timer = instr.timer
    const ticks = Number.isInteger(instr.ticks) ? instr.ticks : 0
    if (timer === 1 || timer === 2 || timer === 3) vm.timers[timer] = ticks > 0 ? ticks : 0
    return
  }

  if (kind === 'CLEAR_TIMER') {
    const timer = instr.timer
    if (timer === 1 || timer === 2 || timer === 3) vm.timers[timer] = 0
    return
  }

  if (kind === 'SET_TARGET_BOT') {
    vm.target.botSelector = instr.selector ?? null
    vm.target.powerupType = null
    return
  }

  if (kind === 'SET_TARGET_POWERUP') {
    vm.target.powerupType = instr.type ?? null
    vm.target.botSelector = null
    return
  }

  if (kind === 'CLEAR_TARGET') {
    const which = instr.which ?? 'ALL'
    if (which === 'BOT' || which === 'ALL') vm.target.botSelector = null
    if (which === 'POWERUP' || which === 'ALL') vm.target.powerupType = null
    return
  }

  if (kind === 'MOVE_DIR') {
    effects.push({ kind: 'MOVE_DIR', dir: instr.dir })
    return
  }

  if (kind === 'SET_MOVE') {
    vm.moveGoal = instr.target ?? null
    effects.push({ kind: 'SET_MOVE', target: vm.moveGoal })
    return
  }

  if (kind === 'MOVE') {
    effects.push({ kind: 'MOVE', target: instr.target })
    return
  }

  if (kind === 'CLEAR_MOVE') {
    vm.moveGoal = null
    effects.push({ kind: 'CLEAR_MOVE' })
    return
  }

  if (kind === 'MODULE_TOGGLE') {
    effects.push({ kind: 'MODULE_TOGGLE', module: instr.module, on: Boolean(instr.on) })
    return
  }

  if (kind === 'USE_SLOT') {
    effects.push({ kind: 'USE_SLOT', slot: instr.slot, target: instr.target })
    return
  }

  if (kind === 'STOP_SLOT') {
    effects.push({ kind: 'STOP_SLOT', slot: instr.slot })
    return
  }

  // Unknown kinds are treated as INVALID.
}
