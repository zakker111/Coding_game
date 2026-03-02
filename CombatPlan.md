# CombatPlan.md — Projectiles, Weapon Cooldowns, and Resource Costs (Draft)

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
  - spawned entity references (for minions)

### 2.2 Resource costs (vector)

Define module resource costs as a vector so we can add hybrid weapons:
- `costAmmo` (int >= 0)
- `costEnergy` (int >= 0)

Rule:
- `USE_SLOTn` succeeds only if **all required resources** are available.
- If successful, **all costs are deducted** together.
- If not enough resources, the attempt is a no-op (no cost; no cooldown applied).

Toggle modules:
- may also define a per-tick drain (e.g., `drainEnergyPerTick` while active).

### 2.3 Cooldowns

A module may define:
- `cooldownOnUseTicks` (applies after a successful `USE_SLOTn`)

Rule:
- if `cooldownRemaining > 0`, `USE_SLOTn` is a no-op.
- when a use succeeds, set `cooldownRemaining = cooldownOnUseTicks`.
- at the end of each simulation tick, decrement down to `0`.

Notes:
- cooldown should be per-slot (not global) so future duplicates or different module instances work naturally.

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
- `targetBotId` (optional, for metadata/debug; not required for guidance)
- `sector` (current sector)
- `dir` (UP/DOWN/LEFT/RIGHT)
- `ttlRemaining` (ticks)

### 3.3 Choosing projectile direction (decision needed)

On spawn, the bullet must pick an initial direction deterministically.

Choose one:
- **A) Vertical-first shortest path**: if target row differs, fire vertically toward it; else horizontally.
- **B) Larger-axis-first**: fire along the axis with larger absolute delta; tie-break fixed.
- **C) Fixed direction priority**: choose the first direction (e.g., UP, RIGHT, DOWN, LEFT) that reduces Manhattan distance.

(Once chosen, document it as a locked rule to preserve determinism.)

### 3.4 Projectile motion

- Bullets are “slow”: move **1 sector per tick** in `dir`.
- Bullets do **not** retarget in v1 (direction is locked at spawn).
  - Future homing weapons can be implemented as different modules.

### 3.5 Walls

Locked rule from `Todo.md` / `ArenaPlan.md`:
- bullets **stop at walls** (outer boundary in v1).

Recommended v1 behavior:
- if a bullet’s next sector step would go outside the arena:
  - bullet is removed immediately
  - emit a replay event (useful for debugging)

### 3.6 Hit resolution

Locked rule:
- bullets can hit **any bot** in the sector they enter (not only the intended target).

Recommended v1 behavior:
- when the bullet moves into a sector:
  - if one or more alive bots occupy that sector, the bullet hits **exactly one** bot
  - victim selection tie-break: lowest bot id among alive bots in that sector
  - apply a damage event:
    - `source = BOT`, `sourceBotId = ownerBotId`, `kind = BULLET`
  - remove the bullet after a hit

Notes:
- bullets do not apply damage on spawn (only on entering a sector after moving).

### 3.7 TTL

Bullets should have a TTL to avoid infinite entities.
- `ttlRemaining` decrements each tick
- when it reaches 0, bullet is removed

Suggested TTL for a 3×3 arena: 6–10 ticks (tunable).

---

## 4) Future weapon archetype: Sniper (hitscan)

A sniper weapon is a module that resolves damage **instantly** rather than spawning a projectile.

Recommended properties:
- `delivery = HITSCAN`
- high `cooldownOnUseTicks`
- higher resource cost (ammo and/or energy)

Hit semantics (draft):
- on successful `USE_SLOTn <BOT_TARGET>`:
  - immediately apply damage to the resolved target bot (if valid/alive)
  - emit a `BULLET`-kind damage event (or `SNIPER` kind if you want separate stats)

This preserves the “bot has no control over mechanics” rule: bots request an attack; the module defines delivery.

---

## 5) Deterministic tick ordering (integration)

This document assumes the match loop ordering already described in `ServerPlan.md` / `Todo.md`.

Recommended high-level phases:
1) each bot executes 1 instruction (may spawn projectiles / schedule hits)
2) apply toggle drains (saw/shield)
3) advance projectiles
4) resolve projectile hits + damage
5) pickups
6) death removal + win checks

Within phases:
- process bots in `BOT1..BOT4`
- process bullets by `bulletId` ascending

---

## 6) Future-proofing for energy+ammo hybrid modules

To support modules that use both resources:
- represent costs as a vector (ammo, energy)
- apply an “all-or-nothing” affordability check

Examples of future modules supported without new opcodes:
- energy-assisted bullets (ammo + energy)
- beam weapon (energy only; hitscan)
- drone spawner (energy to spawn + energy drain per tick)

---

## 7) Timed explosive projectile: Grenade (delayed bullet)

A grenade is a **projectile** that detonates after a fixed delay (fuse) instead of dealing damage on first contact.

### 7.1 Grenade entity fields

- `grenadeId` (monotonic, deterministic)
- `ownerBotId`
- `sector` (current)
- `dir` (initial direction)
- `fuseRemaining` (ticks)
- `ttlRemaining` (ticks)

### 7.2 Movement + fuse update

Recommended v1 semantics (deterministic):
- Each tick:
  1) grenade attempts to move 1 sector along `dir`
     - if blocked by a wall: grenade stops and remains in its current sector
  2) decrement `fuseRemaining`
  3) if `fuseRemaining == 0`: detonate (see below) and remove grenade
  4) decrement `ttlRemaining`; if it reaches 0, remove grenade (failsafe)

### 7.3 Detonation (AoE)

Recommended v1 AoE for the 3×3 arena:
- damage all alive bots in:
  - the grenade’s sector (distance 0)
  - optionally adjacent sectors (distance 1) depending on the radius you pick

Attribution:
- every damage event uses:
  - `source = BOT`, `sourceBotId = ownerBotId`, `kind = OTHER` (or add `EXPLOSION` later)

Deterministic victim ordering:
- when multiple bots are damaged, apply damage in `BOT1..BOT4` order.

### 7.4 Triggering grenades

A grenade module is triggered by:
- `USE_SLOTn <TARGET>`

The module defines:
- resource costs (`costAmmo`, `costEnergy`)
- cooldown
- fuse ticks
- AoE radius
- damage

Bots do not control the fuse or AoE mechanics.

---

## 8) Deployable: Mines

A mine is a persistent entity placed into the arena that detonates later.

### 8.1 Placement model (decision to lock)

Choose one deterministic placement rule:
- **A) Drop-at-feet (simplest):** mine spawns in the bot’s current sector.
- **B) Drop adjacent:** mine spawns in the sector the bot is moving toward / facing (requires defining “facing”).
- **C) Place by target sector:** extend targeting to allow `USE_SLOTn SECTOR <N>`.

### 8.2 Mine entity fields

- `mineId` (monotonic, deterministic)
- `ownerBotId`
- `sector`
- `armRemaining` (ticks; arming delay)
- `ttlRemaining` (ticks)

### 8.3 Arming + trigger

Recommended baseline:
- mines do nothing while `armRemaining > 0`
- once armed, mine detonates when a bot enters its sector

Trigger targeting (decision to lock):
- **A) Any bot triggers** (including owner)
- **B) Enemies only trigger** (owner immune)

### 8.4 Detonation

Recommended baseline:
- on detonation:
  - apply damage in mine sector (and optionally adjacent sectors if you want AoE mines)
  - remove the mine

Attribution:
- `source = BOT`, `sourceBotId = ownerBotId`

Deterministic ordering:
- if multiple armed mines would trigger in the same tick, resolve in `mineId` ascending order.

---

## 9) Decisions to lock next

1) Grenade AoE radius:
   - **A)** same sector only
   - **B)** same + adjacent sectors

2) Mine placement model:
   - **A)** drop-at-feet
   - **B)** drop adjacent (requires facing)
   - **C)** target sector placement (requires extending target syntax)

3) Mine trigger targeting:
   - **A)** any bot triggers
   - **B)** enemies only

4) Do you want explosions to have their own damage `kind` (e.g., `EXPLOSION|MINE`) in `Ruleset.md`, or keep using `OTHER` until stats need it?

