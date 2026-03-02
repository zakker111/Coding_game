# ServerSimulationPlan.md — Server-Side Battle Simulation (Deterministic Daily Runner)

This document describes how the server should **simulate battles deterministically**, store results/replays, and expose them via API.

It complements:
- `ServerPlan.md` (overall server responsibilities + entity model + endpoints)
- `ArenaPlan.md` (arena topology + anchors)
- `Ruleset.md` (damage attribution, collisions, powerup spawning)
- `BotInstructions.md` (bot VM semantics)
- `CombatPlan.md` (weapons: cooldowns, bullets, grenades, mines)
- `DailyCompetition.md` (daily competition format)

---

## 1) High-level server responsibilities

The server must:

1) **Accept bot submissions** (source text + loadout) and validate/compile them.
2) **Run headless simulations** for daily matches with a deterministic match runner.
3) **Store match artifacts**:
   - results (placements, stats)
   - replay payloads (events + optional checkpoints)
   - version references (ruleset version + bot version hashes)
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
- the 4 immutable `bot_version_id`s (or their `source_hash` + compiled IR hash)
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
2) Snapshot the participating `BotVersion` ids for that run.

### 3.2 Match generation

Generate matches deterministically from `run_seed`:
- choose participants
- assign each match a `match_seed`
- assign spawn slots (`BOT1..BOT4`)

Store each `Match` row with `status = queued`.

### 3.3 Match execution

A match worker:
1) loads the `Match` row + referenced bot versions
2) loads the ruleset implementation pinned to `ruleset_version`
3) executes the simulation to completion or tick-cap
4) writes results + replay
5) marks match as `complete` (or `failed` with error metadata)

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

---

## 6) Tick loop specification (server-side)

This must align with `Todo.md` and the rules documents.

Recommended tick phases:

1) **Bot VM instruction phase** (`BOT1..BOT4`)
   - each alive bot executes exactly 1 instruction

2) **Movement + collision resolution**
   - apply movement attempts
   - positions are deterministic location anchors:
     - `SECTOR s` (sector center)
     - `SECTOR s ZONE z` (zone center)
   - resolve wall bumps (`BUMP_WALL` damage) and bot-to-bot bumps

3) **Toggle drains**
   - apply energy drains for active toggles (saw/shield)

4) **Projectile/deployable updates**
   - advance bullets (1 sector/tick)
   - advance grenades + decrement fuse
   - mines: decrement arming timer

5) **Hit / explosion resolution**
   - bullet hit resolution (sector-enter hit, lowest bot id)
   - grenade detonation (AoE)
   - mine detonation (AoE)

6) **Pickups**
   - powerup pickup: bot occupies same location anchor as a powerup

7) **Deaths + win checks**
   - apply `BOT_DIED` and remove dead bots from the arena

8) **End-of-tick maintenance**
   - decrement cooldowns and bot-local timers
   - update the global powerup spawn timer and spawn (see `Ruleset.md`)

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
- replay header: `ruleset_version`, `match_seed`, bot version hashes, spawn assignments
- per tick:
  - executed instruction trace per bot
  - events (see `ReplayViewerPlan.md`):
    - movement/bump events using `loc = { sector, zone }`
    - powerup spawns/pickups
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
