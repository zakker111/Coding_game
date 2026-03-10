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
  - the UI/replay viewer should interpolate positions between tick snapshots for readability while playing
  - when paused/scrubbing/stepping, the UI should render the exact tick snapshot (no intra-tick interpolation)

(See `ReplayViewerPlan.md` §3.3 and `ArenaVisualPlan.md` §7.2.)

---

## 0.1) Match end conditions (tick cap + stalemate)

A match ends when the earliest of the following occurs:

1) **Last bot alive**
   - If exactly 1 bot is alive, that bot wins and the match ends immediately.

2) **Tick cap reached**
   - If the match reaches `tickCap`, end the match with `endReason = TICK_CAP`.

3) **Stalemate (no bot-vs-bot damage) rule triggers**
   - If the stalemate countdown reaches 0 with no **bot-vs-bot damage** dealt during the countdown window, end the match with `endReason = STALEMATE`.

Outcome when the match ends without a single winner:
- If `endReason ∈ {TICK_CAP, STALEMATE}` and **multiple bots are alive**, all surviving bots **tie**.
- If the match ends with **0 bots alive** (possible via same-tick mutual deaths), the result is a draw with **no survivors**.

Ruleset / match parameters (v1 recommended defaults; may become “locked” later):
- `tickCap` (int): maximum ticks to simulate before ending with `TICK_CAP`.
  - v1 recommended default: `600` (10 minutes at `ticksPerSecond = 1`)
- `stalemateNoDamageGraceTicks` (int): no **bot-vs-bot damage** duration required before starting the stalemate countdown.
  - v1 recommended default: `120` (2 minutes)
- `stalemateCountdownTicks` (int): countdown duration after the grace period.
  - v1 recommended default: `30` (30 seconds)

### 0.1.1) Stalemate timer semantics (no bot-vs-bot damage)

Definitions:
- “Damage dealt” (for the stalemate system) means any `DAMAGE` event with `amount > 0` where `source == BOT` (i.e., bots damaging each other).
  - Damage from the environment (e.g., wall bump damage with `source == ENV`) does **not** count and does not prevent a stalemate.
- The stalemate system is only considered when `aliveBotCount >= 2`.

Match-level state (conceptual; exact representation is up to the engine):
- `ticksSinceLastBotDamage` (int >= 0)
- `stalemateCountdownRemainingTicks` (int | null)

Rules:
- On any tick where at least one **bot-vs-bot** damage event occurs (`source == BOT`):
  - set `ticksSinceLastBotDamage = 0`
  - set `stalemateCountdownRemainingTicks = null` (cancel/reset any countdown)
- Otherwise (no bot-vs-bot damage this tick):
  - increment `ticksSinceLastBotDamage`
  - if `aliveBotCount >= 2`:
    - if `stalemateCountdownRemainingTicks == null` and `ticksSinceLastBotDamage == stalemateNoDamageGraceTicks`:
      - start the countdown: set `stalemateCountdownRemainingTicks = stalemateCountdownTicks`
    - else if `stalemateCountdownRemainingTicks != null`:
      - decrement `stalemateCountdownRemainingTicks`
      - if it reaches `0` (and no bot-vs-bot damage has occurred since countdown start): end match with `endReason = STALEMATE`

Notes:
- If bot count drops to `aliveBotCount <= 1`, the match ends by “last bot alive” (stalemate countdown is irrelevant).
- UI/replay viewers may display the countdown when `stalemateCountdownRemainingTicks != null` (see `UIPlan.md`).

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

Ammo rules (v1):
- Firing a bullet consumes ammo.
- Ammo does not regenerate.
- Only `AMMO` powerups increase ammo (see §7).

New (locked direction): bots also have:
- `botBaseArmor` (integer or small fixed-point; exact reduction math is defined elsewhere)
  - v1 recommended default: `0`
- `baseSpeedUnitsPerTick` (integer or fixed-point; world units per tick; see §1.2)

Loadout constraints (v1 validation rules):
- bots have 3 slot positions; slots may be empty
- allowed v1 module types: `BULLET | SAW | SHIELD | ARMOR`
- no duplicate modules among equipped slots (duplicates are by **module type**)
- at most one **weapon** module equipped (v1 weapons: `BULLET | SAW`)

> Note: we keep the exact armor reduction formula intentionally simple in v1 and tune it later.

### 1.2 Speed model (continuous movement; loadout affects `speedUnitsPerTick`)

Bots execute **1 instruction per tick** (see `BotInstructions.md`).

Bot movement is **continuous** in arena world units (see `ArenaPlan.md`): each bot has a world position `pos = { x, y }` and a **16×16** axis-aligned hitbox (AABB) centered at `pos`.

Ruleset parameters (v1 recommended defaults):
- `baseSpeedUnitsPerTick = 16` (world units per tick)
- `perEquippedSlotSpeedPenaltyUnitsPerTick = 4` (world units per tick)
- `minSpeedUnitsPerTick = 4` (world units per tick)

So with 0/1/2/3 equipped slots, `speedUnitsPerTick` is `16/12/8/4` respectively.

UI note: if the viewer uses `S` pixels per world unit (`ArenaVisualPlan.md`), this corresponds to `16*S` pixels per tick at base speed.

Derived per bot each tick:
- `equippedSlotCount` = number of non-empty slots in the bot’s 3-slot loadout
- `speedUnitsPerTick = max(minSpeedUnitsPerTick, baseSpeedUnitsPerTick - equippedSlotCount * perEquippedSlotSpeedPenaltyUnitsPerTick)`

Rules (movement + collision; v1):
- Each tick, the engine derives at most one `moveRequest` per bot (from an immediate move instruction or an active move goal).
- A `moveRequest` deterministically produces a **candidate displacement** `delta = {dx, dy}` (continuous / fixed-point) where:
  - the straight-line length `|delta|` is `<= speedUnitsPerTick` (world units per tick)
  - the exact mapping from instructions/goals → `delta` and the required fixed-point math are defined in `BotInstructions.md`.
  - the move also has an associated direction token `dir ∈ {UP,DOWN,LEFT,RIGHT,UP_LEFT,UP_RIGHT,DOWN_LEFT,DOWN_RIGHT}` used for bump events.
- Movement is resolved in `BOT1..BOT4` order using stable, implementable rules:
  1) Let `fromPos` be the bot’s start-of-movement position for the tick.
  2) Compute `candidateToPos = fromPos + delta`.
  3) **Wall clamp**: clamp `candidateToPos` so the entire 16×16 bot hitbox stays inside the arena.
     - using `ArenaPlan.md` bounds, this is equivalent to clamping bot centers to `x ∈ [8,184]`, `y ∈ [8,184]`.
     - if clamping changed `candidateToPos`, emit `BUMP_WALL` and apply `wallBumpDamage`.
  4) **Bot–bot collision**: treat the movement as a swept segment `fromPos → candidateToPos`.
     - If at any point along that segment this bot’s hitbox would overlap any other alive bot’s hitbox, the bot “bumps”.
     - Choose the collided bot deterministically:
       - lowest `otherBotId` among the overlapping bots at the first colliding point.
     - Set `toPos` to the **last non-overlapping point** along the segment (may equal `fromPos`).
     - Emit `BUMP_BOT` for **both** bots (`dir` and `OPPOSITE(dir)`), with `dir` being the bot’s requested move direction for the tick.
  5) Otherwise, movement succeeds: set `toPos = candidateToPos` and emit `BOT_MOVED { fromPos, toPos, dir? }`.

Notes:
- This “stop before overlap” rule is intentionally simple; future rulesets can add sliding/pushing without changing the DSL.
- If a bot both hits a wall and would overlap another bot after wall-clamp, the bot–bot collision rule wins (movement stops before overlap), but the wall bump/damage still applies if the request attempted to cross the wall.


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
- on a wall bump, the bot’s movement for that tick is clamped at the wall impact point (it does not pass through or reflect)
- wall damage is `source == ENV`
- wall damage **can cause death**
- if wall damage causes death, kill credit still goes to `lastDamageByBotId` (if present)

Rendering note:
- The UI/replay viewer should show a small deterministic “bounce” effect on `BUMP_WALL` (purely visual; see `ArenaVisualPlan.md` §5.7).

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
- If the collision was caused by a bot’s movement attempt in direction `dir ∈ {UP,DOWN,LEFT,RIGHT,UP_LEFT,UP_RIGHT,DOWN_LEFT,DOWN_RIGHT}`, then:
  - mover records `dir`
  - the other bot records `dir = OPPOSITE(dir)`
    - `OPPOSITE(UP)=DOWN`, `OPPOSITE(LEFT)=RIGHT`, `OPPOSITE(UP_LEFT)=DOWN_RIGHT`, etc.

Rendering note:
- The UI/replay viewer should show a small deterministic “bounce” effect on `BUMP_BOT` (purely visual; see `ArenaVisualPlan.md` §5.7).

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

### 5.1 Bullet projectiles (continuous)

Bots have **no directional weapons**: bullet weapons do not require or use a bot-facing direction.

When a bullet is fired (see `CombatPlan.md` §3):
- resolve the `<TARGET>` to a concrete `targetBotId`
- compute:
  - `spawnPos` = shooter bot’s current world position
  - `targetPos` = target bot’s current world position **at the moment of firing**
- set bullet velocity toward the target position:
  - `vel = Normalize(targetPos - spawnPos) * bulletSpeedUnitsPerTick`
  - where `bulletSpeedUnitsPerTick` is the bullet module’s projectile speed parameter (named `speedUnitsPerTick` in `CombatPlan.md`).

`Normalize(...)` must be deterministic (integer/fixed-point; no platform-dependent floats).

Each tick during projectile advancement:
- treat the bullet’s motion as the swept segment `fromPos → candidateToPos`, where:
  - `fromPos = bullet.pos`
  - `candidateToPos = bullet.pos + bullet.vel`
- resolve the **earliest** collision along that segment against:
  - the outer wall (arena bounds)
  - any alive bot hitbox (16×16 AABB centered at the bot’s current world position), excluding the bullet owner
- if a collision occurs, clamp `toPos` to the impact point and resolve deterministically:
  - bot impact: apply bullet damage (`source = BOT`, `kind = BULLET`), then remove the bullet
  - wall impact: remove the bullet
- if no collision occurs: set `bullet.pos = candidateToPos`

Determinism-critical tie-break (bullets):
- if the swept segment would intersect multiple bots in one tick, the victim is the bot with the **earliest** time-of-impact along the segment
- tie-break (exact same impact time): lowest bot id (`BOT1` before `BOT2` ...)

Kill credit in multi-hit ticks:
- because `lastDamageByBotId` is updated as damage is applied, the credited killer is whichever bot delivered the **final BOT-sourced damage event** that occurred before death (in the deterministic order above).

---

## 6) Match stats vs season points

Match stats should include (at minimum):
- placement (1st–4th; ties possible when matches end by `TICK_CAP` / `STALEMATE`)
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

In replays/events, encode anchors as `loc = { sector: s, zone: z }` (see `ReplayViewerPlan.md`):
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
  - `baseSpeedUnitsPerTick` (v1 recommended: `16`)
  - `perEquippedSlotSpeedPenaltyUnitsPerTick` (v1 recommended: `4`)
  - `minSpeedUnitsPerTick` (v1 recommended: `4`)
- Wall bump damage:
  - `wallBumpDamage` (int; v1 TBD)
- `powerupSpawnIntervalMinTicks` (v1: `10`)
- `powerupSpawnIntervalMaxTicks` (v1: `20`)
  - must satisfy:
    - `powerupSpawnIntervalMaxTicks <= ticksPerSecond * 60`
    - this guarantees **at least one spawn per simulated minute** (as long as there is an empty spawn anchor)
  - with v1 values, the spawn interval is **10–20 seconds** (10–20 ticks)
- `powerupMaxActive` (optional cap; prevents arena clutter)
- `powerupLifetimeTicks` (int; if a powerup isn't picked up in time, it despawns; see §7.5)
  - v1 recommended default: `30` (the current sample generator uses `30` ticks)
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
- If an **alive** bot’s hitbox overlaps a powerup’s position, the bot **collides** with the powerup and automatically picks it up.
  - In v1, powerups live at fixed sector/zone centers; treat a powerup as a point at that center.
  - Equivalently (with a 16×16 bot AABB centered at `bot.pos`): pickup occurs when `abs(bot.pos.x - powerup.pos.x) <= 8` and `abs(bot.pos.y - powerup.pos.y) <= 8`.
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

### 7.5 Lifetime + despawn

Powerups are not permanent.

Ruleset parameter:
- `powerupLifetimeTicks` (int): powerups despawn if they aren't picked up within this many ticks of `POWERUP_SPAWN`.
  - v1 recommended default: `30`

Timing + replay semantics:
- `POWERUP_SPAWN` occurs during end-of-tick maintenance, after pickups.
  - A powerup spawned on tick `t` is first eligible to be picked up on tick `t+1`.
- If a powerup reaches its lifetime without being picked up, remove it and emit `POWERUP_DESPAWN { powerupId, reason: RULES }`.
  - `reason = RULES` means the powerup was removed by simulation rules (not by a pickup).



