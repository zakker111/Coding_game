# CombatPlan.md — Projectiles, Weapon Cooldowns, Resource Costs, Grenades, Mines (Draft)

This document defines **combat mechanics** that bots can trigger via slot modules (e.g., bullet weapons) while keeping the bot instruction set small.

It complements:
- `BotInstructions.md` (how bots issue actions)
- `Ruleset.md` (death + attribution + ordering)
- `FutureProofing.md` (how to extend modules)

---

## 1) Design goals

- Deterministic and replayable.
- Weapon behavior is **module-defined** (data + simulation code), not bot-defined.
- A single stable bot instruction (`USE_SLOTn`) can trigger many future weapons.
- Support modules that consume:
  - ammo
  - energy
  - (future) both ammo + energy
- Support multiple delivery archetypes:
  - **projectile** (slow bullets)
  - **hitscan** (sniper)
  - **timed explosive projectiles** (grenade: delay/fuse then explode)
  - **deployables** (mines, turrets, traps)

---

## 2) Module execution model (future-proof)

Each equipped slot behaves like a small deterministic state machine owned by the bot.

### 2.1 Per-slot state (recommended)

Store per bot, per slot:
- `cooldownRemaining` (ticks; integer >= 0)
- optional module-specific state:
  - toggles (on/off)
  - charges / stacks
  - spawned entity references (for helpers/minions)

### 2.2 Resource costs (vector)

Define module resource costs as a vector so we can add hybrid weapons:
- `costAmmo` (int >= 0)
- `costEnergy` (int >= 0)

Rule:
- `USE_SLOTn` succeeds only if **all required resources** are available.
- If successful, **all costs are deducted** together.
- If not enough resources, the attempt is a deterministic no-op:
  - no cost
  - no cooldown applied

Toggle modules:
- may also define a per-tick drain (e.g., `drainEnergyPerTick` while active).

### 2.3 Cooldowns

A module may define:
- `cooldownOnUseTicks` (applies after a successful `USE_SLOTn`)

Rule:
- if `cooldownRemaining > 0`, `USE_SLOTn` is a no-op.
- when a use succeeds, set `cooldownRemaining = cooldownOnUseTicks`.
- at the end of each simulation tick, decrement down to `0`.

---

## 3) Bullet weapon (v1 projectile)

This defines the default `BULLET` module.

### 3.1 Fire semantics

When a bot successfully executes `USE_SLOTn <BOT_TARGET>` for a slot containing `BULLET`:
- pay `costAmmo` (and `costEnergy` if configured for future hybrid bullets)
- apply cooldown
- spawn a **bullet projectile entity**

### 3.2 Projectile entity fields (minimum)

- `bulletId` (monotonic, deterministic)
- `ownerBotId`
- `targetBotId` (optional, for metadata/debug)
- `sector` (current sector)
- `dir` (UP/DOWN/LEFT/RIGHT)
- `ttlRemaining` (ticks)

### 3.3 Choosing projectile direction (decision needed)

On spawn, the bullet must pick an initial direction deterministically.

Choose one:
- **A) Vertical-first shortest path**: if target row differs, fire vertically toward it; else horizontally.
- **B) Larger-axis-first**: fire along the axis with larger absolute delta; tie-break fixed.
- **C) Fixed direction priority**: choose the first direction (e.g., UP, RIGHT, DOWN, LEFT) that reduces Manhattan distance.

### 3.4 Projectile motion

- Bullets are “slow”: move **1 sector per tick** in `dir`.
- Bullets do **not** retarget in v1 (direction is locked at spawn).

### 3.5 Walls

Locked (from `ArenaPlan.md` / `Todo.md`):
- bullets **stop at walls** (outer boundary in v1).

Recommended v1 behavior (locked):
- if a bullet’s next step would go outside the arena: remove bullet immediately and emit a replay event.

### 3.6 Hit resolution

Locked:
- bullets can hit **any bot** in the sector they enter (not only the intended target).

Recommended v1 behavior:
- after moving into a sector:
  - if one or more alive bots occupy that sector, the bullet hits **exactly one** bot
  - victim tie-break: lowest bot id in that sector
  - emit damage:
    - `source = BOT`, `sourceBotId = ownerBotId`, `kind = BULLET`
  - remove bullet after a hit

### 3.7 TTL

- `ttlRemaining` decrements each tick
- when it reaches 0, remove bullet

Suggested TTL for a 3×3 arena: 6–10 ticks (tunable).

---

## 4) Future weapon archetype: Sniper (hitscan)

A sniper weapon resolves damage **instantly** rather than spawning a projectile.

Recommended properties:
- `delivery = HITSCAN`
- high `cooldownOnUseTicks`
- higher resource cost (ammo and/or energy)

Hit semantics (draft):
- on successful `USE_SLOTn <BOT_TARGET>`:
  - immediately apply damage to the resolved target bot (if valid/alive)
  - emit a damage event:
    - `kind = BULLET` (or `SNIPER` if you want separate stats later)

---

## 5) Deterministic tick ordering (combat-focused)

Recommended high-level phases:
1) each bot executes 1 instruction (may spawn projectiles / deployables)
2) apply toggle drains (saw/shield)
3) advance bullets/grenades
4) resolve bullet hits
5) resolve explosions
6) pickups
7) death removal + win checks

Within phases:
- process bots in `BOT1..BOT4`
- process entities in id order (`bulletId`, `grenadeId`, `mineId` ascending)

---

## 6) Timed explosive projectile: Grenade (delayed bullet)

A grenade is a projectile that detonates after a fixed delay (fuse).

### 6.1 Grenade entity fields

- `grenadeId` (monotonic, deterministic)
- `ownerBotId`
- `sector` (current)
- `dir` (initial direction)
- `fuseRemaining` (ticks)
- `ttlRemaining` (ticks)

### 6.2 Movement + fuse update

Recommended deterministic update per tick:
1) grenade attempts to move 1 sector along `dir`
   - if blocked by a wall: grenade stops and remains in its current sector
2) decrement `fuseRemaining`
3) if `fuseRemaining == 0`: detonate and remove grenade
4) decrement `ttlRemaining`; if it reaches 0, remove grenade (failsafe)

### 6.3 Detonation (AoE)

Locked v1 AoE shape:
- **radius = 1 sector**
  - center: grenade sector (distance 0)
  - ring: adjacent sectors (distance 1)

Locked v1 falloff:
- bots in the **center sector** take **more** damage than bots in adjacent sectors.

Module-defined numbers:
- `damageCenter`
- `damageAdjacent`

Attribution:
- `source = BOT`, `sourceBotId = ownerBotId`, `kind = OTHER` (or `EXPLOSION` later)

Deterministic ordering:
- apply explosion damage in `BOT1..BOT4` order.

---

## 7) Deployable: Mines

A mine is a persistent entity placed into the arena that detonates after a bot hits it.

### 7.1 Placement model (still to decide)

Choose one deterministic placement rule:
- **A) Drop-at-feet (simplest):** mine spawns in the bot’s current sector.
- **B) Drop adjacent:** mine spawns in the sector the bot is moving toward / facing (requires defining “facing”).
- **C) Place by target sector:** extend targeting to allow `USE_SLOTn SECTOR <N>`.

### 7.2 Mine entity fields

- `mineId` (monotonic, deterministic)
- `ownerBotId`
- `sector`
- `armRemaining` (ticks; arming delay)
- `ttlRemaining` (ticks)

### 7.3 Arming + trigger

Baseline:
- mine does nothing while `armRemaining > 0`
- once armed, mine detonates when a bot enters its sector ("hits it")

Trigger targeting (still to decide):
- **A) Any bot triggers** (including owner)
- **B) Enemies only trigger** (owner immune)

### 7.4 Detonation (AoE)

Locked v1 AoE shape:
- **radius = 1 sector**
  - center: mine sector (distance 0)
  - ring: adjacent sectors (distance 1)

Locked v1 falloff:
- bots in the **mine sector** take **more** damage than bots in adjacent sectors.

Module-defined numbers:
- `damageCenter`
- `damageAdjacent`

Attribution:
- `source = BOT`, `sourceBotId = ownerBotId`, `kind = OTHER` (or `MINE` later)

Deterministic ordering:
- if multiple mines trigger in the same tick: resolve in `mineId` ascending order
- for a given mine explosion, apply damage in `BOT1..BOT4` order

---

## 8) Force effects (future; draft)

This section outlines a deterministic way to add "forces" later (knockback, pull, recoil) while keeping the simulation replayable.

Design constraints:
- no floating point physics in v1
- forces must be expressible as **anchor moves** (`loc = {sector, zone}`)

Recommended force primitives (add later if desired):
- **Knockback**: move a bot 1 anchor-step away from a source location/sector.
- **Pull**: move a bot 1 anchor-step toward a source location/sector.
- **Stun/slow**: temporarily increase `moveCooldownRemaining` (ties into `Ruleset.md` §1.2).
- **Recoil**: a weapon use applies a knockback to the shooter.

Deterministic ordering (recommended):
- resolve forced moves in a dedicated phase after explosions but before pickups
- apply in `BOT1..BOT4` order
- if a forced move would hit the outer wall, treat as a wall bump (optional) or clamp/no-op (must be specified)

Replay requirements:
- add explicit events (so UI does not infer):
  - `FORCE_APPLIED { botId, kind: KNOCKBACK|PULL|STUN, fromLoc, toLoc?, magnitude?, source }`

---

## 9) Decisions to lock next

1) Bullet direction selection: **A / B / C** (see §3.3)

2) Bullet default numbers for v1 (placeholders are fine):
- `costAmmo` per shot: 1 / 2 / 5
- `cooldownOnUseTicks`: 0 / 1 / 3 / 5
- `ttlRemaining`: 6 / 8 / 10

3) Mine placement model: **A / B / C** (see §7.1)

4) Mine trigger targeting: **A / B** (see §7.3)

5) Damage event kinds:
- keep using `OTHER` for explosions, or
- add explicit kinds like `EXPLOSION` and `MINE`
