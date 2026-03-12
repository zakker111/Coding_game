# Ruleset.md — Core Gameplay Rules (rulesetVersion `0.1.0`)

This document describes the **current implemented simulation rules** (not bot language syntax).

Implementation reference:
- `packages/engine/src/sim/runMatchToReplay.js` (+ `bulletSim.js`, `powerupSim.js`, `constants.js`)

Related docs:
- `BotInstructions.md` (what bots can write)
- `ReplayViewerPlan.md` (replay/event schema expectations)
- `ArenaPlan.md` (arena topology)

---

## 0) Time model (tick-based simulation)

- The simulation advances in **discrete ticks**.
- Replays store:
  - `state[t]`: **end-of-tick** state for tick `t`
  - `events[t]`: ordered events that occurred **during tick `t`**

(See `ReplayViewerPlan.md` §3.3.)

---

## 0.1) Match end conditions (tick cap + stalemate)

A match ends when the earliest of the following occurs:

1) **Last bot alive**
   - If exactly 1 bot is alive: `endReason = LAST_BOT_ALIVE`.

2) **Tick cap reached**
   - When the tick loop reaches `tickCapLimit`: `endReason = TICK_CAP`.

3) **Stalemate (no bot-attributable damage) rule triggers**
   - If the stalemate countdown reaches 0 with no bot-attributable damage during the countdown window: `endReason = STALEMATE`.

4) **All dead** (rare)
   - If no bots are alive: `endReason = ALL_DEAD`.

When `endReason ∈ {TICK_CAP, STALEMATE}` and multiple bots are alive, all survivors tie.

Ruleset parameters (implemented defaults):
- `tickCap = 600`
- `stalemateNoDamageGraceTicks = 120`
- `stalemateCountdownTicks = 30`

### 0.1.1) Stalemate timer semantics (implemented)

- “Bot damage” for stalemate means: **any `DAMAGE` event with `amount > 0` that includes `sourceBotId`**.
- Environment-only damage (e.g., wall bump damage without `sourceBotId`) does not prevent stalemate.

---

## 1) Bot base stats + life/death

### 1.1 Base stats

Locked ranges:
- `health` (`hp` in engine state) is `0..100`
- `ammo` is `0..100`
- `energy` is `0..100`

Initial values (implemented):
- `hp = 100`, `ammo = 100`, `energy = 100`

### 1.1.1) Module availability (current engine simplification)

The engine does **not** yet model explicit 3-slot loadouts. Instead it infers capability from bot source text:
- if the source contains `SAW` (word match) → bot is **saw-capable**
- if the source contains `SHIELD` (word match) → bot is **shield-capable**

Effective slots:
- `SLOT1` always exists:
  - if saw-capable: `SLOT1 = SAW` (toggle weapon)
  - otherwise: `SLOT1 = BULLET` (ammo weapon)
- `SLOT2` exists only if shield-capable: `SLOT2 = SHIELD` (toggle defense)
- `SLOT3` is always empty

### 1.2 Speed model (continuous movement)

Ruleset parameters (implemented):
- `speedUnitsPerTick = 12` (fixed)

Bots have continuous world positions `pos = { x, y }` and a **16×16** AABB centered at `pos`.

Movement request → integer delta:
- `MOVE <DIR>`:
  - cardinal: `(±12, 0)` / `(0, ±12)`
  - diagonal: `(±8, ±8)` (`floor(12 * 0.7071) = 8`)
- `MOVE_TO_*`:
  - compute `(dx,dy) = targetPos - fromPos`
  - if `sqrt(dx^2 + dy^2) > 12`, scale down deterministically to length `<= 12` using integer math

### 1.2.1) Movement resolution + collision (implemented)

Per tick, in `BOT1..BOT4` order:
1. Compute `candidateToPos = fromPos + delta`.
2. **Wall clamp** bot centers to `x ∈ [8,184]`, `y ∈ [8,184]`.
3. **Bot overlap blocking**: walk integer points from `fromPos → candidateToPos` using a Bresenham line.
   - if overlap with any alive bot occurs at any point, stop at the last non-overlapping point.
   - collided bot tie-break: lowest `otherBotId` among overlaps at that first colliding point.
   - emit `BUMP_BOT` for both bots (mover uses requested `dir`, other bot uses `OPPOSITE(dir)`).
   - apply bot-bump damage (see §4).
4. If no overlap occurred and the move was wall-clamped: emit `BUMP_WALL` and apply wall-bump damage (see §3).
5. If final position differs from `fromPos`: emit `BOT_MOVED`.

### 1.3 Life + death

- When `hp` reaches `0`, the bot becomes dead immediately.
- Dead bots are ignored for collision and targeting.

---

## 2) Damage events and attribution

Current engine `DAMAGE` event shape:
- required: `victimBotId`, `amount`, `source`, `kind`
- optional: `sourceBotId`, `sourceRef`

Current engine `source` values:
- `ENV` (wall bump)
- `BOT` (bot bump)
- `BULLET`
- `SAW`

Current engine `kind` values:
- `BUMP_WALL`
- `BUMP_BOT`
- `DIRECT` (weapon hits)

### 2.1 Kill credit (`lastDamageByBotId`)

- Each bot tracks `lastDamageByBotId`.
- On any `DAMAGE` that includes `sourceBotId`, set `lastDamageByBotId = sourceBotId`.
- Damage without `sourceBotId` does not change it.

On death, emit `BOT_DIED { victimBotId, creditedBotId? }` where `creditedBotId = lastDamageByBotId` (if set).

### 2.2 SHIELD mitigation (implemented)

- Shield mitigates **bullet** damage only.
- If shield is active: `damage = BULLET_DAMAGE - floor(BULLET_DAMAGE / 2)`.

`ARMOR` is not implemented.

---

## 3) Walls and wall damage

Ruleset parameters (implemented):
- `wallBumpDamage = 2`

Semantics:
- If a bot’s move is clamped by the wall **and** the move did not bump another bot, emit `BUMP_WALL` and apply wall bump damage.
- Wall bump damage is emitted as `DAMAGE { source: "ENV", kind: "BUMP_WALL" }` with no `sourceBotId`.

---

## 4) Bot-to-bot collisions (bump events)

Ruleset parameters (implemented):
- `botBumpDamage = 1` (applies to both bots)

Semantics:
- When a movement attempt causes overlap, emit `BUMP_BOT` for both bots.
- Apply `botBumpDamage` to both bots (if both are alive at time of application).
- Damage event form:
  - for bot A taking bump damage from bot B: `DAMAGE { victimBotId: A, amount: 1, source: "BOT", sourceBotId: B, kind: "BUMP_BOT" }`

---

## 5) Per-tick ordering (implemented)

The engine processes phases in this order:

1. **Bot VM execution** (`BOT1..BOT4`)
   - execute exactly 1 instruction
   - emit `BOT_EXEC`
   - bullets may be spawned in this phase (`BULLET_SPAWN`)
2. **Toggle drains**
   - if `sawActive`: `energy -= 1` (auto-off at `energy == 0`)
   - if `shieldActive`: `energy -= 1` (auto-off at `energy == 0`)
3. **Movement + collision**
4. **Saw damage**
5. **Bullet updates** (movement + hits + TTL)
6. **Powerup pickups**
7. **End-of-tick maintenance**
   - cooldown decrement
   - copy bump flags to `*LastTick`
   - powerup TTL despawns
   - powerup spawn timer + spawn
   - clear a bot’s preferred powerup target if that type no longer exists
8. **End condition check**
   - if an end condition fires, emit `MATCH_END` and stop

---

## 5.1 Bullet projectiles (continuous)

Ruleset parameters (implemented):
- `bulletSpeedUnitsPerTick = 16`
- `bulletTtlTicks = 18`
- `bulletDamage = 10`
- `bulletAmmoCost = 1`
- `bulletCooldownTicks = 4`

Firing:
- Requires:
  - `SLOT1` is `BULLET` (i.e., bot is not saw-capable)
  - `ammo >= bulletAmmoCost`
  - `slot1Cooldown == 0`
- On fire:
  - resolve target bot id at execution time
  - compute `vel = Normalize(targetPos - shooterPos) * bulletSpeed`
    - **current engine:** normalization uses `Math.hypot` + rounding but clamps to ensure `|vel| <= bulletSpeed` and returns integers
  - compute a **muzzle offset** so bullets spawn outside the shooter AABB:
    - uses L∞ normalization to `BOT_HALF_SIZE + 2`
  - spawn `pos = shooterPos + muzzleOffset` (clamped inside arena bounds)
  - emit `BULLET_SPAWN`

Movement + collision:
- Each tick, each bullet advances from `fromPos → candidateToPos`.
- The engine walks integer points on the segment using Bresenham and finds the first collision:
  - wall (outside arena bounds)
  - bot AABB (excluding owner)
- On hit:
  - emit `BULLET_MOVE` with `toPos` as the hit point
  - emit `BULLET_HIT`
  - apply damage (shield may reduce)
  - emit `DAMAGE` with `source = "BULLET"`, `kind = "DIRECT"`, `sourceRef = { type: "BULLET", id }`
  - emit `BULLET_DESPAWN reason=HIT`
- On wall:
  - emit `BULLET_DESPAWN reason=WALL`
- On no hit:
  - emit `BULLET_MOVE` and decrement TTL
  - when TTL reaches 0: emit `BULLET_DESPAWN reason=TTL`

Tie-breaks:
- At each stepped point, bots are checked in `BOT1..BOT4` order, so simultaneous overlaps at the same point resolve to the lowest bot id.

---

## 5.2 SAW (melee) (implemented)

Ruleset parameters (implemented):
- `sawDamagePerTick = 6`
- `sawEnergyDrainPerTick = 1`
- `sawRangeUnits = BOT_HALF_SIZE*2 + 2 = 18` (Euclidean)

- If `sawActive` and the closest enemy bot within range exists, deal damage once per tick:
  - `DAMAGE { source: "SAW", kind: "DIRECT", sourceBotId: attacker }`

---

## 7) Powerups (spawn + pickup)

Types (implemented): `HEALTH | AMMO | ENERGY`.

Ruleset parameters (implemented):
- `powerupSpawnIntervalMinTicks = 10`
- `powerupSpawnIntervalMaxTicks = 20`
- `powerupMaxActive = 6`
- `powerupLifetimeTicks = 30`
- `powerupHealthDelta = 30`
- `powerupAmmoDelta = 20`
- `powerupEnergyDelta = 30`

Spawn behavior (implemented):
- A single global timer (`spawnRemainingTicks`) controls spawns.
- At end-of-tick maintenance:
  - decrement `spawnRemainingTicks`
  - when it reaches 0, attempt to spawn 1 powerup
  - if `active >= powerupMaxActive`, set `spawnRemainingTicks = 1` (retry next tick)
  - choose a free anchor among the 45 anchors in stable order (sector asc; center first; zones 1..4)
  - avoid spawning directly inside a bot AABB
  - choose type uniformly among `HEALTH|AMMO|ENERGY`
  - emit `POWERUP_SPAWN { powerupType, loc }`
  - reset `spawnRemainingTicks` by sampling uniformly from `[min,max]`

Pickup behavior (implemented):
- During pickup phase, for each bot in `BOT1..BOT4` order:
  - if bot AABB overlaps a powerup anchor point: pick up
  - emit `POWERUP_PICKUP` then `POWERUP_DESPAWN reason=PICKUP`
  - apply delta (capped at 100) and emit `RESOURCE_DELTA` (if any gain)

Lifetime:
- Each powerup records `expiresAtTick = spawnTick + powerupLifetimeTicks`.
- At end-of-tick maintenance, expired powerups are removed and emit `POWERUP_DESPAWN reason=RULES`.



