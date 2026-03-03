# Ruleset.md — Core Gameplay Rules (Draft)

This document is the **rules of the simulation** (not bot language syntax).

It complements:
- `BotInstructions.md` (what bots can write)
- `ArenaPlan.md` (arena topology and wall behavior)
- `DailyCompetition.md` (server-side competition)

---

## 0) Time model (tick-based simulation)

- The authoritative game simulation advances in **discrete ticks**.
- All gameplay-relevant state changes (movement, damage, pickups, deaths, cooldown updates) happen during tick resolution and are visible in the replay as **per-tick** snapshots/events.
- “Smooth movement” is a **rendering-only** concern:
  - the UI/replay viewer may interpolate positions between tick snapshots for readability while playing
  - when paused/scrubbing/stepping, the UI should render the exact tick snapshot

(See `ReplayViewerPlan.md` §3.3 and `ArenaVisualPlan.md` §7.2.)

---

## 1) Bot base stats + life/death

### 1.1 Base stats (v1)

Bots have a small set of core stats.

Locked v1 ranges:
- `health` is an integer in **0..100** (max health = 100)
- `ammo` is an integer in **0..100**
- `energy` is an integer in **0..100**

Initial values (v1 recommended defaults; may become ruleset parameters later):
- `health = 100`
- `ammo = 100`
- `energy = 100`

New (locked direction): bots also have:
- `botBaseArmor` (integer or small fixed-point; exact reduction math is defined elsewhere)
  - v1 recommended default: `0`
- `baseSpeed` (implemented as a deterministic movement cooldown model; see §1.2)

Loadout constraints (v1 validation rules):
- bots have 3 slot positions; slots may be empty
- allowed v1 module types: `BULLET | SAW | SHIELD | ARMOR`
- no duplicate modules among equipped slots (duplicates are by **module type**)
- at most one **weapon** module equipped (v1 weapons: `BULLET | SAW`)

> Note: we keep the exact armor reduction formula intentionally simple in v1 and tune it later.

### 1.2 Speed model (movement cooldown; loadout affects speed)

Bots execute **1 instruction per tick** (see `BotInstructions.md`).

Movement speed is represented as a deterministic cooldown so bots can be “faster” or “slower” without changing tick length:

Ruleset parameters (v1):
- `baseMoveCooldownOnMoveTicks` (recommended default: `0`)
- `perEquippedSlotMoveCooldownPenaltyTicks` (recommended default: `1`)

Derived per bot each tick:
- `equippedSlotCount` = number of non-empty slots in the bot’s 3-slot loadout
- `moveCooldownOnMoveTicks = baseMoveCooldownOnMoveTicks + equippedSlotCount * perEquippedSlotMoveCooldownPenaltyTicks`

Runtime state per bot:
- `moveCooldownRemaining` (integer >= 0)

Rules:
- a movement attempt (from an immediate move instruction or an auto-move goal) **only succeeds** when `moveCooldownRemaining == 0`.
- if a move succeeds, set:
  - `moveCooldownRemaining = moveCooldownOnMoveTicks + 1`
  - (this ensures that a cooldown of `1` blocks movement for the *next* tick)
- at end-of-tick maintenance, decrement `moveCooldownRemaining` down to `0`.

Example timeline (with `moveCooldownOnMoveTicks = 1`):
- tick 10: move succeeds ⇒ set remaining to 2 ⇒ end-of-tick decrement ⇒ remaining = 1
- tick 11: remaining > 0 ⇒ move blocked ⇒ end-of-tick decrement ⇒ remaining = 0
- tick 12: remaining == 0 ⇒ move allowed again

Effect (intended gameplay):
- empty slots ⇒ smaller `equippedSlotCount` ⇒ **faster movement**
- more equipped slots ⇒ **slower movement**

### 1.3 Life + death

- When a bot’s `health` reaches **0** (or below) at any point during tick resolution:
  - the bot becomes **dead** immediately for the remainder of the match
  - the bot is **removed from the arena** (no longer occupies a sector / no longer collidable)
  - dead bots are ignored by:
    - targeting (`TARGET_CLOSEST`, `TARGET_NEXT`, etc.)
    - movement helpers (`MOVE_TO_CLOSEST_BOT`, etc.)
    - hit resolution (bullets cannot “hit” a dead bot)

A dead bot still exists as a record in match stats / replay events.

---

## 2) Damage events and attribution

All health reduction happens via **damage events**. Each damage event must include:
- `victimBotId`
- `amount` (positive integer)
- `source` (one of):
  - `BOT` (another bot caused the damage)
  - `ENV` (environment; e.g., wall)
- `sourceBotId` (only present when `source == BOT`)
- `kind` (optional; helps replays/UI): `BULLET|SAW|BUMP_BOT|BUMP_WALL|EXPLOSION|MINE|OTHER`

### 2.1 Last-damage dealer (kill credit rule)

Each bot tracks:
- `lastDamageByBotId` (nullable)

Update rule:
- When `victim` takes damage from `source == BOT`, set:
  - `victim.lastDamageByBotId = sourceBotId`
  - examples of `source == BOT` damage kinds:
    - bullet hits
    - saw damage
    - bot bump / ramming damage (if/when implemented)
- When `victim` takes damage from `source == ENV` (example: wall bump damage):
  - **do not change** `lastDamageByBotId`

Persistence:
- `lastDamageByBotId` persists until the victim takes another `source == BOT` damage event.
- There is **no timeout** in v1 (so a later wall death still credits the last attacker).

This matches the desired semantics:
- if a bot dies to wall damage after being attacked/bumped previously, the **last bot that damaged it** receives the kill credit
- even if the final damage looks like “self-destruct” / environment, kill credit still goes to the last attacker

### 2.2 Death event + kill credit

When a bot dies (health becomes 0):
- emit a deterministic replay event:
  - `BOT_DIED { victimBotId, creditedBotId? }`
- compute `creditedBotId` as:
  - if `victim.lastDamageByBotId` is set: credit that bot
  - else: no credit (environment kill)

The credited bot receives:
- `kills += 1` in match stats

The victim receives:
- `deaths += 1` in match stats

---

## 3) Walls and wall damage

Walls are gameplay:
- if a bot bumps a wall it takes a small amount of damage (`BUMP_WALL`)
- wall damage is `source == ENV`
- wall damage **can cause death**
- if wall damage causes death, kill credit still goes to `lastDamageByBotId` (if present)

Ruleset parameters:
- `wallBumpDamage` (int; v1 TBD)

---

## 4) Bot-to-bot collisions (bump events)

Bots can collide with each other. The simulation should emit/track **bump events** so bot code can react (see `BUMPED_BOT*` predicates in `BotInstructions.md`).

Event requirements:
- A bot-to-bot collision produces a bump event for **both** bots.
- The bump event should include:
  - which bot it collided with (`otherBotId`)
  - direction of impact relative to the bot (`dir`)

Direction rule (recommended for v1):
- If the collision was caused by a bot’s movement attempt in direction `<DIR>`, then:
  - mover records `dir = <DIR>`
  - the other bot records `dir = OPPOSITE(<DIR>)`

Damage (to finalize):
- If you decide that bot-to-bot bumps cause damage, it should be recorded as `source == BOT` with `kind == BUMP_BOT`, so it participates in kill credit via `lastDamageByBotId`.

---

## 5) Simultaneous damage and deterministic ordering

Multiple damage events may apply in one tick.

Determinism requirement:
- the engine must apply damage events in a stable, documented order.

Recommendation (v1):
- resolve damage in a fixed phase order (example):
  1) movement/bump resolution damage
  2) saw damage
  3) bullet hits
- within each phase:
  - process bots in `BOT1..BOT4` order
  - process entities in stable creation order (e.g., bullet id ascending)

Determinism-critical tie-break (bullets):
- when a bullet enters a sector that contains multiple alive bots, it hits **exactly one** victim:
  - victim = lowest bot id in that sector (`BOT1` before `BOT2` ...)

Kill credit in multi-hit ticks:
- because `lastDamageByBotId` is updated as damage is applied, the credited killer is whichever bot delivered the **final BOT-sourced damage event** that occurred before death (in the deterministic order above).

---

## 6) Match stats vs season points

Match stats should include (at minimum):
- placement (1st–4th)
- survival ticks
- kills / deaths
- damage dealt / damage taken
- wall bump count / wall bump damage taken

Season points are computed from match stats by a configurable formula (see `DailyCompetition.md`).

---

## 7) Powerups (spawn + pickup)

Powerups are the only way to restore resources in v1.

Types:
- `HEALTH`
- `AMMO`
- `ENERGY`

### 7.1 Spawn locations (sector + zone anchors)

Powerups can spawn at the location anchors from `ArenaPlan.md`:
- sector centers: `SECTOR 1..9`
- zone centers: `SECTOR 1..9 ZONE 1..4`

Zone numbering (per `ArenaPlan.md` / `UIPlan.md`):
- `ZONE 1` = top-left
- `ZONE 2` = top-right
- `ZONE 3` = bottom-left
- `ZONE 4` = bottom-right

In replays/events, encode anchors as `loc = { sector, zone }` (see `ReplayViewerPlan.md`):
- `SECTOR s` → `{ sector: s, zone: 0 }`
- `SECTOR s ZONE z` → `{ sector: s, zone: z }`

Total spawn locations: `9 + 9*4 = 45`.

At most one powerup can exist at a given spawn location at a time.

### 7.2 Spawn schedule (random but deterministic; 10–20 seconds)

Powerup spawning is driven by a **single global spawn timer** so the overall spawn rate is controllable.

Ruleset parameters (must be stored with `rulesetVersion`):
- `ticksPerSecond` (integer; v1 fixed to `1`)
  - `1 tick = 1 second` of simulated time
- Movement speed parameters (see §1.2):
  - `baseMoveCooldownOnMoveTicks` (v1 recommended: `0`)
  - `perEquippedSlotMoveCooldownPenaltyTicks` (v1 recommended: `1`)
- Wall bump damage:
  - `wallBumpDamage` (int; v1 TBD)
- `powerupSpawnIntervalMinTicks` (v1: `10`)
- `powerupSpawnIntervalMaxTicks` (v1: `20`)
  - must satisfy:
    - `powerupSpawnIntervalMaxTicks <= ticksPerSecond * 60`
    - this guarantees **at least one spawn per simulated minute** (as long as there is an empty spawn anchor)
  - with v1 values, the spawn interval is **10–20 seconds** (10–20 ticks)
- `powerupMaxActive` (optional cap; prevents arena clutter)
- `powerupTypeWeights` (optional; if not provided, use uniform)

State:
- `spawnRemainingTicks` (integer >= 0)

Deterministic update:
- At match start, initialize `spawnRemainingTicks` by sampling an integer uniformly from `[min,max]` using the match RNG.
- At the end of each tick:
  1) decrement `spawnRemainingTicks` down to `0`
  2) if `spawnRemainingTicks == 0`, attempt to spawn **one** powerup:
     - if `powerupMaxActive` is set and active powerups already equal the cap: do not spawn; set `spawnRemainingTicks = 1` (retry next tick)
     - else choose a spawn location:
       - compute the set of **empty** spawn anchors (45 anchors; see §7.1)
         - enumerate anchors in a stable order:
           - sector id ascending
           - sector center first (`zone=0`)
           - then zones 1..4
       - if none are empty: set `spawnRemainingTicks = 1` (retry next tick)
       - else pick one empty anchor using seeded RNG (index into the ordered list)
     - choose powerup `type` (see §7.3)
     - create the powerup at that anchor and emit `POWERUP_SPAWN`
     - reset `spawnRemainingTicks` by sampling an integer uniformly from `[min,max]` again

### 7.3 Choosing the spawned powerup type

When a spawn occurs, choose the type using the seeded RNG.

Recommended v1 policy:
- weighted distribution via `powerupTypeWeights`
  - schema: `{ HEALTH: number, AMMO: number, ENERGY: number }`
  - weights must be non-negative; at least one weight must be > 0
  - if a key is missing, treat it as 0
  - normalize weights internally to a probability distribution
- if weights not provided, default to uniform among `HEALTH|AMMO|ENERGY`

### 7.4 Pickup semantics (collision)

Pickup phase (see tick ordering in `ServerSimulationPlan.md`):
- If an **alive** bot’s location anchor equals a powerup’s location anchor, the bot **collides** with the powerup and automatically picks it up.
  - Bots that reached `health <= 0` earlier in the tick do not pick up powerups later in the tick.
- Apply a **fixed amount** per powerup type (this principle should hold for any future powerup too):
  - `HEALTH`: `health = min(100, health + powerupHealthDelta)`
  - `AMMO`: `ammo = min(100, ammo + powerupAmmoDelta)`
  - `ENERGY`: `energy = min(100, energy + powerupEnergyDelta)`
- Remove the powerup entity from the arena.

Ruleset parameters:
- `powerupHealthDelta` (int)
- `powerupAmmoDelta` (int)
- `powerupEnergyDelta` (int)

Deterministic ordering:
- If multiple pickups would occur in the same tick (different bots at different powerups), process bots in `BOT1..BOT4` order.

Future (physics migration):
- if/when the simulation moves to continuous positions, “collision” becomes 32×32 AABB overlap.
- the pickup semantics above remain the same; only collision detection changes.

