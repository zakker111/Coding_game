# ServerPlan.md — Server-Side Architecture (Headless Daily Bot Battles)

This document describes the **server-side responsibilities, data flow, and interfaces** for running daily headless simulations of the bot battle game.

It is intentionally **implementation-agnostic** (no required framework/DB yet). It assumes the gameplay rules captured in:
- `Todo.md`
- `BotInstructions.md`

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
  - `ruleset_version` (so future rules changes don’t break replay meaning)
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

### 2.3 Replay storage (strongly recommended)

A replay should minimally include:
- `ruleset_version`
- `match_seed`
- participant bot version hashes
- initial placements (or enough info to derive them from the seed)
- per-tick events (or at least per-tick executed instruction + resulting actions)

This enables:
- debugging determinism
- user trust (“why did I lose?”)
- future replay viewer

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

### 3.5 Leaderboards (shape TBD)

- `GET /leaderboard/daily/:runDate`
- `GET /leaderboard/global`

---

## 4) Submission validation pipeline (must not execute code)

Bot submissions are data. The server should never `eval` them.

### 4.1 Parse + validate

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

### 4.2 Compile to internal representation

To run matches efficiently and safely:
- Compile instructions into a small internal opcode form (e.g. `[{op, args}]`).
- Resolve labels to numeric instruction indices.

### 4.3 Runtime error policy (per-bot fault isolation)

Matches must keep running even if a bot’s program is malformed at runtime.

Policy (already agreed):
- invalid/malformed instruction at execution time => treat as `NOP`
- bot `pc` resets to `1` next tick
- optionally emit a replay event for debugging

---

## 5) Headless match runner (daily simulation)

### 5.1 Determinism contract

For each match:
- use `match_seed`
- use a single seeded RNG stream
- update bots in stable order `BOT1..BOT4`
- apply tick update order consistently:
  1) execute 1 instruction per bot
  2) apply actions
  3) apply toggle drains (saw/shield)
  4) advance bullets/projectiles
  5) resolve hits/damage
  6) resolve pickups
  7) check win condition

### 5.2 Powerup spawning (random, but replayable)

Powerups spawn randomly, but must be deterministic:
- all spawns derive from the match RNG
- define explicit constraints later:
  - spawn frequency
  - max concurrent powerups
  - per-type distribution

### 5.3 Match scheduling for the daily run

A daily run should:
- snapshot the list of participating `BotVersion` IDs
- generate matchups deterministically from `run_seed`
- execute all matches
- store results and replays

---

## 6) Operational concerns (non-functional requirements)

### 6.1 Rate limiting and abuse controls

- Rate limit login and submissions.
- Cap bot submission size.
- Cap number of versions per user per day (optional).

### 6.2 Observability

- Structured logs per daily run and per match.
- Store enough info to reproduce a match from stored artifacts.

### 6.3 Versioning

Every replay/result should reference:
- `ruleset_version`
- `source_hash` of each bot version

This prevents “old replays changed meaning after rules update”.

---

## 7) Open server-side decisions (to confirm later)

- How the server schedules daily runs (cron vs internal scheduler).
- Where replays are stored (DB vs object store vs filesystem).
- Auth mechanism (session cookies vs JWT).
- Expected scale (users/bots/matches per day), which affects concurrency and storage needs.
