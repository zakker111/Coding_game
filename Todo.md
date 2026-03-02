# Todo

This file is the **single source of truth** for near-term engineering tasks and open design work.

---

## Current decisions (locked)

### Runtime + architecture
- **Client + server from day 1**:
  - **Client**: bot editor + local test runs + replay viewer (UI details later)
  - **Server**: headless match runner for **daily simulations**

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

### Loadout / modules
- Each bot has **3 slots**.
- Each slot holds exactly one module from:
  - `BULLET` (ammo weapon)
  - `SAW` (energy toggle weapon)
  - `SHIELD` (energy toggle defense)
  - `ARMOR` (passive defense)
- **No duplicate modules** in v1.
- If bot code calls an instruction for a module it doesn’t have equipped → **no-op**.

### Resources
- `health`, `ammo`, `energy` are integers in **0..100**.
- **No passive regeneration** (especially: **energy does not regenerate**).
- **Powerups** exist for `HEALTH|AMMO|ENERGY` and refill up to 100 (no overflow).
- Resource failure behavior (locked): bots may attempt actions, but if out of ammo/energy the action **does nothing**.

### Projectiles (bullets)
- Bullets are **slow-moving projectiles** updated each tick (not instant hits).
- Bullet collision model (locked): a bullet can hit **any bot** in the sector it enters (supports future reflection mechanics).

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
- Movement semantics for `MOVE_TO_*`:
  - shortest-path rules + deterministic tie-breaks when multiple shortest paths exist.
- Bullet pathing:
  - whether bullet locks a path at fire time vs re-targets dynamically.

### Match rules
- Match tick cap.
- Win condition (last alive vs score).
- How ties are handled.

### Powerup spawning
- Locked: powerups spawn **randomly**.
- Still to define:
  - spawn frequency / cooldown
  - per-type distribution (health vs ammo vs energy)
  - max concurrent powerups
  - deterministic spawn algorithm details (seeded RNG stream)

### Observability / bot sensing
- Finalize what bots can sense about:
  - powerups (global vs near-only)
  - bullets (near-only vs predictive)

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
