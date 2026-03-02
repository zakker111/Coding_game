# ServerSimulationPlan.md — Server-Side Battle Simulation (Deterministic Daily Runner)

This document describes how the server should **simulate battles deterministically**, store results/replays, and expose them via API.

It complements:
- `ServerPlan.md` (overall server responsibilities + entity model + endpoints)
- `Ruleset.md` (damage attribution, collisions, ordering)
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
- bullets/grenades/mines update in ascending entity id order
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
   - This prevents later submissions from changing the run.

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
4) writes:
   - results + stats
   - replay payload (events + optional checkpoints)
5) marks match as `complete` (or `failed` with error metadata)

---

## 4) Worker architecture (recommended)

### 4.1 Components

- **Scheduler**: triggers a daily run (cron or internal scheduler)
- **Match queue**: persistent job queue (e.g., DB-based or Redis)
- **Workers**: N processes that run matches
- **Artifact store**:
  - DB for metadata + small payloads
  - object storage for replays (recommended once replays grow)

### 4.2 Failure isolation

A single match must not crash the whole run.

Worker policy:
- hard timeout per match (prevents infinite loops)
- memory cap per worker
- if a match fails:
  - mark as failed
  - store failure reason
  - continue the run

---

## 5) Simulation engine boundary

### 5.1 Shared engine vs server-only engine

Recommended:
- implement the simulation engine as a **pure library** that both client and server can call.
- the server remains authoritative by:
  - controlling inputs
  - storing official artifacts
  - running the canonical ruleset version

### 5.2 Engine API (logical)

A minimal engine interface:
- `initMatch({ rulesetVersion, matchSeed, bots[] }) -> state`
- `step(state) -> { state, events[] }` (one tick)
- `runToEnd(state, tickCap) -> { finalState, events[], stats }`

All side effects (logging, persistence) live outside the engine.

---

## 6) Tick loop specification (server-side)

This must align with `Todo.md` and `ServerPlan.md` ordering.

Recommended tick phases:

1) **Bot VM instruction phase** (`BOT1..BOT4`)
   - each alive bot executes exactly 1 instruction
   - instructions may:
     - move
     - set targets
     - `USE_SLOTn` / `STOP_SLOTn`
     - `WAIT` / timers

2) **Movement + collision resolution**
   - apply movement attempts
   - resolve wall bumps (`BUMP_WALL` damage) and bot-to-bot bumps (bump events)

3) **Toggle drains**
   - apply energy drains for active toggles (saw/shield)

4) **Projectile/deployable updates**
   - advance bullets (1 sector/tick)
   - advance grenades + decrement fuse
   - mines: decrement arming timer

5) **Hit / explosion resolution**
   - bullet hit resolution (sector-enter hit, lowest bot id)
   - grenade detonation:
     - AoE radius = 1 sector (center + adjacent)
     - falloff: center damage > adjacent damage
   - mine detonation on trigger:
     - AoE radius = 1 sector (center + adjacent)
     - falloff: center damage > adjacent damage

6) **Pickups**

7) **Deaths + win checks**
   - apply `BOT_DIED` events and remove dead bots from the arena

---

## 7) Bot VM execution (server-side concerns)

### 7.1 Compilation pipeline

On submission:
- parse + validate source
- resolve labels
- compile to a compact deterministic IR/opcode form
- store:
  - original source
  - compiled representation (or hash)
  - validation errors

### 7.2 Runtime fault policy

Locked behavior (see `BotInstructions.md` / `ServerPlan.md`):
- invalid/malformed instruction at runtime => treat as `NOP`
- bot `pc` resets to `1` next tick

### 7.3 Resource + cooldown enforcement

Bots cannot bypass weapon mechanics by scripting.

Server rules:
- `USE_SLOTn` succeeds only if:
  - slot exists
  - module is ready (`cooldownRemaining == 0`)
  - resources are sufficient (ammo/energy vector)

If not, no-op.

---

## 8) Replay and audit trail

Replays are critical to user trust.

### 8.1 Minimum replay fields

Replay header:
- `ruleset_version`
- `match_seed`
- participant bot version hashes
- spawn assignments

Per-tick:
- executed instruction trace per bot:
  - `tick`, `botId`, `pc_before`, `pc_after`, `instruction_text` (or index), `result`
- events:
  - damage events (with `kind`)
  - deaths
  - wall bumps / bot bumps
  - projectile spawns/moves/hits
  - grenade detonation
  - mine placement/arming/trigger
  - pickups

### 8.2 Checkpoints (optional but recommended)

To support fast seeking in the replay viewer:
- store full snapshots every N ticks (e.g., 50)
- store events for intermediate ticks

---

## 9) Storage model (server)

Recommended division:
- DB tables store:
  - users, bots, bot versions
  - daily runs, matches
  - match stats
  - replay metadata pointers
- object storage stores:
  - replay payload blobs (compressed)

Key requirement:
- every stored replay must reference `ruleset_version` so future rules changes do not rewrite history.

---

## 10) Operational and scaling notes

- Matches are embarrassingly parallel: run many workers.
- Throughput bound is CPU; storage bound is replay size.
- Use deterministic seeds to enable reruns and debugging.

---

## 11) Decisions required to implement (pick one option per row)

1) Scheduling:
- A) OS cron + HTTP/CLI trigger
- B) in-app scheduler

2) Queue:
- A) DB polling queue
- B) Redis queue

3) Replay storage:
- A) DB (only if small)
- B) object store (recommended)

4) Auth:
- A) session cookies
- B) JWT
