import { createRng, rngChoice, rngInt } from './prng.js'

const BOT_CENTER_MIN = 8
const BOT_CENTER_MAX = 184
const ARENA_MIN = 0
const ARENA_MAX = 192

const BOT_HALF_SIZE = 8

const MOVE_SPEED = 2
const BULLET_SPEED = 10
const BULLET_TTL = 18
const BULLET_DAMAGE = 10
const SHOOT_COOLDOWN_TICKS = 7

const DIRS = /** @type {const} */ ([
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
  'UP_LEFT',
  'UP_RIGHT',
  'DOWN_LEFT',
  'DOWN_RIGHT',
])

function round3(n) {
  return Math.round(n * 1000) / 1000
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

function vecForDir(dir) {
  switch (dir) {
    case 'UP':
      return { x: 0, y: -1 }
    case 'DOWN':
      return { x: 0, y: 1 }
    case 'LEFT':
      return { x: -1, y: 0 }
    case 'RIGHT':
      return { x: 1, y: 0 }
    case 'UP_LEFT':
      return { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }
    case 'UP_RIGHT':
      return { x: Math.SQRT1_2, y: -Math.SQRT1_2 }
    case 'DOWN_LEFT':
      return { x: -Math.SQRT1_2, y: Math.SQRT1_2 }
    case 'DOWN_RIGHT':
      return { x: Math.SQRT1_2, y: Math.SQRT1_2 }
    default:
      return { x: 0, y: 0 }
  }
}

function dist2(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

function findNearestLivingBot(bots, fromBotId, fromPos) {
  /** @type {{ bot: any; d2: number } | null} */
  let best = null

  for (const b of bots) {
    if (!b.alive || b.botId === fromBotId) continue
    const d2 = dist2(fromPos, b.pos)
    if (!best || d2 < best.d2) best = { bot: b, d2 }
  }

  return best?.bot ?? null
}

function segmentIntersectsAabb(p0, p1, min, max) {
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y

  let tMin = 0
  let tMax = 1

  if (dx === 0) {
    if (p0.x < min.x || p0.x > max.x) return null
  } else {
    const tx1 = (min.x - p0.x) / dx
    const tx2 = (max.x - p0.x) / dx
    const t1 = Math.min(tx1, tx2)
    const t2 = Math.max(tx1, tx2)
    tMin = Math.max(tMin, t1)
    tMax = Math.min(tMax, t2)
    if (tMin > tMax) return null
  }

  if (dy === 0) {
    if (p0.y < min.y || p0.y > max.y) return null
  } else {
    const ty1 = (min.y - p0.y) / dy
    const ty2 = (max.y - p0.y) / dy
    const t1 = Math.min(ty1, ty2)
    const t2 = Math.max(ty1, ty2)
    tMin = Math.max(tMin, t1)
    tMax = Math.min(tMax, t2)
    if (tMin > tMax) return null
  }

  if (tMax < 0 || tMin > 1) return null

  const tHit = clamp(tMin, 0, 1)
  return {
    t: tHit,
    pos: {
      x: round3(p0.x + dx * tHit),
      y: round3(p0.y + dy * tHit),
    },
  }
}

function segmentHitsArenaWall(p0, p1) {
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y

  /** @type {number[]} */
  const ts = []

  if (dx !== 0) {
    ts.push((ARENA_MIN - p0.x) / dx)
    ts.push((ARENA_MAX - p0.x) / dx)
  }
  if (dy !== 0) {
    ts.push((ARENA_MIN - p0.y) / dy)
    ts.push((ARENA_MAX - p0.y) / dy)
  }

  let bestT = Number.POSITIVE_INFINITY

  for (const t of ts) {
    if (t <= 0 || t > 1) continue
    const x = p0.x + dx * t
    const y = p0.y + dy * t
    if (x < ARENA_MIN - 1e-9 || x > ARENA_MAX + 1e-9) continue
    if (y < ARENA_MIN - 1e-9 || y > ARENA_MAX + 1e-9) continue

    if (t < bestT) bestT = t
  }

  if (!Number.isFinite(bestT)) return null

  const pos = {
    x: round3(clamp(p0.x + dx * bestT, ARENA_MIN, ARENA_MAX)),
    y: round3(clamp(p0.y + dy * bestT, ARENA_MIN, ARENA_MAX)),
  }

  return { t: bestT, pos }
}

function clonePos(p) {
  return { x: p.x, y: p.y }
}

function stepPc(pc) {
  const next = pc + 1
  return next > 24 ? 1 : next
}

/**
 * @typedef {import('./index.d.ts').Replay} Replay
 */

/**
 * Deterministic sample replay generator for driving client visuals.
 *
 * Tick semantics match `ReplayViewerPlan.md`:
 * - state[t] is end-of-tick for tick t
 * - events[t] are events that transformed state[t-1] -> state[t]
 */
export function generateSampleReplay(seed, opts = {}) {
  const tickCap = opts.tickCap ?? 200
  const rng = createRng(seed)

  const headerBots = /** @type {Replay['bots']} */ ([
    {
      slotId: 'BOT1',
      displayName: 'Powerup Seeker',
      appearance: { kind: 'COLOR', color: '#4ade80' },
      sourceText: 'LABEL LOOP\nTARGET_CLOSEST\nMOVE_DIR\nGOTO LOOP\n',
    },
    {
      slotId: 'BOT2',
      displayName: 'Zone Patrol Shooter',
      appearance: { kind: 'COLOR', color: '#60a5fa' },
      sourceText: 'LABEL LOOP\nPATROL\nSHOOT\nGOTO LOOP\n',
    },
    {
      slotId: 'BOT3',
      displayName: 'Corner Bunker',
      appearance: { kind: 'COLOR', color: '#f472b6' },
      sourceText: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n',
    },
    {
      slotId: 'BOT4',
      displayName: 'Chaser Shooter',
      appearance: { kind: 'COLOR', color: '#fbbf24' },
      sourceText: 'LABEL LOOP\nCHASE\nSHOOT\nGOTO LOOP\n',
    },
  ])

  /** @type {Array<{botId: import('./index.d.ts').SlotId, pos: {x:number,y:number}, hp:number, ammo:number, energy:number, alive:boolean, pc:number, moveDir: import('./index.d.ts').MoveDir, shootCd:number}>} */
  const bots = [
    {
      botId: 'BOT1',
      pos: { x: 32, y: 32 },
      hp: 100,
      ammo: 40,
      energy: 100,
      alive: true,
      pc: rngInt(rng, 1, 8),
      moveDir: rngChoice(rng, DIRS),
      shootCd: 0,
    },
    {
      botId: 'BOT2',
      pos: { x: 160, y: 32 },
      hp: 100,
      ammo: 40,
      energy: 100,
      alive: true,
      pc: rngInt(rng, 1, 8),
      moveDir: rngChoice(rng, DIRS),
      shootCd: 0,
    },
    {
      botId: 'BOT3',
      pos: { x: 32, y: 160 },
      hp: 100,
      ammo: 40,
      energy: 100,
      alive: true,
      pc: rngInt(rng, 1, 8),
      moveDir: rngChoice(rng, DIRS),
      shootCd: 0,
    },
    {
      botId: 'BOT4',
      pos: { x: 160, y: 160 },
      hp: 100,
      ammo: 40,
      energy: 100,
      alive: true,
      pc: rngInt(rng, 1, 8),
      moveDir: rngChoice(rng, DIRS),
      shootCd: 0,
    },
  ]

  /** @type {Array<{bulletId:string, ownerBotId: import('./index.d.ts').SlotId, pos:{x:number,y:number}, vel:{x:number,y:number}, ttl:number}>} */
  let bullets = []
  let bulletCounter = 0

  const state = /** @type {Replay['state']} */ ([])
  const events = /** @type {Replay['events']} */ ([])

  state.push({
    t: 0,
    bots: bots.map((b) => ({
      botId: b.botId,
      pos: clonePos(b.pos),
      hp: b.hp,
      ammo: b.ammo,
      energy: b.energy,
      alive: b.alive,
      pc: b.pc,
    })),
    bullets: [],
    powerups: [],
  })
  events.push([])

  for (let t = 1; t <= tickCap; t++) {
    /** @type {Replay['events'][number]} */
    const tickEvents = []

    // bots act
    for (const bot of bots) {
      if (!bot.alive) continue

      if (bot.shootCd > 0) bot.shootCd--

      const pcBefore = bot.pc
      let pcAfter = stepPc(pcBefore)

      const actionRoll = rng()
      const doShoot = actionRoll < 0.18

      if (doShoot) {
        const target = findNearestLivingBot(bots, bot.botId, bot.pos)

        if (bot.shootCd > 0) {
          tickEvents.push({
            type: 'BOT_EXEC',
            botId: bot.botId,
            pcBefore,
            pcAfter,
            instrText: 'SHOOT_NEAREST',
            result: 'NOP',
            reason: 'COOLDOWN',
          })
        } else if (bot.ammo <= 0) {
          tickEvents.push({
            type: 'BOT_EXEC',
            botId: bot.botId,
            pcBefore,
            pcAfter,
            instrText: 'SHOOT_NEAREST',
            result: 'NOP',
            reason: 'NO_AMMO',
          })
        } else if (!target) {
          tickEvents.push({
            type: 'BOT_EXEC',
            botId: bot.botId,
            pcBefore,
            pcAfter,
            instrText: 'SHOOT_NEAREST',
            result: 'NOP',
            reason: 'INVALID_TARGET',
          })
        } else {
          const to = target.pos
          const dx = to.x - bot.pos.x
          const dy = to.y - bot.pos.y
          const len = Math.max(1e-9, Math.hypot(dx, dy))
          const vx = round3((dx / len) * BULLET_SPEED)
          const vy = round3((dy / len) * BULLET_SPEED)

          const bulletId = `B${++bulletCounter}`
          const bullet = {
            bulletId,
            ownerBotId: bot.botId,
            pos: clonePos(bot.pos),
            vel: { x: vx, y: vy },
            ttl: BULLET_TTL,
          }

          bullets.push(bullet)

          bot.ammo--
          bot.shootCd = SHOOT_COOLDOWN_TICKS

          tickEvents.push({
            type: 'BOT_EXEC',
            botId: bot.botId,
            pcBefore,
            pcAfter,
            instrText: 'SHOOT_NEAREST',
            result: 'EXECUTED',
          })

          tickEvents.push({
            type: 'RESOURCE_DELTA',
            botId: bot.botId,
            ammoDelta: -1,
            energyDelta: 0,
            healthDelta: 0,
            cause: 'SHOOT',
          })

          tickEvents.push({
            type: 'BULLET_SPAWN',
            bulletId,
            ownerBotId: bot.botId,
            pos: clonePos(bullet.pos),
            vel: { x: vx, y: vy },
            targetBotId: target.botId,
            targetPos: clonePos(target.pos),
          })
        }
      } else {
        // occasionally retarget movement direction
        if (rng() < 0.14) bot.moveDir = rngChoice(rng, DIRS)

        const dirVec = vecForDir(bot.moveDir)
        const fromPos = clonePos(bot.pos)

        let toPos = {
          x: round3(fromPos.x + dirVec.x * MOVE_SPEED),
          y: round3(fromPos.y + dirVec.y * MOVE_SPEED),
        }

        const clamped = {
          x: round3(clamp(toPos.x, BOT_CENTER_MIN, BOT_CENTER_MAX)),
          y: round3(clamp(toPos.y, BOT_CENTER_MIN, BOT_CENTER_MAX)),
        }

        const bumped = clamped.x !== toPos.x || clamped.y !== toPos.y
        toPos = clamped

        bot.pos = toPos

        tickEvents.push({
          type: 'BOT_EXEC',
          botId: bot.botId,
          pcBefore,
          pcAfter,
          instrText: `MOVE_${bot.moveDir}`,
          result: 'EXECUTED',
        })

        if (fromPos.x !== toPos.x || fromPos.y !== toPos.y) {
          tickEvents.push({
            type: 'BOT_MOVED',
            botId: bot.botId,
            fromPos,
            toPos,
            dir: bot.moveDir,
          })
        }

        if (bumped) {
          tickEvents.push({
            type: 'BUMP_WALL',
            botId: bot.botId,
            dir: bot.moveDir,
            damage: 0,
          })

          // reflect the direction for nicer motion patterns
          switch (bot.moveDir) {
            case 'LEFT':
              bot.moveDir = 'RIGHT'
              break
            case 'RIGHT':
              bot.moveDir = 'LEFT'
              break
            case 'UP':
              bot.moveDir = 'DOWN'
              break
            case 'DOWN':
              bot.moveDir = 'UP'
              break
            case 'UP_LEFT':
              bot.moveDir = 'DOWN_RIGHT'
              break
            case 'UP_RIGHT':
              bot.moveDir = 'DOWN_LEFT'
              break
            case 'DOWN_LEFT':
              bot.moveDir = 'UP_RIGHT'
              break
            case 'DOWN_RIGHT':
              bot.moveDir = 'UP_LEFT'
              break
            default:
              break
          }
        }
      }

      bot.pc = pcAfter
    }

    // bullets advance + collide
    /** @type {typeof bullets} */
    const nextBullets = []

    for (const bullet of bullets) {
      const fromPos = clonePos(bullet.pos)
      const proposedTo = {
        x: round3(fromPos.x + bullet.vel.x),
        y: round3(fromPos.y + bullet.vel.y),
      }

      const wallHit = segmentHitsArenaWall(fromPos, proposedTo)

      /** @type {{ victim: any; hit: {t:number,pos:{x:number,y:number}} } | null} */
      let bestBotHit = null

      for (const bot of bots) {
        if (!bot.alive) continue
        if (bot.botId === bullet.ownerBotId) continue

        const min = {
          x: bot.pos.x - BOT_HALF_SIZE,
          y: bot.pos.y - BOT_HALF_SIZE,
        }
        const max = {
          x: bot.pos.x + BOT_HALF_SIZE,
          y: bot.pos.y + BOT_HALF_SIZE,
        }

        const hit = segmentIntersectsAabb(fromPos, proposedTo, min, max)
        if (!hit) continue

        if (!bestBotHit || hit.t < bestBotHit.hit.t) {
          bestBotHit = { victim: bot, hit }
        }
      }

      const botHitEarlier =
        bestBotHit && (!wallHit || bestBotHit.hit.t <= wallHit.t)

      if (botHitEarlier) {
        const victim = bestBotHit.victim
        const hit = bestBotHit.hit

        tickEvents.push({
          type: 'BULLET_MOVE',
          bulletId: bullet.bulletId,
          fromPos,
          toPos: clonePos(hit.pos),
        })

        tickEvents.push({
          type: 'BULLET_HIT',
          bulletId: bullet.bulletId,
          victimBotId: victim.botId,
          damage: BULLET_DAMAGE,
          hitPos: clonePos(hit.pos),
        })

        victim.hp = Math.max(0, victim.hp - BULLET_DAMAGE)

        tickEvents.push({
          type: 'DAMAGE',
          victimBotId: victim.botId,
          amount: BULLET_DAMAGE,
          source: 'BULLET',
          sourceBotId: bullet.ownerBotId,
          kind: 'DIRECT',
          sourceRef: { type: 'BULLET', id: bullet.bulletId },
        })

        if (victim.hp <= 0 && victim.alive) {
          victim.alive = false
          tickEvents.push({
            type: 'BOT_DIED',
            victimBotId: victim.botId,
            creditedBotId: bullet.ownerBotId,
          })
        }

        tickEvents.push({
          type: 'BULLET_DESPAWN',
          bulletId: bullet.bulletId,
          reason: 'HIT',
          pos: clonePos(hit.pos),
        })

        continue
      }

      if (wallHit) {
        tickEvents.push({
          type: 'BULLET_MOVE',
          bulletId: bullet.bulletId,
          fromPos,
          toPos: clonePos(wallHit.pos),
        })

        tickEvents.push({
          type: 'BULLET_DESPAWN',
          bulletId: bullet.bulletId,
          reason: 'WALL',
          pos: clonePos(wallHit.pos),
        })
        continue
      }

      // no collisions
      bullet.pos = proposedTo
      bullet.ttl--

      tickEvents.push({
        type: 'BULLET_MOVE',
        bulletId: bullet.bulletId,
        fromPos,
        toPos: clonePos(proposedTo),
      })

      if (bullet.ttl <= 0) {
        tickEvents.push({
          type: 'BULLET_DESPAWN',
          bulletId: bullet.bulletId,
          reason: 'TTL',
          pos: clonePos(proposedTo),
        })
        continue
      }

      nextBullets.push(bullet)
    }

    bullets = nextBullets

    state.push({
      t,
      bots: bots.map((b) => ({
        botId: b.botId,
        pos: clonePos(b.pos),
        hp: b.hp,
        ammo: b.ammo,
        energy: b.energy,
        alive: b.alive,
        pc: b.pc,
      })),
      bullets: bullets.map((b) => ({
        bulletId: b.bulletId,
        ownerBotId: b.ownerBotId,
        pos: clonePos(b.pos),
        vel: { x: b.vel.x, y: b.vel.y },
      })),
      powerups: [],
    })

    events.push(tickEvents)
  }

  return {
    schemaVersion: '0.1.0',
    rulesetVersion: '0.1.0',
    ticksPerSecond: 1,
    matchSeed: seed,
    tickCap,
    bots: headerBots,
    state,
    events,
  }
}
