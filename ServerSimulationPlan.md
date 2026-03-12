# ServerSimulationPlan.md — Server-Side Battle Simulation (Deterministic Daily Runner)

This document describes how the server should **simulate battles deterministically**, store results/replays, and expose them via API.

It complements:
- `ServerPlan.md` (overall server responsibilities + entity model + endpoints)
- `ArenaPlan.md` (arena topology + sectors/zones)
- `Ruleset.md` (damage attribution, collisions, powerup spawning)
- `BotInstructions.md` (bot VM semantics)
- `CombatPlan.md` (weapons: cooldowns, bullets, grenades, mines)
- `DailyCompetition.md` (daily competition format)

---

## 1) High-level server responsibilities

The server must:

1) **Accept bot submissions** (source text) and validate/compile them.
   - v1 server uses a fixed default loadout for all bots (see `ServerPlan.md`).
2) **Run headless simulations** for daily matches with a deterministic match runner.
3) **Store match artifacts**:
   - results (placements, stats)
   - replay payloads (events + optional checkpoints)
   - version references (ruleset version + bot code hashes)
4) **Serve results and replays** to clients.

Non-goals for v1:
- real-time multiplayer gameplay
- trusting client-side simulation for authoritative outcomes

---

## 2) Determinism contract (non-negotiable)

A match outcome must be reproducible from stored inputs.

### 2.1 Inputs that define a match

A match is fully determined by:
- `ruleset_version`
- `match_seed`
- the 4 participants’ bot code snapshots
  - v1: `{ botId, source_hash, source_text }`
  - future: `{ botVersionId }` (or `{ botId, botVersion, source_hash, compiledIrHash }`)
- spawn placement (derived from seed or explicitly stored)

### 2.2 Banned sources of nondeterminism

- wall-clock time
- system RNG
- iteration over unordered hash maps
- floating point physics unless fixed-point/integerized and strictly specified

### 2.3 Stable ordering rules

The engine must use stable, documented ordering:
- bots update in `BOT1..BOT4` order
- entities update in ascending id order (bullets/grenades/mines/powerups)
- multi-victim AoE damage applies in `BOT1..BOT4` order

---

## 3) Match lifecycle on the server

### 3.1 Daily run creation

At the start of each day:
1) Create a `DailyRun` record with:
   - `run_date`
   - `ruleset_version`
   - `run_seed`
   - `status = planned`
2) Snapshot the participating bots for that run.
   - v1: snapshot `{ botId, source_hash, source_text }` so mid-day edits can’t affect the run.
   - future: snapshot immutable `BotVersion` ids.

### 3.2 Match generation

Generate matches deterministically from `run_seed`:
- choose participants
- assign each match a `match_seed`
- assign spawn slots (`BOT1..BOT4`)

Store each `Match` row with `status = queued`.

### 3.3 Match execution

A match worker:
1) loads the `Match` row + referenced bot code snapshots (v1) or bot versions (future)
2) loads the ruleset implementation pinned to `ruleset_version`
3) executes the simulation to completion (last bot alive) or to a rules-driven end (`tickCap` / `STALEMATE`)
4) writes results + replay
5) marks match as `complete` (or `failed` with error metadata)

### 3.4 One-off (Workshop) simulations

In addition to daily scheduled matches, the same runner supports ad-hoc “sandbox” matches launched from the Workshop UI:
- `POST /api/simulations` creates a `Match` with `kind = sandbox` and enqueues it.
- The runner executes it using the same determinism contract and replay schema as daily matches.
- The client then loads the replay via `GET /api/matches/:matchId/replay`.

---

## 4) Worker architecture (recommended)

For small initial scale (≈10 bots, ≈10 matches/day), you can run **API + worker in a single process** and still keep the architecture compatible with future split services.

---

## 5) Simulation engine boundary

Recommended:
- implement the simulation engine as a **pure library** shared by client and server
- the server remains authoritative by controlling inputs and storing canonical artifacts

A minimal engine interface:
- `initMatch({ rulesetVersion, matchSeed, bots[] }) -> state`
- `step(state) -> { state, events[] }` (one tick)
- `runToEnd(state, tickCap) -> { finalState, events[], stats }`
  - `runToEnd` must stop early if the match ends by rules (`Ruleset.md`: last bot alive / `tickCap` / `STALEMATE`).

---

## 6) Tick loop specification (server-side)

This must align with `Todo.md` and the rules documents.

Recommended tick phases:

1) **Bot VM instruction phase** (`BOT1..BOT4`)
   - each alive bot executes exactly 1 instruction

2) **Movement + collision resolution**
   - apply movement attempts
   - bot positions are continuous world positions (`pos = {x,y}` in arena world units)
     - for any rules/DSL concepts that refer to sectors/zones, derive the bot’s current `sector (1..9)` and `zone (1..4)` from `pos` by grid partitioning (see `ReplayViewerPlan.md` §4.2)
   - speed rule: each bot may move up to its `speedUnitsPerTick` this tick
     - v1: derived from the fixed default loadout (see `ServerPlan.md`)
     - future: derived from the bot’s equipped loadout (see `Ruleset.md` §1.2)
   - resolve wall bumps (`BUMP_WALL` damage) and bot-to-bot bumps deterministically (see `Ruleset.md` §1.2 and §4)
     - v1: bot-to-bot bumps also deal damage (`DAMAGE kind=BUMP_BOT`) and can contribute to kill credit
   - emit replay events as needed (`ReplayViewerPlan.md`):
     - `BOT_MOVED { botId, fromPos, toPos, dir? }`
     - `BUMP_WALL { botId, dir, damage }` / `BUMP_BOT { botId, otherBotId, dir }`

3) **Toggle drains**
   - apply energy drains for active toggles (saw/shield)

4) **Projectile/deployable updates**
   - advance bullets (continuous; swept collision per `Ruleset.md` §5.1)
   - (future modules) advance grenades + decrement fuse
   - (future modules) mines: decrement arming timer

5) **Hit / explosion resolution**
   - bullet hits are resolved during bullet advancement (collision), emitting `BULLET_HIT` / `DAMAGE` / `BULLET_DESPAWN`
   - (future modules) grenade detonation (AoE)
   - (future modules) mine detonation (AoE)

6) **Pickups**
   - powerup pickup: an **alive** bot’s position intersects the powerup pickup region (powerups may remain anchored; map `powerup.loc` to its world-space center and use a deterministic pickup radius/overlap test)
   - deterministic ordering: process bots in `BOT1..BOT4` order (see `Ruleset.md`)

7) **Deaths + last-bot-alive check**
   - bots become **dead immediately** when `health <= 0` during earlier phases (per `Ruleset.md`) and should be skipped by subsequent phase logic in the same tick
   - in this phase, emit `BOT_DIED` and remove dead bots from the arena (so the replay/stat updates happen at a stable point)
   - evaluate the immediate end condition:
     - last bot alive

8) **End-of-tick maintenance + tick-based end conditions**
   - decrement module cooldowns and bot-local timers
   - update match-level timers used for match termination (see `Ruleset.md`):
     - increment/reset the no-bot-vs-bot-damage timer
     - decrement/cancel the stalemate countdown
   - decrement the global powerup spawn timer; if it reaches `0`, attempt to spawn one powerup and reset the timer (see `Ruleset.md`)
   - because spawn happens after pickups, newly spawned powerups cannot be picked up until the next tick
   - after updating the match-level timers, evaluate tick-based end conditions (`Ruleset.md`):
     - `tickCap`
     - `STALEMATE` (based on the updated stalemate timers)

---

## 7) Bot VM execution (server-side concerns)

On submission:
- parse + validate source
- resolve labels
- compile to a compact deterministic IR/opcode form

Runtime fault policy (locked):
- invalid/malformed instruction at runtime => treat as `NOP`
- bot `pc` resets to `1` next tick

Resource + cooldown enforcement:
- `USE_SLOTn` succeeds only if:
  - slot exists
  - module is ready (`cooldownRemaining == 0`)
  - resources are sufficient (ammo/energy vector)

---

## 8) Replay and audit trail

Replays are critical to user trust.

Minimum replay fields:
- replay header: `ruleset_version`, `match_seed`, per-slot `{ botId, source_hash }` (and v1: `source_text` snapshot), spawn assignments
- per tick:
  - executed instruction trace per bot
  - events (see `ReplayViewerPlan.md`):
    - movement/bump events using bot `fromPos/toPos` (continuous world positions)
    - powerup spawns/pickups (powerups may use `loc` anchors)
    - damage + deaths
    - projectile events

---

## 9) Storage model (server)

Recommended division:
- DB tables store metadata + stats
- object storage stores replay blobs once replays get large

Key requirement:
- every stored replay references `ruleset_version` so future rules changes do not rewrite history.

---

## 10) Decisions required to implement (pick one option per row)

1) Scheduling:
- A) OS cron + HTTP/CLI trigger
- B) in-app scheduler

2) Queue:
- A) DB polling queue
- B) Redis queue

3) Replay storage:
- A) DB (only if small)
- B) object store

4) Auth:
- A) session cookies
- B) JWT
