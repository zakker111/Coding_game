# Todo

This file is the **single source of truth** for near-term engineering tasks and open design work.

---

## Current decisions (locked)

### Runtime + architecture
- **Client + server from day 1**:
  - **Client**: bot editor + local test runs + replay viewer (UI details later)
  - **Server**: headless match runner for **daily simulations**
- Bots have a user-facing **display name** (server-side entity field exists; UI should show name + match slot id).

### Simulation model
- **Tick-based** match loop.
- **Model A bot execution**: each bot executes **exactly 1 instruction per tick** at its `pc`.
- **Deterministic**:
  - seeded RNG per match
  - stable processing order (`BOT1..BOT4`)
  - deterministic tie-breakers

### Arena model
- **9 sectors (1..9)** arranged as a 3×3 grid.
- Each sector contains **4 zones (1..4)** arranged as a 2×2 grid.
- Bots and powerups are placed on deterministic **location anchors**:
  - sector center: `SECTOR s`
  - zone center: `SECTOR s ZONE z`

### Bot language
- JS-like **line-based instruction language** (see `BotInstructions.md`).
- Scripts compile/validate to a safe internal form (no `eval`).
- Slot targeting supports a generalized `<TARGET>` union:
  - bot targets (`BOTn`, `TARGET`, `CLOSEST_BOT`)
  - location targets:
    - `SECTOR n` (sector center)
    - `SECTOR n ZONE z` (zone center)
  - `SELF` / `NONE`
- Movement supports optional **persistent navigation goals** (set once, then auto-move each tick until cleared), enabling bots to keep attacking while navigating.
- Beginner-friendly zone convenience (aliases that compile down to `MOVE_TO_SECTOR <S> ZONE <Z>`):
  - `MOVE_TO_ZONE <ZONE>` / `SET_MOVE_TO_ZONE <ZONE>`
  - `IN_ZONE(<ZONE>)`

### Loadout / modules
- Each bot has **3 slot positions**: `SLOT1|SLOT2|SLOT3`.
- A slot may be **empty**.
- Allowed v1 modules:
  - `BULLET` (ammo weapon)
  - `SAW` (energy toggle weapon)
  - `SHIELD` (energy toggle defense)
  - `ARMOR` (passive defense; adds to base armor)
- **No duplicate modules** among equipped modules in v1.
- **At most one weapon** equipped in v1:
  - weapon modules (v1) = `BULLET | SAW`
  - remaining slots may be defensive modules or empty
- If bot code calls an instruction for a module/slot it doesn’t have equipped → **no-op**.

Speed/weight (locked direction):
- Bots have a base movement speed, and **each equipped slot reduces speed**.
- Empty slots make a bot **faster**.
- The speed system is defined in `Ruleset.md` as a deterministic **movement cooldown** model.

**Future-proofing direction**: prefer extending gameplay via new slot modules that respond to a stable `USE_SLOTn` / `STOP_SLOTn` interface (documented in `FutureProofing.md`).

### Resources
- `health`, `ammo`, `energy` are integers in **0..100**.
- **No passive regeneration** (especially: **energy does not regenerate**).
- **Powerups** exist for `HEALTH|AMMO|ENERGY`.
  - On pickup they apply a **fixed per-type delta** (same amount every time), capped at 100.
  - The exact deltas are ruleset parameters (see `Ruleset.md`).
- Resource failure behavior (locked): bots may attempt actions, but if out of ammo/energy the action **does nothing**.

### Projectiles / explosives
- Bullets are **slow-moving projectiles** updated each tick (not instant hits).
- Bullet collision model (locked): a bullet can hit **any bot** in the sector it enters (supports future reflection mechanics).
- **Bullets stop at walls** (locked).
  - v1: bullets are removed immediately on wall contact (see `ArenaPlan.md`, `CombatPlan.md`).
- Explosives (grenades/mines) (planned future modules):
  - when introduced, AoE shape is pre-locked:
    - radius = **1 sector** (center + adjacent)
    - damage falloff: **center sector takes more damage** than adjacent sectors
- Weapon mechanics planning (cooldowns, ammo/energy costs, projectile/hitscan delivery, grenades, mines): see `CombatPlan.md`.

### Fault tolerance / corrupted bot code
- Bot code must never crash the match.
- Runtime error policy (locked): invalid/malformed instruction → treated as `NOP`, and bot `pc` resets to **1** next tick.

---

## Open decisions (deferred / to decide later)

### Balance numbers
- Bullet: damage, ammo cost per shot, cooldown (if any), bullet speed (currently “slow”), TTL.
- Saw: energy drain per tick, damage per tick.
- Shield: energy drain per tick, mitigation model, future reflection behavior.
- Armor: damage reduction math (flat vs %), what damage types it applies to.

### Definitions / semantics
- Define **CLOSE_RANGE** precisely (used in bot logic like “if any bot in close range then saw on”).
- **Walls are gameplay** (locked v1):
  - when a bot bumps into the outer wall: no movement + `BUMP_WALL` damage
  - v1 collision is **anchor-based** (bounce is primarily visual feedback)
  - future: continuous physics/velocity is a major ruleset change (see `ArenaPlan.md`)
- Movement semantics for `MOVE_TO_*`:
  - v1 uses the **anchor adjacency graph** defined in `ArenaPlan.md`
  - still to finalize: deterministic tie-break rules when multiple shortest paths exist (if any remain after adjacency definition)
- Bullet pathing:
  - whether bullet locks a path at fire time vs re-targets dynamically.
- Bullet/wall interaction (future): do bullets collide/bounce/stop on walls?

### Match rules
- Match tick cap.
- Win condition (last alive vs score).
- How ties are handled.
- **Death + kill credit rule (new, desired):**
  - when `health` reaches 0 the bot dies and is removed from the arena.
  - kill credit goes to the bot that dealt the **last non-environment damage** to the victim, even if the final damage was from a wall bump (self/environment).

### Powerup spawning
- Locked: powerups spawn **randomly (seeded)**.
- Locked: powerups can spawn at **sector centers and sector zones**:
  - `SECTOR 1..9`
  - `SECTOR 1..9 ZONE 1..4`
  - total spawn locations = **45**
- Locked direction: use a **global spawn timer** (not per-location respawns) so you can enforce a predictable overall spawn rate.
- Locked timing (ruleset parameters; see `Ruleset.md`):
  - `ticksPerSecond = 1` (so `1 tick = 1 second`)
  - spawn interval: sample uniformly from **[10, 20] ticks** (so **10–20 seconds**)
    - `powerupSpawnIntervalMinTicks = 10`
    - `powerupSpawnIntervalMaxTicks = 20`
- Still to define (other ruleset parameters; see `Ruleset.md`):
  - optional `powerupMaxActive`
  - per-type distribution (weights)
  - fixed per-type deltas (`powerupHealthDelta`, `powerupAmmoDelta`, `powerupEnergyDelta`)

### Daily competition format
- Locked direction: **daily competition with 4-player matches** and **season points**.
- Spawn: bots start in the **four corners** of the arena:
  - `BOT1 → SECTOR 1 ZONE 1`
  - `BOT2 → SECTOR 3 ZONE 2`
  - `BOT3 → SECTOR 7 ZONE 3`
  - `BOT4 → SECTOR 9 ZONE 4`
- Elimination: bots that drop below a **points threshold** are excluded from **future days** until re-enabled.
- Rejoin: re-enable uses a **rejoin allowance** (points floor) so bots can come back even if below threshold.
- Weekly: highlight **top 10** and reset/start a new season.
- Client-only: allow a **1v1 spawn/testing mode** (does not affect server scoring).
- Still to define:
  - points formula (placement-only vs placement + stats)
  - exact threshold value and exact rejoin allowance amount
  - number of rounds/matches per day caps
  - what happens when fewer than 4 eligible bots remain (stop vs allow 2–3 player matches)
  - scaling strategy if bot count becomes large

### Observability / bot sensing
- Locked: bots have **global knowledge of powerup locations** (supporting `POWERUP_EXISTS` and `DIST_TO_CLOSEST_POWERUP`).
- Locked: bots can sense other bots’ **presence + proximity** (see `BotInstructions.md` predicates like `BOT_IN_SAME_SECTOR`, `BOT_IN_ADJ_SECTOR`, `DIST_TO_BOT`, `DIST_TO_CLOSEST_BOT`).
- Locked: bots can read `TARGET_HEALTH` for their current target bot (evaluates to `0` if no valid target bot exists).
- Still to define:
  - bullet sensing (near-only vs predictive)
  - whether to expose per-bot resource queries like `BOT_HEALTH(BOTn)` (not part of the stable v1 language today)
  - whether any opponent info should be hidden later for fairness (if desired)

---

## Engineering tasks (rough dependency order; no dates)

### 1) Formalize the ruleset + spec
- Treat `BotInstructions.md` as the source of truth; tighten wording where ambiguous.
- Write a **Ruleset.md** (or expand existing docs) that locks:
  - tie-break rules
  - update order per tick (actions → drains → projectiles → damage → pickups)
  - definitions like adjacency and close range

### 2) Deterministic core simulation (shared between client + server)
- Implement simulation state model:
  - bots (sector, resources, toggles, loadout)
  - bullets (projectiles)
  - powerups
- Implement seeded RNG utilities and ban non-deterministic sources.
- Implement tick loop with stable ordering and deterministic resolution.

### 3) Bot VM / interpreter
- Parser/assembler for instruction scripts:
  - labels → resolved jump targets
  - instruction validation
  - per-bot `pc` execution (1 line per tick)
- Predicate evaluation (bot proximity, bullets nearby, powerups nearby, target register checks).
- Per-bot fault isolation:
  - invalid instruction handling + `pc` reset behavior

### 4) Gameplay mechanics
- Movement in 9-sector grid (including `MOVE_TO_SECTOR`, `MOVE_TO_BOT`, `MOVE_TO_POWERUP`).
- Bullet weapon:
  - ammo consumption
  - projectile motion per tick
  - collision and hit resolution
- Saw:
  - energy drain per tick while on
  - damage application within CLOSE_RANGE
- Shield:
  - energy drain per tick while on
  - mitigation hook (numbers/behavior can be placeholder initially)
- Armor:
  - passive mitigation hook (numbers/behavior can be placeholder initially)

### 5) Replays + determinism tests
- Define replay schema:
  - match seed
  - bot versions/hashes + loadouts
  - per-tick executed instruction (optional but very helpful)
  - per-tick events (damage, deaths, pickups, resource deltas)
- Golden replay tests: same seed + same bots → same outcome.

### 6) Server daily runner
- Headless match runner (CLI/service) that can:
  - schedule daily matches
  - run simulations
  - store results + replays

### 7) Auth + bot submissions (server)
- Login/register (username + password).
- Store bot versions (immutable) + loadouts.
- Validate scripts on submission (reject duplicates in slots; reject invalid instructions/labels).

### 8) Client UI (later)
- Landing + login.
- Bot editor.
- Local match runner for testing.
- Replay viewer.

---

## Nice-to-haves

- Bot debugging (step-through ticks, show `pc`, show executed instruction, traces).
- Ladder/leaderboard.
- Spectator match viewer.
- More modules/weapons and reflection shield mechanics.
