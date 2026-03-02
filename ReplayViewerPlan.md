# ReplayViewerPlan.md — Battle Picker + Replay Viewer (Client-first, Server-ready)

This document defines the **replay UX** and **replay data contract** needed to:
- visually watch what happened (bullets, grenades, mines, bumps)
- inspect per-bot code execution (tick + current instruction)
- let registered users review server-run matches from the browser

It is written **client-first** (local simulations), but designed so the same UI works with **server-provided replays** later.

It complements:
- `UIPlan.md`
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
  - show why an action did/didn’t happen (cooldown, out of ammo/energy)
- **Visual correctness**:
  - bullets moving sector-to-sector
  - grenade fuse + detonation
  - mine placement, arming, trigger, detonation
  - wall bumps + bot bumps

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

Filters (later):
- by bot
- by date range
- by win/loss

### 2.2 Replay Viewer (Match Screen)

Core regions (align with `UIPlan.md`):
- arena viewport (3×3)
- right inspection panel (bot list + code)
- bottom timeline (ticks)
- optional event log

Playback controls:
- play/pause
- step +1
- scrub to tick
- speed presets

Inspection:
- clicking a bot focuses it in the right panel
- highlight executed line (`pc`) at the current tick
- show per-tick result (executed/no-op/error) + reason

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
  - `loadout` (slot module ids)
  - `sourceText` (or `sourceHash` + URL)

### 3.2 Two storage strategies

#### A) Full state per tick (simplest v1)

- store a full `state` snapshot every tick

Pros:
- simplest UI seeking

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

Client-first recommendation:
- start with **A** for local testing
- move to **B** once server storage becomes important

---

## 4) Event types needed for correct visualization

The UI should not infer combat; it should render what the replay says.

Minimum event list (suggested):

### 4.1 Bot execution trace

- `BOT_EXEC`:
  - `tick`, `botId`
  - `pcBefore`, `pcAfter`
  - `instrText` (or `instrIndex`)
  - `result`: `EXECUTED | NOOP | ERROR`
  - `reason` (optional): `COOLDOWN | NO_AMMO | NO_ENERGY | NO_MODULE | INVALID_TARGET | ...`

### 4.2 Movement + bumps

- `BOT_MOVED`: `botId`, `fromSector`, `toSector`
- `BUMP_WALL`: `botId`, `dir`, `damage`
- `BUMP_BOT`: `botId`, `otherBotId`, `dir`

### 4.3 Resources

- `RESOURCE_DELTA`: `botId`, `ammoDelta`, `energyDelta`, `healthDelta`, `cause`

### 4.4 Projectiles (bullets)

- `BULLET_SPAWN`: `bulletId`, `ownerBotId`, `sector`, `dir`
- `BULLET_MOVE`: `bulletId`, `fromSector`, `toSector`
- `BULLET_HIT`: `bulletId`, `victimBotId`, `damage`
- `BULLET_DESPAWN`: `bulletId`, `reason` (`TTL|WALL|HIT`)

### 4.5 Grenades

- `GRENADE_SPAWN`: `grenadeId`, `ownerBotId`, `sector`, `dir`, `fuse`
- `GRENADE_MOVE`: `grenadeId`, `fromSector`, `toSector`
- `GRENADE_FUSE_TICK`: `grenadeId`, `fuseRemaining`
- `GRENADE_DETONATE`:
  - `grenadeId`, `centerSector`
  - `damageCenter`, `damageAdjacent`

### 4.6 Mines

- `MINE_PLACE`: `mineId`, `ownerBotId`, `sector`, `armTicks`
- `MINE_ARMED`: `mineId`
- `MINE_TRIGGER`: `mineId`, `triggerBotId`
- `MINE_DETONATE`:
  - `mineId`, `centerSector`
  - `damageCenter`, `damageAdjacent`

### 4.7 Damage + deaths

- `DAMAGE`:
  - `victimBotId`, `amount`, `source`, `sourceBotId?`, `kind`
- `BOT_DIED`:
  - `victimBotId`, `creditedBotId?`

---

## 5) Client data sources (now vs later)

### 5.1 Now (client-only)

- run local simulation
- store replays in:
  - IndexedDB (recommended)
  - or localStorage for tiny payloads

### 5.2 Later (server)

- user logs in
- match list loads from server (pagination)
- replay downloads from server (or via signed object-storage URL)
- client caches recently opened replays

---

## 6) Minimal server API (future-ready)

These endpoints are enough to power the browser replay UX:

- `GET /api/matches?userId=...` (or current user)
  - returns match list summaries

- `GET /api/matches/:matchId`
  - returns metadata + participants + result

- `GET /api/matches/:matchId/replay`
  - returns replay JSON (small v1)
  - or returns `{ url }` for object storage

---

## 7) UI implementation notes

- Rendering should be driven by replay state/events, not by re-running logic in the UI.
- Use the same coordinate system as `UIPlan.md` (sector anchors).
- Provide an "event log" panel that can be filtered by:
  - bot
  - tick range
  - event types (damage, spawns, explosions)

---

## 8) Decisions needed to proceed

1) Replay storage for the first client prototype:
- A) full state per tick
- B) event log + checkpoints

2) For the battle picker, should local matches be stored per:
- A) per-browser profile only
- B) per-logged-in user (even before server matches exist)

3) Source code display:
- A) embed bot source in replay
- B) store source separately and reference via hash/url
