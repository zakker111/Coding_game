# ServerPlan.md — Server-Side Architecture (Headless Daily Bot Battles)

This document describes the **server-side responsibilities, data flow, and interfaces** for running daily headless simulations of the bot battle game.

It is intentionally **implementation-agnostic** (no required framework/DB yet). It assumes the gameplay rules captured in:
- `Todo.md`
- `ArenaPlan.md`
- `Ruleset.md`
- `BotInstructions.md`
- `CombatPlan.md`
- `ServerSimulationPlan.md`

Implementation guidance (recommended stack):
- `ServerTechStack.md`

---

## 1) Server goals (what the server must guarantee)

- **Authoritative, deterministic match execution**
  - Same match seed + same bot versions + same ruleset => same outcome.
- **Safety**
  - Bot submissions must not crash the server.
  - Bot programs are treated as untrusted input.
- **Daily automation**
  - The server runs scheduled matches daily and publishes results.
- **Auditability**
  - Store replays/logs so outcomes are explainable.

---

## 2) What the server stores

### 2.1 Core entities (minimum)

- **User**
  - `id`, `username`, `password_hash`, `created_at`
- **Bot**
  - `id`, `user_id`, `name`, `created_at`
- **BotVersion** (immutable)
  - `id`, `bot_id`, `created_at`
  - `source_text` (the instruction script)
  - `source_hash` (content hash; used in replays)
  - `loadout` (3 slots; no duplicates in v1)
  - `ruleset_version`
  - `validation_status` + `validation_errors`

### 2.2 Daily runs + matches

- **DailyRun**
  - `id`, `run_date` (e.g. YYYY-MM-DD), `created_at`
  - `ruleset_version`
  - `run_seed` (seed for selecting matchups/spawns)
  - `status` (planned/running/complete/failed)
- **Match**
  - `id`, `daily_run_id`, `created_at`
  - `match_seed` (deterministic per match)
  - `participants`: list of `{ bot_version_id, bot_id, user_id }`
  - `result` (winner, placements, scores, etc.)
  - `replay_ref` (pointer to stored replay)

### 2.3 Replay storage

A replay should minimally include:
- `ruleset_version`
- `match_seed`
- participant bot version hashes
- initial placements (or enough info to derive them from the seed)
- per-tick events + instruction trace (see `ReplayViewerPlan.md`)

---

## 3) Server API surface (logical endpoints)

### 3.1 Auth

- `POST /auth/register` (username + password)
- `POST /auth/login` (username + password)
- `POST /auth/logout` (optional)
- `GET /me`

### 3.2 Bot management

- `POST /bots` (create bot container)
- `GET /bots` (list user’s bots)
- `GET /bots/:botId`

### 3.3 Bot version submission

- `POST /bots/:botId/versions`
  - body: `{ source_text, loadout }`
  - server:
    - validates syntax + labels + instruction set (`BotInstructions.md`)
    - enforces **no duplicates** in loadout
    - computes `source_hash`
    - stores immutable version
- `GET /bots/:botId/versions`
- `GET /bot_versions/:versionId`

### 3.4 Runs + results

- `GET /runs` (daily runs list)
- `GET /runs/:runId`
- `GET /runs/:runId/matches`
- `GET /matches/:matchId`
- `GET /matches/:matchId/replay`

---

## 4) Submission validation pipeline (must not execute code)

Bot submissions are data. The server should never `eval` them.

- Normalize line endings.
- Enforce size limits (max lines, max chars per line).
- Validate each instruction against the allowed set (from `BotInstructions.md`).
- Validate label rules:
  - `LABEL name` unique
  - `GOTO name` / `IF ... GOTO name` must reference an existing label
- Validate loadout:
  - exactly 3 slots
  - only allowed module types
  - **no duplicates** (v1)

Compile to internal representation:
- compile instructions into a small deterministic opcode form
- resolve labels to numeric instruction indices

Runtime error policy (locked):
- invalid/malformed instruction at execution time => treat as `NOP`
- bot `pc` resets to `1` next tick

---

## 5) Headless match runner (daily simulation)

### 5.1 Determinism contract

For each match:
- use `match_seed`
- use a single seeded RNG stream
- update bots in stable order `BOT1..BOT4`
- follow the tick loop defined in `ServerSimulationPlan.md`

### 5.2 Powerup spawning (random, but replayable)

Powerups spawn randomly, but must be deterministic:
- all randomness derives from the match RNG
- spawn locations are fixed deterministic anchors (see `ArenaPlan.md`):
  - `SECTOR 1..9` (sector centers)
  - `SECTOR 1..9 ZONE 1..4` (zone centers)
- spawning is driven by a **single global spawn timer** (see `Ruleset.md`) so the overall spawn rate is controllable

Ruleset timing (locked):
- `ticksPerSecond = 1` (so `1 tick = 1 second`)
- powerup spawn interval is sampled uniformly from **[10, 20] ticks** (so **10–20 seconds**)
  - `powerupSpawnIntervalMinTicks = 10`
  - `powerupSpawnIntervalMaxTicks = 20`

Still to define (other ruleset parameters):
- optional max active powerups
- per-type distribution (weights)
- fixed per-type pickup deltas

### 5.3 Match scheduling for the daily run

A daily run should:
- snapshot the list of participating `BotVersion` IDs
- generate matchups deterministically from `run_seed`
- execute all matches
- store results and replays

---

## 6) Operational concerns (non-functional requirements)

- Rate limit login and submissions.
- Cap bot submission size.
- Structured logs per daily run and per match.

Versioning requirement:
- every replay/result references `ruleset_version` and each bot `source_hash`

---

## 7) Open server-side decisions (to confirm later)

- Scheduling (cron vs internal scheduler)
- Replay storage (DB vs object store)
- Auth (session cookies vs JWT)
- Expected scale (users/bots/matches/day)
