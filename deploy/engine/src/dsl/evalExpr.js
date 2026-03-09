import { parseExpression } from './expr.js'

/**
 * @typedef {import('./expr.js').Expr} Expr
 *
 * @typedef {(
 *   | { ok: true, value: number | boolean }
 *   | { ok: false, error: { code: string, message: string } }
 * )} EvalResult
 */

/**
 * Evaluation context for expression execution.
 *
 * This is intentionally small + mock-friendly. The VM/sim layer can provide
 * these values from current game state.
 *
 * All numeric values MUST be integers.
 *
 * @typedef {object} EvalCtx
 * @property {Record<string, number>} [vars] Integer variables, e.g. { HEALTH, AMMO, ENERGY }.
 * @property {(name: string) => (number | undefined)} [getVar]
 *
 * @property {Set<string> | Record<string, boolean> | ((type: string) => boolean)} [powerups]
 * Convenience: if provided as Set/Record, used by POWERUP_EXISTS.
 * @property {(type: 'HEALTH'|'AMMO'|'ENERGY') => boolean} [powerupExists]
 *
 * @property {Record<string, boolean> | ((botId: 'BOT1'|'BOT2'|'BOT3'|'BOT4') => boolean)} [botsAlive]
 * Convenience: if provided as Record, used by BOT_ALIVE.
 * @property {(botId: 'BOT1'|'BOT2'|'BOT3'|'BOT4') => boolean} [botAlive]
 *
 * @property {number} [zone] Current zone id (1..4).
 * @property {(zone: 1|2|3|4) => boolean} [inZone]
 *
 * @property {number | (() => number)} [distToClosestBot] Integer distance for DIST_TO_CLOSEST_BOT().
 *
 * @property {Record<string, number> | ((timer: 1|2|3) => number)} [timers]
 * Convenience: if provided as Record keyed by T1/T2/T3, used by TIMER_*.
 * @property {(timer: 1|2|3) => number} [timerRemaining]
 *
 * @property {Record<string, boolean> | ((slot: 1|2|3) => boolean)} [slotReady]
 * @property {Record<string, boolean> | ((slot: 1|2|3) => boolean)} [slotActive]
 *
 * @property {boolean | (() => boolean)} [hasTargetBot]
 * @property {boolean | (() => boolean)} [bumpedBot]
 *
 * @property {Record<string, (...args: (number|boolean)[]) => (number|boolean)>} [functions]
 * Escape hatch for future pure helper functions not yet hard-coded here.
 */

/**
 * Evaluate a stable-v1 expression.
 *
 * Runtime should call this with a pre-parsed AST (not source text) for
 * performance. String input is supported for tests and tooling.
 *
 * @param {Expr | string} exprOrSource
 * @param {EvalCtx} ctx
 * @returns {EvalResult}
 */
export function evalExpr(exprOrSource, ctx) {
  /** @type {Expr} */
  let expr

  if (typeof exprOrSource === 'string') {
    try {
      expr = parseExpression(exprOrSource)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return err('PARSE_ERROR', message)
    }
  } else {
    expr = exprOrSource
  }

  return evalNode(expr, ctx)
}

/** @param {number | boolean} value */
function ok(value) {
  return { ok: true, value }
}

/** @param {string} code @param {string} message */
function err(code, message) {
  return { ok: false, error: { code, message } }
}

/** @param {unknown} v */
function isInt(v) {
  return typeof v === 'number' && Number.isSafeInteger(v)
}

/**
 * @param {Expr} node
 * @param {EvalCtx} ctx
 * @returns {EvalResult}
 */
function evalNode(node, ctx) {
  if (node.type === 'IntLiteral') return ok(node.value)

  if (node.type === 'Identifier') {
    const name = node.name.toUpperCase()
    const v = resolveIdentifier(ctx, name)
    if (v == null) return err('UNKNOWN_IDENTIFIER', `Unknown identifier: ${name}`)
    if (!isInt(v)) return err('TYPE_ERROR', `Identifier ${name} is not an int`)
    return ok(v)
  }

  if (node.type === 'UnaryExpression') {
    if (node.operator !== '!') return err('UNSUPPORTED_OPERATOR', `Unsupported unary operator: ${node.operator}`)

    const r = evalBool(node.argument, ctx)
    if (!r.ok) return r
    return ok(!r.value)
  }

  if (node.type === 'BinaryExpression') {
    const op = node.operator

    if (op === '&&') {
      const left = evalBool(node.left, ctx)
      if (!left.ok) return left
      if (!left.value) return ok(false)

      const right = evalBool(node.right, ctx)
      if (!right.ok) return right
      return ok(left.value && right.value)
    }

    if (op === '||') {
      const left = evalBool(node.left, ctx)
      if (!left.ok) return left
      if (left.value) return ok(true)

      const right = evalBool(node.right, ctx)
      if (!right.ok) return right
      return ok(left.value || right.value)
    }

    const left = evalInt(node.left, ctx)
    if (!left.ok) return left

    const right = evalInt(node.right, ctx)
    if (!right.ok) return right

    if (op === '==') return ok(left.value === right.value)
    if (op === '!=') return ok(left.value !== right.value)
    if (op === '<') return ok(left.value < right.value)
    if (op === '<=') return ok(left.value <= right.value)
    if (op === '>') return ok(left.value > right.value)
    if (op === '>=') return ok(left.value >= right.value)

    return err('UNSUPPORTED_OPERATOR', `Unsupported binary operator: ${op}`)
  }

  if (node.type === 'CallExpression') {
    const fn = node.callee.name.toUpperCase()

    // Built-ins with token args.
    if (fn === 'POWERUP_EXISTS') {
      if (node.arguments.length !== 1) return err('ARITY', 'POWERUP_EXISTS expects 1 argument')
      const type = evalTokenArg(node.arguments[0])
      if (!type.ok) return type
      return ok(Boolean(resolvePowerupExists(ctx, type.value)))
    }

    if (fn === 'BOT_ALIVE') {
      if (node.arguments.length !== 1) return err('ARITY', 'BOT_ALIVE expects 1 argument')
      const bot = evalTokenArg(node.arguments[0])
      if (!bot.ok) return bot
      return ok(Boolean(resolveBotAlive(ctx, bot.value)))
    }

    if (fn === 'IN_ZONE') {
      if (node.arguments.length !== 1) return err('ARITY', 'IN_ZONE expects 1 argument')
      const zone = evalInt(node.arguments[0], ctx)
      if (!zone.ok) return zone
      if (zone.value !== 1 && zone.value !== 2 && zone.value !== 3 && zone.value !== 4) {
        return err('RANGE', 'IN_ZONE zone must be 1..4')
      }
      return ok(Boolean(resolveInZone(ctx, /** @type {1|2|3|4} */ (zone.value))))
    }

    if (fn === 'DIST_TO_CLOSEST_BOT') {
      if (node.arguments.length !== 0) return err('ARITY', 'DIST_TO_CLOSEST_BOT expects 0 arguments')
      const d = resolveDistToClosestBot(ctx)
      if (!isInt(d)) return err('MISSING', 'DIST_TO_CLOSEST_BOT not available in ctx')
      return ok(d)
    }

    if (fn === 'SLOT_READY') {
      if (node.arguments.length !== 1) return err('ARITY', 'SLOT_READY expects 1 argument')
      const slotTok = evalTokenArg(node.arguments[0])
      if (!slotTok.ok) return slotTok
      const slot = parseSlotToken(slotTok.value)
      if (!slot) return err('BAD_TOKEN', `Invalid slot token: ${slotTok.value}`)
      return ok(Boolean(resolveSlotReady(ctx, slot)))
    }

    if (fn === 'SLOT_ACTIVE') {
      if (node.arguments.length !== 1) return err('ARITY', 'SLOT_ACTIVE expects 1 argument')
      const slotTok = evalTokenArg(node.arguments[0])
      if (!slotTok.ok) return slotTok
      const slot = parseSlotToken(slotTok.value)
      if (!slot) return err('BAD_TOKEN', `Invalid slot token: ${slotTok.value}`)
      return ok(Boolean(resolveSlotActive(ctx, slot)))
    }

    if (fn === 'TIMER_REMAINING' || fn === 'TIMER_ACTIVE' || fn === 'TIMER_DONE') {
      if (node.arguments.length !== 1) return err('ARITY', `${fn} expects 1 argument`)
      const timerTok = evalTokenArg(node.arguments[0])
      if (!timerTok.ok) return timerTok
      const timer = parseTimerToken(timerTok.value)
      if (!timer) return err('BAD_TOKEN', `Invalid timer token: ${timerTok.value}`)

      const remaining = resolveTimerRemaining(ctx, timer)
      if (!isInt(remaining)) return err('MISSING', `Unknown timer: ${timerTok.value}`)

      if (fn === 'TIMER_REMAINING') return ok(remaining)
      if (fn === 'TIMER_ACTIVE') return ok(remaining > 0)
      return ok(remaining === 0)
    }

    if (fn === 'HAS_TARGET_BOT') {
      if (node.arguments.length !== 0) return err('ARITY', 'HAS_TARGET_BOT expects 0 arguments')
      const v = resolveBoolish(ctx?.hasTargetBot)
      if (v == null) return err('MISSING', 'HAS_TARGET_BOT not available in ctx')
      return ok(v)
    }

    if (fn === 'BUMPED_BOT') {
      if (node.arguments.length !== 0) return err('ARITY', 'BUMPED_BOT expects 0 arguments')
      const v = resolveBoolish(ctx?.bumpedBot)
      if (v == null) return err('MISSING', 'BUMPED_BOT not available in ctx')
      return ok(v)
    }

    // Fallback for future pure helpers.
    const impl = resolveFunction(ctx, fn)
    if (!impl) return err('UNKNOWN_FUNCTION', `Unknown function: ${fn}`)

    /** @type {(number|boolean)[]} */
    const args = []
    for (const a of node.arguments) {
      const r = evalNode(a, ctx)
      if (!r.ok) return r
      args.push(r.value)
    }

    const v = impl(...args)
    if (typeof v === 'boolean') return ok(v)
    if (isInt(v)) return ok(v)

    return err('TYPE_ERROR', `Function ${fn} returned invalid value: ${String(v)}`)
  }

  return err('UNKNOWN_NODE', `Unknown expression node type: ${/** @type {any} */ (node).type}`)
}

/**
 * @param {Expr} node
 * @param {EvalCtx} ctx
 * @returns {{ ok: true, value: number } | { ok: false, error: { code: string, message: string } }}
 */
function evalInt(node, ctx) {
  const r = evalNode(node, ctx)
  if (!r.ok) return r
  if (!isInt(r.value)) return err('TYPE_ERROR', 'Expected int')
  return /** @type {any} */ (r)
}

/**
 * @param {Expr} node
 * @param {EvalCtx} ctx
 * @returns {{ ok: true, value: boolean } | { ok: false, error: { code: string, message: string } }}
 */
function evalBool(node, ctx) {
  const r = evalNode(node, ctx)
  if (!r.ok) return r
  if (typeof r.value === 'boolean') return /** @type {any} */ (r)
  if (isInt(r.value)) return ok(r.value !== 0)
  return err('TYPE_ERROR', 'Expected bool')
}

/**
 * Some built-in functions take symbolic tokens (`BOT1`, `HEALTH`, `T1`, `SLOT1`)
 * rather than evaluating the identifier value.
 *
 * @param {Expr | undefined} node
 * @returns {{ ok: true, value: string } | { ok: false, error: { code: string, message: string } }}
 */
function evalTokenArg(node) {
  if (!node) return err('ARITY', 'Missing argument')
  if (node.type !== 'Identifier') return err('TYPE_ERROR', 'Expected identifier token argument')
  return { ok: true, value: node.name.toUpperCase() }
}

/** @param {unknown} v */
function resolveBoolish(v) {
  if (typeof v === 'boolean') return v
  if (typeof v === 'function') {
    const r = v()
    if (typeof r === 'boolean') return r
  }
  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {string} name
 */
function resolveIdentifier(ctx, name) {
  if (typeof ctx?.getVar === 'function') {
    const v = ctx.getVar(name)
    if (v !== undefined) return v
  }

  if (ctx && typeof ctx === 'object') {
    if (ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, name)) return ctx.vars[name]
    if (Object.prototype.hasOwnProperty.call(ctx, name)) return /** @type {any} */ (ctx)[name]
  }

  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {string} name
 */
function resolveFunction(ctx, name) {
  if (ctx && typeof ctx === 'object') {
    if (ctx.functions && typeof ctx.functions[name] === 'function') return ctx.functions[name]
    if (typeof /** @type {any} */ (ctx)[name] === 'function') return /** @type {any} */ (ctx)[name]
  }

  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {string} type
 */
function resolvePowerupExists(ctx, type) {
  const t = /** @type {'HEALTH'|'AMMO'|'ENERGY'} */ (type)

  if (typeof ctx?.powerupExists === 'function') return ctx.powerupExists(t)

  const p = ctx?.powerups
  if (!p) return null

  if (typeof p === 'function') return p(type)
  if (typeof p.has === 'function') return p.has(type)
  if (typeof p === 'object') return Boolean(/** @type {any} */ (p)[type])

  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {string} bot
 */
function resolveBotAlive(ctx, bot) {
  const b = /** @type {'BOT1'|'BOT2'|'BOT3'|'BOT4'} */ (bot)

  if (typeof ctx?.botAlive === 'function') return ctx.botAlive(b)

  const a = ctx?.botsAlive
  if (!a) return null

  if (typeof a === 'function') return a(b)
  if (typeof a === 'object') return Boolean(/** @type {any} */ (a)[b])

  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {1|2|3} timer
 */
function resolveTimerRemaining(ctx, timer) {
  if (typeof ctx?.timerRemaining === 'function') return ctx.timerRemaining(timer)

  const timers = ctx?.timers
  if (!timers) return null

  if (typeof timers === 'function') return timers(timer)

  if (typeof timers === 'object') {
    const key = `T${timer}`
    const v = /** @type {any} */ (timers)[key]
    return v
  }

  return null
}

/** @param {EvalCtx} ctx */
function resolveDistToClosestBot(ctx) {
  const v = ctx?.distToClosestBot
  if (typeof v === 'function') return v()
  return v
}

/**
 * @param {EvalCtx} ctx
 * @param {1|2|3} slot
 */
function resolveSlotReady(ctx, slot) {
  const sr = ctx?.slotReady
  if (!sr) return null
  if (typeof sr === 'function') return sr(slot)
  if (typeof sr === 'object') return Boolean(/** @type {any} */ (sr)[`SLOT${slot}`] ?? /** @type {any} */ (sr)[slot])
  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {1|2|3} slot
 */
function resolveSlotActive(ctx, slot) {
  const sa = ctx?.slotActive
  if (!sa) return null
  if (typeof sa === 'function') return sa(slot)
  if (typeof sa === 'object') return Boolean(/** @type {any} */ (sa)[`SLOT${slot}`] ?? /** @type {any} */ (sa)[slot])
  return null
}

/**
 * @param {EvalCtx} ctx
 * @param {1|2|3|4} zone
 */
function resolveInZone(ctx, zone) {
  if (typeof ctx?.inZone === 'function') return ctx.inZone(zone)
  if (isInt(ctx?.zone)) return ctx.zone === zone
  return null
}

/**
 * @param {string} s
 * @returns {1|2|3|0}
 */
function parseSlotToken(s) {
  if (s === 'SLOT1') return 1
  if (s === 'SLOT2') return 2
  if (s === 'SLOT3') return 3
  return 0
}

/**
 * @param {string} s
 * @returns {1|2|3|0}
 */
function parseTimerToken(s) {
  if (s === 'T1') return 1
  if (s === 'T2') return 2
  if (s === 'T3') return 3
  return 0
}
