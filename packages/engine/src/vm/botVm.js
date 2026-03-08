import { evalExpr } from '../dsl/evalExpr.js'

const CONTROL_FLOW_KINDS = new Set(['JUMP', 'IF_JUMP', 'IF_DO'])
const TOP_LEVEL_KINDS = new Set([
  // control flow
  'JUMP',
  'IF_JUMP',
  'IF_DO',
  'NOP',
  'WAIT',

  // timing
  'SET_TIMER',
  'CLEAR_TIMER',

  // canonical targeting
  'SET_TARGET_BOT',
  'SET_TARGET_POWERUP',
  'CLEAR_TARGET',

  // canonical movement
  'MOVE_DIR',
  'SET_MOVE',
  'MOVE',
  'CLEAR_MOVE',

  // modules
  'MODULE_TOGGLE',
  'USE_SLOT',
  'STOP_SLOT',
])

/**
 * @typedef {1|2|3} Slot
 * @typedef {Record<Slot, string|null>} Loadout
 * @typedef {Record<Slot, boolean>} SlotActive
 *
 * @typedef {{
 *   program: { instructions: any[] },
 *   pc: number,
 *   waitRemaining: number,
 *   timers: { 1: number, 2: number, 3: number },
 *   target: { botSelector: any, powerupType: any },
 *   moveGoal: any,
 *
 *   // optional "simulation-facing" fields (used by expressions + module state):
 *   selfBotId?: string | null,
 *   loadout: Loadout,
 *   slotActive: SlotActive,
 *   bumpedBot?: boolean,
 * }} BotVm
 */

/**
 * @param {{ instructions: any[] }} program
 * @param {Partial<BotVm> & { loadout?: Partial<Loadout> | Record<string, string|null>, slotActive?: Partial<SlotActive> | Record<string, boolean> }} [init]
 * @returns {BotVm}
 */
export function initBotVm(program, init) {
  return {
    program,
    pc: Number.isInteger(init?.pc) ? /** @type {number} */ (init.pc) : 1,
    waitRemaining: asNonNegativeInt(init?.waitRemaining),
    timers: normalizeTimers(init?.timers),
    target: {
      botSelector: init?.target?.botSelector ?? null,
      powerupType: init?.target?.powerupType ?? null,
    },
    moveGoal: init?.moveGoal ?? null,

    selfBotId: init?.selfBotId ?? null,
    loadout: normalizeLoadout(init?.loadout),
    slotActive: normalizeSlotActive(init?.slotActive),
    bumpedBot: Boolean(init?.bumpedBot ?? false),
  }
}

/**
 * Exactly 1 tick per call.
 *
 * Key stable-v1 semantics:
 * - `pc` is 1-indexed into `program.instructions`.
 * - Normalize pc at tick start: invalid -> 1.
 * - Invalid runtime instruction: treat as NOP and reset pc to 1 next tick.
 * - WAIT is blocking. Recommended deterministic model:
 *   store `waitRemaining=<TICKS>` without advancing pc; decrement each tick;
 *   advance pc when it reaches 0.
 *   (This implies: executing `WAIT 2` leaves `waitRemaining==1` and `pc` unchanged after the tick.)
 * - Timers decrement at END of tick (min 0).
 *
 * @param {BotVm} vm
 * @param {any} obs
 * @returns {{
 *   vm: BotVm,
 *   effects: { movement?: any, modules?: any[] },
 *   exec: { pcBefore: number, pcAfter: number, kind: string, result: 'EXECUTED'|'NOP'|'ERROR', reason?: string },
 * }}
 */
export function stepBotVm(vm, obs) {
  const program = vm?.program ?? { instructions: [] }
  const instructions = Array.isArray(program.instructions) ? program.instructions : []
  const len = instructions.length

  /** @type {BotVm} */
  const nextVm = {
    ...vm,
    program,
    pc: Number.isInteger(vm?.pc) ? vm.pc : 1,
    waitRemaining: asNonNegativeInt(vm?.waitRemaining),
    timers: normalizeTimers(vm?.timers),
    target: {
      botSelector: vm?.target?.botSelector ?? null,
      powerupType: vm?.target?.powerupType ?? null,
    },
    moveGoal: vm?.moveGoal ?? null,

    selfBotId: vm?.selfBotId ?? null,
    loadout: normalizeLoadout(vm?.loadout),
    slotActive: normalizeSlotActive(vm?.slotActive),
    bumpedBot: Boolean(obs?.bumpedBot ?? vm?.bumpedBot ?? false),
  }

  nextVm.pc = normalizePc(nextVm.pc, len)
  const pcBefore = nextVm.pc

  const instr = getInstruction(instructions, pcBefore)
  const kind = getInstructionKind(instr)

  /** @type {{ movement?: any, modules?: any[] }} */
  const effects = {}

  /** @type {'EXECUTED'|'NOP'|'ERROR'} */
  let result = 'EXECUTED'
  /** @type {string|undefined} */
  let reason

  let pcAfter = pcBefore

  // Waiting blocks execution.
  if (nextVm.waitRemaining > 0) {
    result = 'NOP'
    reason = 'WAITING'
  } else if (!instr || kind === 'INVALID' || !TOP_LEVEL_KINDS.has(kind)) {
    // Invalid instruction policy.
    result = 'NOP'
    reason = 'INVALID_INSTRUCTION'
    pcAfter = 1
  } else if (kind === 'JUMP') {
    pcAfter = normalizePc(instr.targetPc, len)
  } else if (kind === 'IF_JUMP') {
    const cond = evalBoolExpr(instr.expr, nextVm, obs)
    if (!cond.ok) {
      result = 'ERROR'
      reason = cond.reason
    }
    pcAfter = cond.value ? normalizePc(instr.targetPc, len) : advancePc(pcBefore, len)
  } else if (kind === 'IF_DO') {
    const cond = evalBoolExpr(instr.expr, nextVm, obs)
    if (!cond.ok) {
      result = 'ERROR'
      reason = cond.reason
    }

    if (cond.value) {
      const nested = instr.instruction
      const nestedKind = getInstructionKind(nested)

      if (CONTROL_FLOW_KINDS.has(nestedKind)) {
        result = 'ERROR'
        reason = reason ?? 'INVALID_NESTED_INSTRUCTION'
      } else if (nestedKind === 'WAIT') {
        executeWait(nested, nextVm)
      } else {
        execAtomicInstruction(nested, nextVm, effects)
      }
    }

    pcAfter = advancePc(pcBefore, len)
  } else if (kind === 'WAIT') {
    const ticks = asNonNegativeInt(instr.ticks)
    if (ticks <= 0) {
      result = 'NOP'
      reason = 'WAIT_NONPOSITIVE'
      pcAfter = 1
    } else {
      executeWait(instr, nextVm)
      pcAfter = pcBefore
    }
  } else {
    // NOP or any other atomic instruction.
    if (kind === 'NOP') {
      result = 'NOP'
    } else {
      execAtomicInstruction(instr, nextVm, effects)
    }
    pcAfter = advancePc(pcBefore, len)
  }

  // End-of-tick WAIT maintenance.
  if (nextVm.waitRemaining > 0) {
    nextVm.waitRemaining -= 1
    if (nextVm.waitRemaining === 0) {
      pcAfter = advancePc(pcAfter, len)
    }
  }

  // End-of-tick timer decrement.
  for (const t of [1, 2, 3]) {
    const v = nextVm.timers[t] ?? 0
    nextVm.timers[t] = v > 0 ? v - 1 : 0
  }

  nextVm.pc = normalizePc(pcAfter, len)

  return {
    vm: nextVm,
    effects,
    exec: {
      pcBefore,
      pcAfter: nextVm.pc,
      kind,
      result,
      ...(reason ? { reason } : {}),
    },
  }
}

/** @param {any[]} instructions @param {number} pc */
function getInstruction(instructions, pc) {
  if (!Array.isArray(instructions) || instructions.length === 0) return null
  return instructions[pc - 1] ?? null
}

/** @param {any} instr */
function getInstructionKind(instr) {
  return instr && typeof instr === 'object' && typeof instr.kind === 'string' ? instr.kind : 'INVALID'
}

/** @param {unknown} v */
function asNonNegativeInt(v) {
  return Number.isInteger(v) && /** @type {number} */ (v) > 0 ? /** @type {number} */ (v) : 0
}

/** @param {any} timers */
function normalizeTimers(timers) {
  return {
    1: asNonNegativeInt(timers?.[1]),
    2: asNonNegativeInt(timers?.[2]),
    3: asNonNegativeInt(timers?.[3]),
  }
}

/**
 * @param {unknown} loadout
 * @returns {Loadout}
 */
function normalizeLoadout(loadout) {
  const l = loadout && typeof loadout === 'object' ? loadout : {}
  return {
    1: /** @type {any} */ (l)[1] ?? /** @type {any} */ (l).SLOT1 ?? null,
    2: /** @type {any} */ (l)[2] ?? /** @type {any} */ (l).SLOT2 ?? null,
    3: /** @type {any} */ (l)[3] ?? /** @type {any} */ (l).SLOT3 ?? null,
  }
}

/**
 * @param {unknown} slotActive
 * @returns {SlotActive}
 */
function normalizeSlotActive(slotActive) {
  const a = slotActive && typeof slotActive === 'object' ? slotActive : {}
  return {
    1: Boolean(/** @type {any} */ (a)[1] ?? /** @type {any} */ (a).SLOT1 ?? false),
    2: Boolean(/** @type {any} */ (a)[2] ?? /** @type {any} */ (a).SLOT2 ?? false),
    3: Boolean(/** @type {any} */ (a)[3] ?? /** @type {any} */ (a).SLOT3 ?? false),
  }
}

/**
 * @param {Loadout} loadout
 * @param {Slot} slot
 */
function getLoadoutModule(loadout, slot) {
  return loadout?.[slot] ?? null
}

/**
 * @param {Loadout} loadout
 * @param {string} module
 * @returns {Slot|0}
 */
function findSlotForModule(loadout, module) {
  for (const slot of /** @type {const} */ ([1, 2, 3])) {
    if (getLoadoutModule(loadout, slot) === module) return slot
  }
  return 0
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
 * @param {any} instr
 * @param {BotVm} vm
 */
function executeWait(instr, vm) {
  const ticks = asNonNegativeInt(instr?.ticks)
  vm.waitRemaining = ticks
}

/**
 * @param {any} expr
 * @param {BotVm} vm
 * @param {any} obs
 */
function evalBoolExpr(expr, vm, obs) {
  const slotActive = (slot) => {
    if (typeof obs?.slotActive === 'function') return Boolean(obs.slotActive(slot))

    if (obs?.slotActive && typeof obs.slotActive === 'object') {
      const v = obs.slotActive[`SLOT${slot}`] ?? obs.slotActive[slot]
      if (v !== undefined) return Boolean(v)
    }

    return Boolean(vm?.slotActive?.[slot] ?? false)
  }

  const slotReady = (slot) => {
    if (typeof obs?.slotReady === 'function') return Boolean(obs.slotReady(slot))

    if (obs?.slotReady && typeof obs.slotReady === 'object') {
      const v = obs.slotReady[`SLOT${slot}`] ?? obs.slotReady[slot]
      if (v !== undefined) return Boolean(v)
    }

    return false
  }

  const ctx = {
    vars: obs?.vars,
    getVar: obs?.getVar,
    powerups: obs?.powerups,
    botsAlive: obs?.botsAlive,
    zone: obs?.zone,
    distToClosestBot: obs?.distToClosestBot,
    functions: obs?.functions,

    timers: {
      T1: vm.timers[1] ?? 0,
      T2: vm.timers[2] ?? 0,
      T3: vm.timers[3] ?? 0,
    },
    timerRemaining: (timer) => vm.timers[timer] ?? 0,

    slotReady,
    slotActive,

    hasTargetBot: Boolean(vm?.target?.botSelector != null),
    bumpedBot: Boolean(obs?.bumpedBot ?? vm?.bumpedBot ?? false),
  }

  const r = evalExpr(expr, ctx)
  if (!r.ok) return { ok: false, value: false, reason: `${r.error.code}: ${r.error.message}` }
  return { ok: true, value: Boolean(r.value) }
}

/**
 * Execute a non-control-flow instruction.
 *
 * @param {any} instr
 * @param {BotVm} vm
 * @param {{ movement?: any, modules?: any[] }} effects
 */
function execAtomicInstruction(instr, vm, effects) {
  const kind = getInstructionKind(instr)

  if (kind === 'NOP' || kind === 'INVALID') return

  // Timing (non-blocking).
  if (kind === 'SET_TIMER') {
    const timer = instr.timer
    const ticks = asNonNegativeInt(instr.ticks)
    if (timer === 1 || timer === 2 || timer === 3) vm.timers[timer] = ticks
    return
  }

  if (kind === 'CLEAR_TIMER') {
    const timer = instr.timer
    if (timer === 1 || timer === 2 || timer === 3) vm.timers[timer] = 0
    return
  }

  // Targets.
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

  // Movement.
  if (kind === 'MOVE_DIR') {
    effects.movement = { kind: 'MOVE_DIR', dir: instr.dir }
    return
  }

  if (kind === 'SET_MOVE') {
    vm.moveGoal = instr.target ?? null
    effects.movement = { kind: 'SET_MOVE', target: vm.moveGoal }
    return
  }

  if (kind === 'MOVE') {
    effects.movement = { kind: 'MOVE', target: instr.target }
    return
  }

  if (kind === 'CLEAR_MOVE') {
    vm.moveGoal = null
    effects.movement = { kind: 'CLEAR_MOVE' }
    return
  }

  // Modules.
  if (kind === 'MODULE_TOGGLE') {
    const module = instr.module
    const on = Boolean(instr.on)

    const slot = findSlotForModule(vm.loadout, module)
    if (!slot) return // not equipped

    if (module === 'SAW' || module === 'SHIELD') vm.slotActive[slot] = on

    if (!effects.modules) effects.modules = []
    effects.modules.push({ kind: 'MODULE_TOGGLE', module, on })
    return
  }

  if (kind === 'USE_SLOT') {
    const slot = instr.slot
    if (slot !== 1 && slot !== 2 && slot !== 3) return

    const module = getLoadoutModule(vm.loadout, slot)
    if (!module) return // empty slot

    if (module === 'SAW' || module === 'SHIELD') vm.slotActive[slot] = true

    if (!effects.modules) effects.modules = []
    effects.modules.push({ kind: 'USE_SLOT', slot, target: instr.target })
    return
  }

  if (kind === 'STOP_SLOT') {
    const slot = instr.slot
    if (slot !== 1 && slot !== 2 && slot !== 3) return

    // Stable v1: STOP_SLOT turns "active" modules off. Even for non-toggle modules,
    // clearing our local active-flag is safe + keeps SLOT_ACTIVE deterministic.
    vm.slotActive[slot] = false

    const module = getLoadoutModule(vm.loadout, slot)
    if (!module) return // empty slot

    if (!effects.modules) effects.modules = []
    effects.modules.push({ kind: 'STOP_SLOT', slot })
    return
  }

  // Unknown kinds are treated as INVALID at runtime (handled by caller).
}
