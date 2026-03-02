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

### Bot language
- JS-like **line-based instruction language** (see `BotInstructions.md`).
- Scripts compile/validate to a safe internal form (no `eval`).
- Slot targeting supports a generalized `<TARGET>` union:
  - bot targets (`BOTn`, `TARGET`, `CLOSEST_BOT`)
  - location targets (`SECTOR n`)
  - `SELF` / `NONE`
- Movement supports optional **persistent navigation goals** (set once, then auto-move each tick until cleared), enabling bots to keep attacking while navigating.

### Loadout / modules
- Each bot has **3 slots**.
- Each slot holds exactly one module from:
  - `BULLET` (ammo weapon)
  - `SAW` (energy toggle weapon)
  - `SHIELD` (energy toggle defense)
  - `ARMOR` (passive defense)
- **No duplicate modules** in v1.
- If bot code calls an instruction for a module it doesn’t have equipped → **no-op**.
- **Future-proofing direction**: prefer extending gameplay via new slot modules that respond to a stable `USE_SLOTn` / `STOP_SLOTn` interface (documented in `FutureProofing.md`).

### Resources
- `health`, `ammo`, `energy` are integers in **0..100**.
- **No passive regeneration** (especially: **energy does not regenerate**).
- **Powerups** exist for `HEALTH|AMMO|ENERGY` and refill up to 100 (no overflow).
- Resource failure behavior (locked): bots may attempt actions, but if out of ammo/energy the action **does nothing**.

### Projectiles / explosives
- Bullets are **slow-moving projectiles** updated each tick (not instant hits).
- Bullet collision model (locked): a bullet can hit **any bot** in the sector it enters (supports future reflection mechanics).
- **Bullets stop at walls** (locked).
- Explosives (grenades/mines) (locked v1):
  - AoE radius = **1 sector** (center + adjacent)
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
- **Walls are gameplay** (new):
  - when a bot bumps into a wall it takes a small amount of damage and “bounces”.
  - bots have a **32×32 collision box** (new).
  - decide whether this is implemented as:
    - **sector-only collisions** (attempted illegal move => no move + bump damage; "bounce" is mostly visual; collision box mainly for UI/hit testing), or
    - **continuous positions/velocity** inside the arena (true bounce/reflect; collision box used for real collisions; implies a larger simulation model).
- Movement semantics for `MOVE_TO_*`:
  - shortest-path rules + deterministic tie-breaks when multiple shortest paths exist.
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
- Still to define:
  - spawn frequency / cooldown
  - per-type distribution (health vs ammo vs energy)
  - max concurrent powerups
  - deterministic spawn algorithm details (seeded RNG stream)

### Daily competition format
- Locked direction: **daily competition with 4-player matches** and **season points**.
- Spawn: bots start in the **four corners** of the 9-sector arena (1, 3, 7, 9).
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
- Locked: bots can query **other bots' resources** (supporting `BOT_HEALTH(BOTn)`, etc.).
- Still to define:
  - bullet sensing (near-only vs predictive)
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
