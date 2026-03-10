import { compileBotSource } from '../dsl/compileBotSource.js'
import { initBotVm, stepBotVm } from '../vm/botVm.js'

import {
  BOT_CENTER_MAX,
  BOT_CENTER_MIN,
  BOT_HALF_SIZE,
  BULLET_AMMO_COST,
  BULLET_COOLDOWN_TICKS,
  SLOT_IDS,
  WALL_BUMP_DAMAGE,
} from './constants.js'
import {
  botsOverlap,
  clonePos,
  dirFromDelta,
  locToWorld,
  manhattan,
  oppositeDir,
  scaleDeltaToMaxLen,
  sectorFromPos,
  zoneFromPos,
} from './arenaMath.js'
import { createBullet, stepBullets } from './bulletSim.js'
import { bresenhamPoints } from './bresenham.js'
import { createRng } from './prng.js'
import {
  findClosestPowerupLoc,
  initPowerupState,
  powerupExists,
  stepPowerupMaintenance,
  stepPowerupPickups,
} from './powerupSim.js'

const DEFAULT_TICKS_PER_SECOND = 1

const DEFAULT_APPEARANCE_BY_SLOT = {
  BOT1: { kind: 'COLOR', color: '#4ade80' },
  BOT2: { kind: 'COLOR', color: '#60a5fa' },
  BOT3: { kind: 'COLOR', color: '#f472b6' },
  BOT4: { kind: 'COLOR', color: '#fbbf24' },
}

const SPAWN_POS_BY_ID = {
  BOT1: { x: 16, y: 16 },
  BOT2: { x: 176, y: 16 },
  BOT3: { x: 16, y: 176 },
  BOT4: { x: 176, y: 176 },
}

// v1 fixed default loadout: SLOT1=BULLET.
// (Ruleset.md v1 recommended baseSpeed 16 - 1 equipped slot penalty 4 => 12.)
const BOT_SPEED_UNITS_PER_TICK = 12

// Ruleset.md §0.1 recommended defaults.
const STALEMATE_GRACE_TICKS = 120
const STALEMATE_COUNTDOWN_TICKS = 30

// Stable v1 SAW numbers (match `packages/replay/src/generateSampleReplay.js`).
const SAW_DAMAGE = 6
const SAW_ENERGY_DRAIN = 1
const SAW_ATTACK_RANGE = BOT_HALF_SIZE * 2 + 2
const SAW_ATTACK_RANGE2 = SAW_ATTACK_RANGE * SAW_ATTACK_RANGE

function botSourceHasSaw(sourceText) {
  if (!sourceText) return false
  return /\bSAW\b/i.test(sourceText)
}

/**
 * @param {{ seed: number|string, tickCap: number, bots: Array<{slotId: 'BOT1'|'BOT2'|'BOT3'|'BOT4', sourceText: string}> }} params
 */
export function runMatchToReplay(params) {
  const tickCapLimit = params.tickCap
  let tickCap = tickCapLimit
  const rng = createRng(params.seed)

  const headerBots = normalizeHeaderBots(params.bots)

  /** @type {Array<{botId:'BOT1'|'BOT2'|'BOT3'|'BOT4', pos:{x:number,y:number}, hp:number, ammo:number, energy:number, alive:boolean, lastDamageByBotId: 'BOT1'|'BOT2'|'BOT3'|'BOT4' | null, vm: any, slot1Cooldown:number, pendingMove:any, bumpedLastTick:boolean, bumpedThisTick:boolean, sawCapable:boolean, sawActive:boolean}>} */
  const bots = SLOT_IDS.map((botId) => {
    const sourceText = headerBots.find((b) => b.slotId === botId)?.sourceText ?? ''
    const compiled = compileBotSource(sourceText)

    const sawCapable = botSourceHasSaw(sourceText)

    return {
      botId,
      pos: clonePos(SPAWN_POS_BY_ID[botId]),
      hp: 100,
      ammo: 100,
      energy: 100,
      alive: true,
      lastDamageByBotId: null,
      vm: initBotVm(compiled.program),
      slot1Cooldown: 0,
      pendingMove: null,
      bumpedLastTick: false,
      bumpedThisTick: false,
      sawCapable,
      sawActive: false,
    }
  })

  /** @type {Array<{bulletId:string, ownerBotId:'BOT1'|'BOT2'|'BOT3'|'BOT4', pos:{x:number,y:number}, vel:{x:number,y:number}, ttl:number}>} */
  let bullets = []
  let bulletCounter = 0

  const powerupState = initPowerupState(rng)

  const state = []
  const events = []

  state.push(snapshotState(0, bots, bullets, powerupState))
  events.push([])

  // Stalemate tracking (Ruleset.md §0.1.1).
  let ticksSinceLastBotDamage = 0
  /** @type {number | null} */
  let stalemateCountdownRemaining = null

  for (let t = 1; t <= tickCapLimit; t++) {
    /** @type {any[]} */
    const tickEvents = []

    // Reset per-tick bump flags (they become visible next tick via bumpedLastTick).
    for (const b of bots) b.bumpedThisTick = false

    // 1) Bot VM instruction phase (BOT1..BOT4)
    for (const bot of bots) {
      if (!bot.alive) continue

      const observation = buildObservation(bot, bots, powerupState)

      const vmBefore = bot.vm
      const instrBefore = vmBefore?.program?.instructions?.[vmBefore.pc - 1] ?? { kind: 'INVALID' }
      const prevTargetSelector = vmBefore?.target?.botSelector ?? null

      const { vm: vmAfter, effects, debug } = stepBotVm(vmBefore, observation)
      bot.vm = vmAfter

      // If this tick wrote the bot's target register using a dynamic selector
      // (CLOSEST_BOT / LOWEST_HEALTH_BOT / NEXT...), resolve it deterministically
      // to a concrete bot id *at execution time*.
      normalizeTargetRegister(bot, bots, prevTargetSelector)

      // Track whether a USE_SLOT succeeded for BOT_EXEC reporting.
      let botExecResult = debug.executedKind === 'INVALID' ? 'NOP' : 'EXECUTED'
      /** @type {string | undefined} */
      let botExecReason

      for (const eff of effects) {
        if (eff.kind === 'MOVE_DIR' || eff.kind === 'MOVE') {
          bot.pendingMove = eff
          continue
        }

        if (eff.kind === 'SET_MOVE') {
          bot.vm.moveGoal = normalizeMoveTargetAtSetTime(eff.target, bot.pos)
          continue
        }

        if (eff.kind === 'CLEAR_MOVE') {
          bot.vm.moveGoal = null
          continue
        }

        if (eff.kind === 'MODULE_TOGGLE') {
          if (eff.module !== 'SAW' || !bot.sawCapable) {
            botExecResult = 'NOP'
            botExecReason = 'NO_MODULE'
            continue
          }

          const wantsOn = Boolean(eff.on)

          if (wantsOn && bot.energy <= 0) {
            botExecResult = 'NOP'
            botExecReason = 'NO_ENERGY'
            bot.sawActive = false
            continue
          }

          bot.sawActive = wantsOn
          continue
        }

        if (eff.kind === 'STOP_SLOT') {
          if (eff.slot === 1 && bot.sawCapable) {
            bot.sawActive = false
            continue
          }

          botExecResult = 'NOP'
          botExecReason = 'NO_MODULE'
          continue
        }

        if (eff.kind === 'USE_SLOT') {
          if (eff.slot !== 1) {
            botExecResult = 'NOP'
            botExecReason = 'NO_MODULE'
            continue
          }

          // v1: if SLOT1 is SAW, USE_SLOT1 behaves like SAW ON (target ignored).
          if (bot.sawCapable) {
            if (bot.energy <= 0) {
              botExecResult = 'NOP'
              botExecReason = 'NO_ENERGY'
              bot.sawActive = false
              continue
            }

            bot.sawActive = true
            continue
          }

          const r = attemptUseSlot1(bot, eff.target, bots, bullets, ++bulletCounter, tickEvents)

          if (!r.ok) {
            botExecResult = 'NOP'
            botExecReason = r.reason
            bulletCounter--
          } else {
            bullets = r.bullets
            bot.slot1Cooldown = BULLET_COOLDOWN_TICKS
            bulletCounter = r.bulletCounter
          }

          continue
        }
      }

      if (debug.executedKind === 'INVALID') {
        botExecResult = 'NOP'
        botExecReason = 'INVALID_INSTR'
      }

      tickEvents.push({
        type: 'BOT_EXEC',
        botId: bot.botId,
        pcBefore: debug.pcBefore,
        pcAfter: debug.pcAfter,
        instrText: formatInstr(instrBefore),
        result: botExecResult,
        ...(botExecReason ? { reason: botExecReason } : {}),
      })
    }

    // 2) SAW drain
    stepToggleDrains(bots, tickEvents)

    // 3) Movement + collision resolution
    resolveMovement(bots, powerupState, tickEvents)

    // 4) SAW melee damage
    stepSawDamage(bots, tickEvents)

    // 5) Projectile updates (bullets)
    bullets = stepBullets(bullets, bots, tickEvents)

    // 6) Pickups
    stepPowerupPickups(powerupState, bots, tickEvents)

    // 8) End-of-tick maintenance
    for (const bot of bots) {
      bot.pendingMove = null
      if (bot.slot1Cooldown > 0) bot.slot1Cooldown--

      bot.bumpedLastTick = bot.bumpedThisTick
    }

    stepPowerupMaintenance(powerupState, bots, t, rng, tickEvents)

    // Target powerup invalidation: if the preferred type doesn't exist at end
    // of tick (after spawns/despawns), clear it.
    for (const bot of bots) {
      const type = bot.vm?.target?.powerupType
      if (!type) continue
      if (!powerupExists(powerupState, type)) bot.vm.target.powerupType = null
    }

    // --- Match end conditions (Ruleset.md §0.1) ---

    // Bot-vs-bot damage detection for stalemate tracking.
    const botDamageThisTick = tickEvents.some(
      (e) => e && e.type === 'DAMAGE' && typeof e.amount === 'number' && e.amount > 0 && e.sourceBotId
    )

    const aliveBotCount = bots.reduce((n, b) => (b.alive ? n + 1 : n), 0)

    if (botDamageThisTick) {
      ticksSinceLastBotDamage = 0
      stalemateCountdownRemaining = null
    } else {
      ticksSinceLastBotDamage++

      if (aliveBotCount >= 2) {
        if (stalemateCountdownRemaining == null && ticksSinceLastBotDamage === STALEMATE_GRACE_TICKS) {
          stalemateCountdownRemaining = STALEMATE_COUNTDOWN_TICKS
        } else if (stalemateCountdownRemaining != null) {
          stalemateCountdownRemaining--
        }
      } else {
        stalemateCountdownRemaining = null
      }
    }

    /** @type {string | null} */
    let endReason = null

    if (aliveBotCount === 0) {
      endReason = 'ALL_DEAD'
    } else if (aliveBotCount === 1) {
      endReason = 'LAST_BOT_ALIVE'
    } else if (stalemateCountdownRemaining != null && stalemateCountdownRemaining <= 0) {
      endReason = 'STALEMATE'
    } else if (t === tickCapLimit) {
      endReason = 'TICK_CAP'
    }

    if (endReason) {
      tickEvents.push({ type: 'MATCH_END', endReason })
    }

    state.push(snapshotState(t, bots, bullets, powerupState))
    events.push(tickEvents)

    if (endReason) {
      tickCap = t
      break
    }
  }

  return {
    schemaVersion: '0.1.0',
    rulesetVersion: '0.1.0',
    ticksPerSecond: DEFAULT_TICKS_PER_SECOND,
    matchSeed: params.seed,
    tickCap,
    bots: headerBots,
    state,
    events,
  }
}

function snapshotState(t, bots, bullets, powerupState) {
  return {
    t,
    bots: bots.map((b) => ({
      botId: b.botId,
      pos: clonePos(b.pos),
      hp: b.hp,
      ammo: b.ammo,
      energy: b.energy,
      alive: b.alive,
      pc: b.vm?.pc ?? 1,
    })),
    bullets: bullets.map((b) => ({
      bulletId: b.bulletId,
      ownerBotId: b.ownerBotId,
      pos: clonePos(b.pos),
      vel: clonePos(b.vel),
    })),
    powerups: powerupState.powerups.map((p) => ({
      powerupId: p.powerupId,
      type: p.type,
      loc: { sector: p.loc.sector, zone: p.loc.zone },
    })),
  }
}

function defaultHeaderBot(slotId) {
  return {
    slotId,
    displayName: slotId,
    appearance: DEFAULT_APPEARANCE_BY_SLOT[slotId] ?? { kind: 'COLOR', color: '#e2e8f0' },
    sourceText: '',
  }
}

function normalizeHeaderBots(botsInput) {
  if (!Array.isArray(botsInput)) return SLOT_IDS.map(defaultHeaderBot)

  const byId = new Map(botsInput.map((b) => [b?.slotId, b]))

  return SLOT_IDS.map((slotId) => {
    const b = byId.get(slotId)

    return {
      slotId,
      displayName: slotId,
      appearance: DEFAULT_APPEARANCE_BY_SLOT[slotId] ?? { kind: 'COLOR', color: '#e2e8f0' },
      sourceText: typeof b?.sourceText === 'string' ? b.sourceText : '',
    }
  })
}

function buildObservation(bot, bots, powerupState) {
  const zone = zoneFromPos(bot.pos)
  const closestBotDist = distToClosestBot(bot, bots)

  const targetBotId = bot.vm?.target?.botSelector
  const targetBot =
    targetBotId === 'BOT1' || targetBotId === 'BOT2' || targetBotId === 'BOT3' || targetBotId === 'BOT4'
      ? botsById(bots, targetBotId)
      : null

  const timers = bot.vm?.timers ?? { 1: 0, 2: 0, 3: 0 }

  return {
    vars: {
      HEALTH: bot.hp,
      AMMO: bot.ammo,
      ENERGY: bot.energy,
      TARGET_HEALTH: targetBot && targetBot.alive ? targetBot.hp : 0,
    },
    botsAlive: {
      BOT1: bots[0]?.alive ?? false,
      BOT2: bots[1]?.alive ?? false,
      BOT3: bots[2]?.alive ?? false,
      BOT4: bots[3]?.alive ?? false,
    },
    powerupExists: (type) => powerupExists(powerupState, type),
    zone,
    distToClosestBot: closestBotDist,
    timers: { T1: timers[1] ?? 0, T2: timers[2] ?? 0, T3: timers[3] ?? 0 },

    // Exposed for HAS_TARGET_BOT() (see botVm.js).
    hasTargetBot: () => Boolean(targetBot && targetBot.alive),

    slotReady: (slot) => {
      if (slot === 1 && bot.sawCapable) return bot.energy > 0

      if (slot !== 1) return false
      if (bot.slot1Cooldown > 0) return false
      return bot.ammo >= BULLET_AMMO_COST
    },
    slotActive: (slot) => {
      if (slot === 1 && bot.sawCapable) return bot.sawActive
      return false
    },
    bumpedBot: bot.bumpedLastTick,
  }
}

function distToClosestBot(bot, bots) {
  let best = 999
  for (const other of bots) {
    if (!other.alive) continue
    if (other.botId === bot.botId) continue

    const d = manhattan(bot.pos, other.pos)
    if (d < best) best = d
  }
  return best
}

function normalizeMoveTargetAtSetTime(target, pos) {
  if (!target || typeof target !== 'object') return target

  if (target.kind === 'ZONE_IN_CURRENT_SECTOR') {
    const sector = sectorFromPos(pos)
    return { kind: 'SECTOR', sector, zone: target.zone }
  }

  return target
}

/**
 * Normalize the bot target register after a bot executes a target-selection
 * instruction.
 *
 * In stable v1, selectors like CLOSEST_BOT / LOWEST_HEALTH_BOT are resolved
 * *when the instruction executes*, and the target register stores the resolved
 * concrete bot id.
 */
function normalizeTargetRegister(bot, bots, prevTargetSelector = null) {
  const selector = bot?.vm?.target?.botSelector
  if (selector == null) return

  // Concrete ids already.
  if (selector === 'BOT1' || selector === 'BOT2' || selector === 'BOT3' || selector === 'BOT4') return

  if (selector === 'CLOSEST_BOT') {
    const b = findClosestLivingBot(bot.botId, bot.pos, bots)
    bot.vm.target.botSelector = b ? b.botId : null
    return
  }

  if (selector === 'LOWEST_HEALTH_BOT') {
    const b = findLowestHealthLivingBot(bot.botId, bots)
    bot.vm.target.botSelector = b ? b.botId : null
    return
  }

  if (selector === 'NEXT') {
    bot.vm.target.botSelector = nextTargetId(bot.botId, prevTargetSelector)
    return
  }

  if (selector === 'NEXT_IF_DEAD') {
    const current = prevTargetSelector
    const currentBot =
      current === 'BOT1' || current === 'BOT2' || current === 'BOT3' || current === 'BOT4' ? botsById(bots, current) : null

    if (currentBot && currentBot.alive) {
      bot.vm.target.botSelector = current
    } else {
      bot.vm.target.botSelector = nextTargetId(bot.botId, prevTargetSelector)
    }
    return
  }

  // Unknown selector => clear.
  bot.vm.target.botSelector = null
}

function nextTargetId(selfId, currentTargetId) {
  const order = SLOT_IDS.filter((id) => id !== selfId)
  const idx = currentTargetId && order.includes(currentTargetId) ? order.indexOf(currentTargetId) : -1
  return order[(idx + 1) % order.length]
}

function resolveMovement(bots, powerupState, tickEvents) {
  for (const bot of bots) {
    if (!bot.alive) continue

    const move = bot.pendingMove

    /** @type {{ dx:number, dy:number, dir: any } | null} */
    let request = null
    let requestFromGoal = false

    if (move) {
      request = resolveMoveEffect(bot, move, bots, powerupState)
    } else if (bot.vm?.moveGoal) {
      requestFromGoal = true
      request = resolveMoveTarget(bot, bot.vm.moveGoal, bots, powerupState, true)
    }

    if (!request) continue

    const fromPos = clonePos(bot.pos)

    // Wall clamp phase.
    const candidate = {
      x: bot.pos.x + request.dx,
      y: bot.pos.y + request.dy,
    }

    const clamped = {
      x: Math.max(BOT_CENTER_MIN, Math.min(BOT_CENTER_MAX, candidate.x)),
      y: Math.max(BOT_CENTER_MIN, Math.min(BOT_CENTER_MAX, candidate.y)),
    }

    const bumpedWall = clamped.x !== candidate.x || clamped.y !== candidate.y

    // Bot-bot overlap check along the movement segment.
    /** @type {any | null} */
    let overlapped = null

    let finalPos = clamped

    const segmentPoints = bresenhamPoints(fromPos, clamped)
    let lastSafePos = fromPos

    for (const p of segmentPoints) {
      /** @type {any | null} */
      let atPoint = null

      for (const other of bots) {
        if (!other.alive) continue
        if (other.botId === bot.botId) continue
        if (!botsOverlap(p, other.pos)) continue

        if (!atPoint || other.botId < atPoint.botId) atPoint = other
      }

      if (atPoint) {
        overlapped = atPoint
        finalPos = lastSafePos
        break
      }

      lastSafePos = p
    }

    if (overlapped) {
      tickEvents.push({
        type: 'BUMP_BOT',
        botId: bot.botId,
        otherBotId: overlapped.botId,
        dir: request.dir,
      })

      tickEvents.push({
        type: 'BUMP_BOT',
        botId: overlapped.botId,
        otherBotId: bot.botId,
        dir: oppositeDir(request.dir),
      })

      bot.bumpedThisTick = true
      overlapped.bumpedThisTick = true
    }

    bot.pos = finalPos

    if (fromPos.x !== bot.pos.x || fromPos.y !== bot.pos.y) {
      tickEvents.push({
        type: 'BOT_MOVED',
        botId: bot.botId,
        fromPos,
        toPos: clonePos(bot.pos),
        dir: request.dir,
      })
    }

    if (bumpedWall) {
      applyWallBumpDamage(bot, request.dir, tickEvents)
    }

    // Goal completion.
    if (requestFromGoal && bot.vm?.moveGoal && bot.vm.moveGoal.kind === 'SECTOR') {
      const goalPos = resolvePointGoalPos(bot.vm.moveGoal)
      if (goalPos && bot.pos.x === goalPos.x && bot.pos.y === goalPos.y) {
        bot.vm.moveGoal = null
      }
    }
  }
}

function applyWallBumpDamage(bot, dir, tickEvents) {
  tickEvents.push({
    type: 'BUMP_WALL',
    botId: bot.botId,
    dir,
    damage: WALL_BUMP_DAMAGE,
  })

  bot.hp = Math.max(0, bot.hp - WALL_BUMP_DAMAGE)

  tickEvents.push({
    type: 'DAMAGE',
    victimBotId: bot.botId,
    amount: WALL_BUMP_DAMAGE,
    source: 'ENV',
    kind: 'BUMP_WALL',
  })

  if (bot.hp <= 0 && bot.alive) {
    bot.alive = false
    tickEvents.push({
      type: 'BOT_DIED',
      victimBotId: bot.botId,
      ...(bot.lastDamageByBotId ? { creditedBotId: bot.lastDamageByBotId } : {}),
    })
  }
}

function resolveMoveEffect(bot, move, bots, powerupState) {
  if (move.kind === 'MOVE_DIR') {
    const { dx, dy } = deltaForMoveDir(move.dir, BOT_SPEED_UNITS_PER_TICK)
    return { dx, dy, dir: move.dir }
  }

  if (move.kind === 'MOVE') {
    const target = normalizeMoveTargetAtSetTime(move.target, bot.pos)
    return resolveMoveTarget(bot, target, bots, powerupState, false)
  }

  return null
}

function resolveMoveTarget(bot, target, bots, powerupState, clearGoalOnInvalid) {
  if (!target || typeof target !== 'object') return null

  if (target.kind === 'TARGET') {
    const botTargetId = bot.vm?.target?.botSelector
    const botTarget =
      botTargetId === 'BOT1' || botTargetId === 'BOT2' || botTargetId === 'BOT3' || botTargetId === 'BOT4'
        ? botsById(bots, botTargetId)
        : null

    if (botTarget && botTarget.alive) {
      const dx = botTarget.pos.x - bot.pos.x
      const dy = botTarget.pos.y - bot.pos.y
      const scaled = scaleDeltaToMaxLen(dx, dy, BOT_SPEED_UNITS_PER_TICK)
      return { dx: scaled.dx, dy: scaled.dy, dir: dirFromDelta(dx, dy) }
    }

    const type = bot.vm?.target?.powerupType
    if (type) {
      const loc = findClosestPowerupLoc(powerupState, bot.pos, type)
      if (loc) {
        const pos = locToWorld(loc)
        const dx = pos.x - bot.pos.x
        const dy = pos.y - bot.pos.y
        const scaled = scaleDeltaToMaxLen(dx, dy, BOT_SPEED_UNITS_PER_TICK)
        return { dx: scaled.dx, dy: scaled.dy, dir: dirFromDelta(dx, dy) }
      }
    }

    if (clearGoalOnInvalid) bot.vm.moveGoal = null
    return null
  }

  if (target.kind === 'BOT') {
    const botTarget = resolveBotTargetToken(bot, target.token, bots)

    if (!botTarget || !botTarget.alive) {
      if (clearGoalOnInvalid) bot.vm.moveGoal = null
      return null
    }

    const dx = botTarget.pos.x - bot.pos.x
    const dy = botTarget.pos.y - bot.pos.y
    const scaled = scaleDeltaToMaxLen(dx, dy, BOT_SPEED_UNITS_PER_TICK)
    return { dx: scaled.dx, dy: scaled.dy, dir: dirFromDelta(dx, dy) }
  }

  if (target.kind === 'POWERUP') {
    const loc = findClosestPowerupLoc(powerupState, bot.pos, target.type)
    if (!loc) {
      if (clearGoalOnInvalid) bot.vm.moveGoal = null
      return null
    }
    const pos = locToWorld(loc)
    const dx = pos.x - bot.pos.x
    const dy = pos.y - bot.pos.y
    const scaled = scaleDeltaToMaxLen(dx, dy, BOT_SPEED_UNITS_PER_TICK)
    return { dx: scaled.dx, dy: scaled.dy, dir: dirFromDelta(dx, dy) }
  }

  if (target.kind === 'SECTOR') {
    const goalPos = resolvePointGoalPos(target)
    if (!goalPos) return null

    const dx = goalPos.x - bot.pos.x
    const dy = goalPos.y - bot.pos.y

    const scaled = scaleDeltaToMaxLen(dx, dy, BOT_SPEED_UNITS_PER_TICK)
    return { dx: scaled.dx, dy: scaled.dy, dir: dirFromDelta(dx, dy) }
  }

  if (target.kind === 'ARENA_EDGE') {
    let goal = clonePos(bot.pos)
    if (target.dir === 'UP') goal = { x: bot.pos.x, y: BOT_CENTER_MIN }
    if (target.dir === 'DOWN') goal = { x: bot.pos.x, y: BOT_CENTER_MAX }
    if (target.dir === 'LEFT') goal = { x: BOT_CENTER_MIN, y: bot.pos.y }
    if (target.dir === 'RIGHT') goal = { x: BOT_CENTER_MAX, y: bot.pos.y }

    const dx = goal.x - bot.pos.x
    const dy = goal.y - bot.pos.y
    const scaled = scaleDeltaToMaxLen(dx, dy, BOT_SPEED_UNITS_PER_TICK)
    return { dx: scaled.dx, dy: scaled.dy, dir: dirFromDelta(dx, dy) }
  }

  return null
}

function resolvePointGoalPos(target) {
  if (target.kind !== 'SECTOR') return null

  const sector = Math.max(1, Math.min(9, Math.floor(target.sector)))
  const zone = target.zone ? Math.max(1, Math.min(4, Math.floor(target.zone))) : 0
  return locToWorld({ sector, zone })
}

function deltaForMoveDir(dir, speed) {
  const d = Math.floor((speed * 7071 + 5000) / 10000)

  switch (dir) {
    case 'UP':
      return { dx: 0, dy: -speed }
    case 'DOWN':
      return { dx: 0, dy: speed }
    case 'LEFT':
      return { dx: -speed, dy: 0 }
    case 'RIGHT':
      return { dx: speed, dy: 0 }
    case 'UP_LEFT':
      return { dx: -d, dy: -d }
    case 'UP_RIGHT':
      return { dx: d, dy: -d }
    case 'DOWN_LEFT':
      return { dx: -d, dy: d }
    case 'DOWN_RIGHT':
      return { dx: d, dy: d }
    default:
      return { dx: 0, dy: 0 }
  }
}

function resolveBotTargetToken(bot, token, bots) {
  if (!token) return null

  if (token === 'TARGET') {
    const id = bot.vm?.target?.botSelector
    return id === 'BOT1' || id === 'BOT2' || id === 'BOT3' || id === 'BOT4' ? botsById(bots, id) : null
  }

  if (token === 'BOT1' || token === 'BOT2' || token === 'BOT3' || token === 'BOT4') {
    return botsById(bots, token)
  }

  if (token === 'CLOSEST_BOT') return findClosestLivingBot(bot.botId, bot.pos, bots)

  if (token === 'LOWEST_HEALTH_BOT') return findLowestHealthLivingBot(bot.botId, bots)

  return null
}

function findClosestLivingBot(fromId, fromPos, bots) {
  /** @type {{ bot: any, d: number } | null} */
  let best = null

  for (const b of bots) {
    if (!b.alive) continue
    if (b.botId === fromId) continue
    const d = manhattan(fromPos, b.pos)
    if (!best || d < best.d || (d === best.d && b.botId < best.bot.botId)) best = { bot: b, d }
  }

  return best?.bot ?? null
}

function findLowestHealthLivingBot(fromId, bots) {
  /** @type {any | null} */
  let best = null

  for (const b of bots) {
    if (!b.alive) continue
    if (b.botId === fromId) continue

    if (!best || b.hp < best.hp || (b.hp === best.hp && b.botId < best.botId)) best = b
  }

  return best
}

function attemptUseSlot1(bot, targetToken, bots, bullets, nextBulletId, tickEvents) {
  if (bot.sawCapable) return { ok: false, reason: 'NO_MODULE' }
  if (bot.slot1Cooldown > 0) return { ok: false, reason: 'COOLDOWN' }
  if (bot.ammo < BULLET_AMMO_COST) return { ok: false, reason: 'NO_AMMO' }

  const isBotKind =
    targetToken === 'TARGET' ||
    targetToken === 'CLOSEST_BOT' ||
    targetToken === 'LOWEST_HEALTH_BOT' ||
    targetToken === 'BOT1' ||
    targetToken === 'BOT2' ||
    targetToken === 'BOT3' ||
    targetToken === 'BOT4'

  if (!isBotKind) return { ok: false, reason: 'INVALID_TARGET_KIND' }

  const targetBot = resolveBotTargetToken(bot, targetToken, bots)
  if (!targetBot || !targetBot.alive) return { ok: false, reason: 'INVALID_TARGET' }

  const bullet = createBullet(bot, targetBot)
  const bulletId = `B${nextBulletId}`

  bullet.bulletId = bulletId

  bot.ammo -= BULLET_AMMO_COST

  tickEvents.push({
    type: 'RESOURCE_DELTA',
    botId: bot.botId,
    ammoDelta: -BULLET_AMMO_COST,
    energyDelta: 0,
    healthDelta: 0,
    cause: 'SHOOT',
  })

  tickEvents.push({
    type: 'BULLET_SPAWN',
    bulletId,
    ownerBotId: bot.botId,
    pos: clonePos(bullet.pos),
    vel: clonePos(bullet.vel),
    targetBotId: targetBot.botId,
    targetPos: clonePos(targetBot.pos),
  })

  return {
    ok: true,
    bullets: [...bullets, bullet],
    bulletCounter: nextBulletId,
  }
}

function formatInstr(instr) {
  const kind = instr?.kind ?? 'INVALID'

  if (kind === 'MOVE_DIR') return `MOVE ${instr.dir}`
  if (kind === 'SET_MOVE') return `SET_MOVE ${formatMoveTarget(instr.target)}`
  if (kind === 'MOVE') return `MOVE ${formatMoveTarget(instr.target)}`
  if (kind === 'CLEAR_MOVE') return 'CLEAR_MOVE'

  if (kind === 'SET_TARGET_BOT') return `SET_TARGET ${instr.selector}`
  if (kind === 'SET_TARGET_POWERUP') return `TARGET_POWERUP ${instr.type}`
  if (kind === 'CLEAR_TARGET') return `CLEAR_TARGET ${instr.which ?? 'ALL'}`

  if (kind === 'USE_SLOT') return `USE_SLOT${instr.slot} ${instr.target}`
  if (kind === 'STOP_SLOT') return `STOP_SLOT${instr.slot}`
  if (kind === 'MODULE_TOGGLE') return `${instr.module} ${instr.on ? 'ON' : 'OFF'}`

  if (kind === 'WAIT') return `WAIT ${instr.ticks}`
  if (kind === 'SET_TIMER') return `SET_TIMER T${instr.timer} ${instr.ticks}`
  if (kind === 'CLEAR_TIMER') return `CLEAR_TIMER T${instr.timer}`

  if (kind === 'JUMP') return `JUMP ${instr.targetPc}`
  if (kind === 'IF_JUMP') return 'IF_JUMP'
  if (kind === 'IF_DO') return 'IF_DO'

  if (kind === 'NOP') return 'NOP'
  return kind
}

function formatMoveTarget(target) {
  if (!target || typeof target !== 'object') return ''

  if (target.kind === 'TARGET') return 'TARGET'
  if (target.kind === 'BOT') return `BOT ${target.token}`
  if (target.kind === 'POWERUP') return `POWERUP ${target.type}`
  if (target.kind === 'SECTOR') return target.zone ? `SECTOR ${target.sector} ZONE ${target.zone}` : `SECTOR ${target.sector}`
  if (target.kind === 'ZONE_IN_CURRENT_SECTOR') return `ZONE ${target.zone}`
  if (target.kind === 'ARENA_EDGE') return `ARENA_EDGE ${target.dir}`
  return target.kind
}

function botsById(bots, botId) {
  switch (botId) {
    case 'BOT1':
      return bots[0]
    case 'BOT2':
      return bots[1]
    case 'BOT3':
      return bots[2]
    case 'BOT4':
      return bots[3]
    default:
      return null
  }
}

function stepToggleDrains(bots, tickEvents) {
  for (const bot of bots) {
    if (!bot.alive) continue

    if (!bot.sawActive) continue

    if (bot.energy <= 0) {
      bot.sawActive = false
      continue
    }

    const drain = Math.min(SAW_ENERGY_DRAIN, bot.energy)
    bot.energy -= drain

    tickEvents.push({
      type: 'RESOURCE_DELTA',
      botId: bot.botId,
      ammoDelta: 0,
      energyDelta: -drain,
      healthDelta: 0,
      cause: 'SAW_DRAIN',
    })

    if (bot.energy <= 0) bot.sawActive = false
  }
}

function stepSawDamage(bots, tickEvents) {
  for (const bot of bots) {
    if (!bot.alive) continue
    if (!bot.sawActive) continue
    if (bot.energy <= 0) continue

    const victim = findClosestLivingBotInSawRange(bot.botId, bot.pos, bots)
    if (!victim) continue

    victim.lastDamageByBotId = bot.botId
    victim.hp = Math.max(0, victim.hp - SAW_DAMAGE)

    tickEvents.push({
      type: 'DAMAGE',
      victimBotId: victim.botId,
      amount: SAW_DAMAGE,
      source: 'SAW',
      sourceBotId: bot.botId,
      kind: 'DIRECT',
      sourceRef: { type: 'SAW', id: bot.botId },
    })

    if (victim.hp <= 0 && victim.alive) {
      victim.alive = false
      tickEvents.push({
        type: 'BOT_DIED',
        victimBotId: victim.botId,
        creditedBotId: victim.lastDamageByBotId,
      })
    }
  }
}

function findClosestLivingBotInSawRange(fromId, fromPos, bots) {
  /** @type {{ bot: any, d2: number } | null} */
  let best = null

  for (const b of bots) {
    if (!b.alive) continue
    if (b.botId === fromId) continue

    const dx = fromPos.x - b.pos.x
    const dy = fromPos.y - b.pos.y
    const d2 = dx * dx + dy * dy

    if (d2 > SAW_ATTACK_RANGE2) continue

    if (!best || d2 < best.d2 || (d2 === best.d2 && b.botId < best.bot.botId)) best = { bot: b, d2 }
  }

  return best?.bot ?? null
}
