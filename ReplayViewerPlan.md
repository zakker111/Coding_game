# ReplayViewerPlan.md — Battle Picker + Replay Viewer (Client-first, Server-ready)

This document defines the **replay UX** and **replay data contract** needed to:
- visually watch what happened (bullets, grenades, mines, bumps)
- inspect per-bot code execution (tick + current instruction)
- let registered users review server-run matches from the browser

It is written **client-first** (local simulations), but designed so the same UI works with **server-provided replays** later.

It complements:
- `UIPlan.md`
- `ArenaPlan.md`
- `ServerSimulationPlan.md`
- `Ruleset.md`
- `CombatPlan.md`

---

## 1) UX goals

- **Battle picker / match history**: list and open past matches.
- **Deterministic playback**: the UI is a pure view over replay data.
- **Debugging-first**:
  - show tick number
  - show which bot instruction executed
  - show why an action happened / no-op happened
- **Visual correctness**:
  - sector + zone grid visible
  - bullets moving sector-to-sector
  - grenade fuse + detonation
  - mine placement, arming, trigger, detonation
  - wall bumps + bot bumps
  - powerup spawns + pickups

---

## 2) Screens (client)

### 2.1 Match History (Battle Picker)

Entry points:
- after finishing a local match: **Save Replay** / **View Replay**
- top nav: **Matches**

List item fields (minimum):
- match id
- timestamp
- mode: `1v1` / `1v1v1v1`
- participant names + avatars
- placement / winner
- quick actions: **Open**, **Delete** (local-only)

### 2.2 Replay Viewer (Match Screen)

Core regions (align with `UIPlan.md`):
- arena viewport (3×3 sectors, each with 2×2 zones)
- right inspection panel (bot list + code)
- bottom timeline (ticks)
- optional event log

Playback controls (v1 minimum):
- play/pause
- step +1
- step -1 (only if the replay storage strategy supports reverse seeking)
- scrub to tick
- speed presets

Inspection:
- clicking a bot focuses it in the right panel
- highlight executed line (`pc`) at the current tick
- show per-tick result (executed/no-op/error) + reason

### 2.3 Viewer state model + deep-linking (recommended)

Treat the viewer as a pure function of:
- `(replayData, playheadTick, selectedBotId)`

Recommended URL params (so refresh/share works):
- `tick` (playhead)
- `bot` (selected bot)
- `speed` (playback)
- `follow` (for live runs)

Live simulation mode (local runner):
- support **Follow Live** (auto-advance playhead to newest tick)
- if the user scrubs back, disable Follow Live automatically
- provide **Jump to Live** button

---

## 3) Replay data contract (format)

A replay should support 2 independent requirements:
- **visual state** at tick `t`
- **debug trace** explaining how that state happened

### 3.1 Header (required)

- `schemaVersion`
- `rulesetVersion`
- `matchSeed`
- `tickCap`
- `bots[]`:
  - `botId` (`BOT1..BOT4`)
  - `displayName`
  - `avatar` (color for v1)
  - `loadout` (3 slot positions; each entry is a module id or `null`)
    - v1 validation: no duplicate modules among equipped slots
    - v1 validation: at most one weapon module equipped (`BULLET` or `SAW`)
  - `sourceText` (or `sourceHash` + URL)

### 3.2 Two storage strategies

#### A) Full state per tick (simplest v1)

- store a full `state` snapshot every tick

Pros:
- simplest UI seeking
- reverse stepping is trivial (step -1 just loads tick-1)

Cons:
- large payloads

#### B) Event log + checkpoints (recommended)

- store:
  - initial state
  - checkpoints every N ticks (e.g., 25–50)
  - per-tick event lists

Pros:
- efficient

Cons:
- UI needs reconstruction logic
- reverse stepping requires checkpoints (otherwise you must replay events from the start)

Client-first recommendation:
- start with **A** for local testing
- move to **B** once replays get large / server storage matters

---

## 4) Event types needed for correct visualization

The UI should not infer combat; it should render what the replay says.

### 4.1 Bot execution trace

- `BOT_EXEC`:
  - `tick`, `botId`
  - `pcBefore`, `pcAfter`
  - `instrText` (or `instrIndex`)
  - `result`: `EXECUTED | NOOP | ERROR`
  - `reason` (optional): `COOLDOWN | NO_AMMO | NO_ENERGY | NO_MODULE | INVALID_TARGET | INVALID_LOC | MOVE_COOLDOWN | ...`

### 4.2 Locations (`loc`)

Bots and powerups live on deterministic **location anchors** (see `ArenaPlan.md`).

Encode every location as:
- `loc = { sector: 1..9, zone: 0..4 }`
  - `zone=0` means sector center
  - `zone=1..4` means zone center

### 4.3 Movement + bumps

- `BOT_MOVED`: `botId`, `fromLoc`, `toLoc`
- `BUMP_WALL`: `botId`, `dir`, `damage`
- `BUMP_BOT`: `botId`, `otherBotId`, `dir`

### 4.4 Powerups

Timing note:
- `POWERUP_SPAWN` happens during end-of-tick maintenance (after pickups). A powerup spawned on tick `t` is first eligible to be picked up on tick `t+1`.

- `POWERUP_SPAWN`:
  - `powerupId`, `type`, `loc`
- `POWERUP_PICKUP`:
  - `botId`, `powerupId`, `type`, `loc`
- `POWERUP_DESPAWN`:
  - `powerupId`, `reason` (`PICKUP|RULES`)

### 4.5 Resources

- `RESOURCE_DELTA`: `botId`, `ammoDelta`, `energyDelta`, `healthDelta`, `cause`
  - include `cause` values like: `PICKUP_HEALTH|PICKUP_AMMO|PICKUP_ENERGY|DAMAGE|DRAIN|...`

### 4.6 Projectiles (bullets)

- `BULLET_SPAWN`: `bulletId`, `ownerBotId`, `sector`, `dir`
- `BULLET_MOVE`: `bulletId`, `fromSector`, `toSector`
- `BULLET_HIT`: `bulletId`, `victimBotId`, `damage`
- `BULLET_DESPAWN`: `bulletId`, `reason` (`TTL|WALL|HIT`)

### 4.7 Grenades

- `GRENADE_SPAWN`: `grenadeId`, `ownerBotId`, `sector`, `dir`, `fuse`
- `GRENADE_MOVE`: `grenadeId`, `fromSector`, `toSector`
- `GRENADE_FUSE_TICK`: `grenadeId`, `fuseRemaining`
- `GRENADE_DETONATE`:
  - `grenadeId`, `centerSector`
  - `damageCenter`, `damageAdjacent`

### 4.8 Mines

- `MINE_PLACE`: `mineId`, `ownerBotId`, `sector`, `armTicks`
- `MINE_ARMED`: `mineId`
- `MINE_TRIGGER`: `mineId`, `triggerBotId`
- `MINE_DETONATE`:
  - `mineId`, `centerSector`
  - `damageCenter`, `damageAdjacent`

### 4.9 Damage + deaths

- `DAMAGE`:
  - `victimBotId`, `amount`, `source`, `sourceBotId?`, `kind`
- `BOT_DIED`:
  - `victimBotId`, `creditedBotId?`

## 5) Client data sources (now vs later)

### 5.1 Now (client-only)

- run local simulation
- store replays in:
  - IndexedDB (recommended)
  - or localStorage for tiny payloads

Recommended local persistence UX:
- when a match finishes, show a **Save Replay** dialog:
  - default name like: `Local Match — YYYY-MM-DD HH:mm`
  - actions: Save / Discard / Export JSON
- maintain a lightweight replay index for listing:
  - `{ replayId, createdAt, mode, participants, winner, tickCount, rulesetVersion }`
- allow **Import replay** (JSON file) to insert into local library

### 5.2 Later (server)

- user logs in
- match list loads from server (pagination)
- replay downloads from server (or via signed object-storage URL)
- client caches recently opened replays

---

## 6) Minimal server API (future-ready)

These endpoints are enough to power the browser replay UX:

- `GET /api/matches` (for current user)
  - returns match list summaries

- `GET /api/matches/:matchId`
  - returns metadata + participants + result

- `GET /api/matches/:matchId/replay`
  - returns replay JSON (small v1)
  - or returns `{ url }` for object storage

---

## 7) UI implementation notes

- Rendering should be driven by replay state/events, not by re-running logic in the UI.
- Use the same coordinate system as `UIPlan.md` / `ArenaPlan.md` (sector + zone grid).
- Provide an event log panel that can be filtered by:
  - bot
  - tick range
  - event types (moves, bumps, damage, pickups, spawns)
- Deep-link viewer state in URLs (recommended): `tick`, `bot`, `speed`, `follow`.

---

## 8) Decisions needed to proceed

1) Replay storage for the first client prototype:
- A) full state per tick
- B) event log + checkpoints

2) Source code display:
- A) embed bot source in replay
- B) store source separately and reference via hash/url
