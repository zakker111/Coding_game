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
- **Tick-based but smooth**: simulation/replay data is tick-indexed, but while playing the viewer can interpolate motion within a tick for readability.
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

### 2.1 Match History (Battle Picker) (post-v1)

v1 note:
- The v1 Workshop only needs an **in-memory replay for the most recent run**.
- A persistent replay library / match history UI is post-v1 (can be added without changing simulation rules).

Entry points (post-v1):
- after finishing a local match: **Save Replay** / **View Replay**
- top nav: **Matches**

List item fields (minimum):
- match id
- timestamp
- mode:
  - v1 workshop preview uses `1v1v1v1` (4 bots)
  - optional client-only debug mode (post-v1): `1v1`
- participant display names + appearance (v1: color; future: image/GIF)
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
- `ticksPerSecond` (so “1× playback” can mean real time for that ruleset version)
- `matchSeed`
- `tickCap`
- `bots[]`:
  - `botId` (`BOT1..BOT4`)
    - **Important:** this is the **match slot id** (deterministic engine identifier), not a user bot identity.
    - Future-proofing: stable bot identity/version live in `botRef` fields below.
  - `displayName`
  - `appearance` (presentation-only; must not affect determinism)
    - v1 required (placeholder): `{ kind: "COLOR", color: "#RRGGBB" }`
    - future (images/gifs):
      - `{ kind: "IMAGE", fallbackColor: "#RRGGBB", avatarRef: { assetId?, contentHash?, url? } }`
      - `fallbackColor` is used when the image cannot be loaded.
      - `avatarRef` is an immutable-ish reference the viewer can resolve via:
        - server asset registry (`assetId`)
        - content-addressed storage (`contentHash`)
        - or a direct URL (`url`) when appropriate
    - Replay size rule: **do not embed large image bytes** in the replay. Replays should carry only fallbacks + refs.
  - `loadout` (3 slot positions; each entry is a module id or `null`)
    - v1 validation: no duplicate modules among equipped slots
    - v1 validation: at most one weapon module equipped (`BULLET` or `SAW`)
  - `sourceText` (or `sourceHash` + URL)
  - future (server / library):
    - `botRef`: `{ botId, botVersion?, sourceHash?, compiledIrHash? }`
      - `botId` here is the stable identity (e.g. `alice/greedy`, `builtin/chaser-shooter`)
      - `botVersion` is an immutable snapshot identifier (server assigned)

(See `BotModelPlan.md` for the full identity/version model.)

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

### 3.3 Tick semantics (must be explicit)

To keep rendering, scrubbing, and "what happened on tick t" consistent across clients:

- Convention (recommended for v1):
  - `state[t]` represents the **end-of-tick state** for tick `t`.
  - `events[t]` are the ordered events that occurred **during tick `t`** to transform `state[t-1] → state[t]`.

Notes:
- Tick `0` is the initial state before any tick processing (so `state[0]` is "start of match").
- Under this convention, viewers that render purely from `state[t]` will match "after resolution" visuals (moves applied, bullets advanced, hits applied, pickups applied, deaths resolved).
- The per-tick event list remains the canonical explanation/debug log for how `state[t]` was reached.

Rendering note (smooth playback; required for v1 Workshop/replay viewer):
- For tick `t`, treat `state[t-1]` as the **start-of-tick** state and `state[t]` as the **end-of-tick** state.
- While playing, compute an intra-tick progress `p ∈ [0,1]` and interpolate *positions* from `start → end`.
  - Keep non-positional state (HP/ammo/energy, deaths, pickups) snapped to tick boundaries.
- When paused/scrubbing/stepping, render at `p=1` (end-of-tick) so the playhead tick matches `state[t]`.

---

## 4) Event types needed for correct visualization

The UI should not infer combat; it should render what the replay says.

Event ordering + compatibility:
- The per-tick `events[]` list is ordered. When multiple events happen in the same tick (e.g., burst shots), the array order is the canonical sequence the viewer should use.
- Unknown event types should be ignored (so older viewers can still open newer replays).

Tick field convention:
- Events are stored under `events[t]`, so the **tick is implied** by the container.
- Individual event objects may include `tick` for redundancy/debugging, but it is optional and must match the container tick.

### 4.1 Bot execution trace

- `BOT_EXEC`:
  - `botId`
  - `tick` (optional; redundant; must match the container tick)
  - `pcBefore`, `pcAfter`
  - `instrText` (or `instrIndex`)
  - `result`: `EXECUTED | NOP | ERROR`
  - `reason` (optional): a stable enum (see below)

Trace conventions (recommended, to avoid implementation drift):
- **Invalid/malformed instruction** (runtime policy in `Todo.md` / `BotInstructions.md`):
  - treat as no-op for gameplay
  - set `result = ERROR`
  - set `reason = INVALID_INSTR`
  - set `pcAfter = 1` (the post-tick state has `pc = 1`)
- **Valid instruction that no-ops** due to cooldown/resources/invalid target/etc.:
  - set `result = NOP`
  - set `reason` accordingly
  - `pcAfter` advances as normal (unless the instruction defines special control-flow)

Canonical `reason` values (v1+; extend additively):
- `INVALID_INSTR`
- `NO_MODULE`
- `COOLDOWN`
- `MOVE_COOLDOWN`
- `NO_AMMO`
- `NO_ENERGY`
- `INVALID_TARGET_KIND`
- `INVALID_TARGET`
- `INVALID_LOC`

### 4.2 Locations (`loc`)

Bots and powerups live on deterministic **location anchors** (see `ArenaPlan.md`).

Encode every location as:
- `loc = { sector: 1..9, zone: 0..4 }`
  - `zone=0` means sector center
  - `zone=1..4` means zone center

Optional future extension: continuous positions (`pos`)
- Some future weapons (variable-speed projectiles, wavy/curved paths, beams) are easier to render with continuous coordinates.
- When needed, encode positions as:
  - `pos = { x, y }` in **arena world units** (see `ArenaPlan.md` / `UIPlan.md` sizing), where `(0,0)` is the arena top-left and `(192,192)` is the arena bottom-right outer wall.
  - Recommended bounds convention (v1): `x` and `y` are clamped to `0..192` (inclusive), with the outer wall rendered at `x=0`, `x=192`, `y=0`, `y=192`.
- When both `loc`/`sector` and `pos` are present, the viewer should prefer `pos` for rendering.

### 4.3 Movement + bumps

- `BOT_MOVED`:
  - `botId`
  - `fromLoc` (a `loc`; see §4.2)
  - `toLoc` (a `loc`; see §4.2)
  - `dir` (`UP|DOWN|LEFT|RIGHT`)
  - `tick` (optional; redundant; must match the container tick)

Semantics:
- Emit `BOT_MOVED` **only when movement succeeds**.
- In tick `t`, `fromLoc` should match the bot location in `state[t-1]`, and `toLoc` should match the bot location in `state[t]`.
- `dir` is the bot’s chosen move direction for the step (do not derive it from `fromLoc → toLoc`, because anchor steps can change both `x` and `y`).

- `BUMP_WALL`: `botId`, `dir`, `damage`
- `BUMP_BOT`: `botId`, `otherBotId`, `dir`

Rendering note (required for v1):
- Bump events are the canonical signal for “failed movement attempt” feedback.
- They do **not** imply any gameplay position change beyond what `state[t]` already encodes (in v1 discrete-anchor rules, a bump means the bot stays at the same `loc`).
- While playing, the viewer should apply a small deterministic “bounce” visual effect during tick `t` using the bump `dir` (see `ArenaVisualPlan.md` §5.7). When paused/scrubbing (render `p=1`), the bounce offset is `0`.

Determinism note:
- If multiple bump events for the same `botId` exist in `events[t]`, the viewer should use the **last** one in event order for the bounce direction.

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

### 4.6 Projectiles (bullets; forward-compatible)

v1 uses the `BULLET_*` events below.

Optional fields (not required in v1) support future weapons/features:
- burst fire sequences (group shots fired as a burst)
- variable projectile speeds
- non-linear trajectories (e.g., wavy)

- `BULLET_SPAWN`:
  - required: `bulletId`, `ownerBotId`, `sector`, `dir`
  - viewer spawn position rule:
    - if `pos` is present → render bullet spawn at `pos`
    - else → render bullet spawn at the **owner bot’s location at the moment of firing**
      - v1 tick loop note: instruction execution happens before movement (`ServerSimulationPlan.md`), so for tick `t` this is the bot location in `state[t-1]`.
  - optional:
    - `weaponId` (module id or weapon name, e.g. `BULLET_MK1`)
    - `burst` (burst grouping; omitted for non-burst shots):
      - `burstId` (string)
      - `shotIndex` (0-based)
      - `shotsInBurst` (int)
    - `speedSectorsPerTick` (number; default is `1`)
    - `trajectory` (viewer hint; if omitted, treat as linear):
      - `kind`: `LINEAR | WAVY`
      - `amplitudeUnits` (number; for `WAVY`)
      - `periodSectors` (number; for `WAVY`)
      - `phase` (number; for `WAVY`)
    - `pos` (continuous spawn position; see §4.2)

- `BULLET_MOVE`:
  - required: `bulletId`, `fromSector`, `toSector`
  - optional:
    - `pathSectors` (array of sector ids in traversal order; includes `fromSector` and `toSector`)
      - used when `speedSectorsPerTick > 1` so the viewer can render multi-sector motion in a single tick
    - `fromPos`, `toPos` (continuous positions for rendering slow/fast/curved motion; see §4.2)

- `BULLET_HIT`: `bulletId`, `victimBotId`, `damage`
- `BULLET_DESPAWN`: `bulletId`, `reason` (`TTL|WALL|HIT`)

### 4.6.1 Beams / lasers (future)

Beams are hitscan or short-duration line attacks. They are rendered as a line for the tick(s) they are active.

- `BEAM_FIRE`:
  - `beamId`, `ownerBotId`
  - `fromLoc` (or `pos`), `dir`, `rangeSectors`
  - `durationTicks` (int; `0` or `1` for instantaneous)
  - `ignoresShield` (optional boolean; when true, the viewer should explain that shield mitigation was bypassed)

Damage caused by a beam should still be represented via `DAMAGE` events (see §4.9), ideally with a `sourceRef` pointing to the `beamId`.

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
  - required: `victimBotId`, `amount`, `source`, `sourceBotId?`, `kind`
  - optional (future):
    - `sourceRef`: `{ type, id }` (lets the viewer link damage back to a specific entity)
      - examples:
        - `{ type: "BULLET", id: bulletId }`
        - `{ type: "GRENADE", id: grenadeId }`
        - `{ type: "MINE", id: mineId }`
        - `{ type: "BEAM", id: beamId }`
    - `mitigation` (how defenses interacted with the damage):
      - `shieldAbsorbed` (number; if shields exist)
      - `ignoredShield` (boolean; set true for lasers/beams that ignore shields)


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
