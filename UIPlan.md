# UIPlan.md — Client UI Plan (v1: Simple Landing → Workshop)

This document describes the **client-first UI/UX** for the bot battle game:
- players write bot code
- run local simulations
- inspect/replay what happened (deterministic ticks; simulation advances in whole ticks, but playback can render motion smoothly)

v1 goal: ship the smallest UI that proves the core loop:
**edit bot → run a 4-bot match locally → replay/debug → iterate**.

It builds on:
- `BotInstructions.md` (bot language)
- `ArenaPlan.md` (sectors/zones)
- `Ruleset.md` (timing, powerups, damage)
- `ReplayViewerPlan.md` (replay UX + schema)
- `ArenaVisualPlan.md` (arena rendering visuals)
- `Todo.md` (locked decisions)

---

## 1) App flow + routes (client-first)

### 1.1 v1 user journey (Landing → Workshop)

1) **Landing** (`/`)
   - One primary CTA: **Start Game** → `/workshop`.
   - v1 should be **low-friction**:
     - allow a guest/local mode (no login UX)
     - if/when a user session exists, the Workshop can load the user’s 3 server-stored bots

2) **Workshop** (`/workshop`) — the entire v1 loop
   In v1, the Workshop must support these user actions end-to-end:
   - **Select your bot (BOT1)**
     - top area bot selector: choose 1 of **3 server-stored bots**
     - selection controls which bot occupies **BOT1** in the preview match
   - **Edit your bot** (the selected BOT1)
     - multiline code editor with inline validation errors
     - local draft persistence across refresh
     - **Save** button persists the current draft to the server as the bot’s latest saved source
   - **Choose equipment / loadout** (BOT1)
     - bottom area loadout selector (3 slots)
     - validates rules (no duplicates; at most 1 weapon slot in v1)
     - v1 note: loadout affects **local preview** only; server-run matches store/run only bot code in v1
   - **Run a local match (4 bots)**
     - BOT1 = your selected bot (editable)
     - BOT2–BOT4 = built-in opponents (read-only)
   - **Replay what happened**
     - play/pause, step +1, restart to tick 0, jump to end, speed
     - the simulation is tick-based (discrete state at each tick)
     - tick convention: `state[t]` is the **end-of-tick** snapshot; `events[t]` explain `state[t-1] → state[t]` (see `ReplayViewerPlan.md` §3.3)
     - while playing, the arena **must** render intra-tick motion smoothly by interpolating between tick states/events
     - when paused or scrubbing/stepping, render the exact playhead snapshot (`state[t]`; no intra-tick interpolation)
   - **Inspect bots**
     - bot list/inspector shows: appearance token, stats at playhead tick, and code view with `pc` highlight
     - BOT2–BOT4 code is read-only

### 1.2 v1 routes (minimal)

- `/` (Landing)
- `/workshop` (Workshop)

Post-v1 routes (planned; not required for the first shippable v1 funnel):
- Replay library (`/matches`)
- Match/replay viewer (`/matches/:matchId`)

### 1.3 URL state (refresh/debug-friendly)

Recommended query params on workshop/replay pages:
- `myBot` (the selected **server-stored** bot id being edited; occupies `BOT1`)
- `tick` (current playhead)
- `bot` (selected match slot id for inspection, e.g. `BOT2`)
- `speed` (playback speed multiplier)
- `follow` (0/1, whether the viewer follows the newest tick during live run)

Example:
- `/workshop?myBot=me%2Fgreedy&tick=120&bot=BOT2&speed=2&follow=0`

---

## 2) Screens

### 2.1 Landing (`/`)

Goal: minimal friction to start.

v1 UI (locked):
- a single primary button: **Start Game** → goes to `/workshop`

Layout (v1):
- full-height page (`min-height: 100vh`)
- centered content block ("card"):
  - `max-width: 720px`
  - comfortable padding (e.g. 24px)
- minimal text (keep it short, but set expectations clearly):
  - title
  - one sentence: “Code a bot. Run a 4‑bot match locally. Replay it tick‑by‑tick (with smooth motion during playback).”
  - optional 3 bullets:
    - Code your bot (BOT1)
    - Battle 3 built-in opponents
    - Replay and debug deterministically (seeded)

Interaction (v1):
- the **Start Game** button should be focused by default
- pressing **Enter** should trigger Start Game

(No bots or arena preview on the landing page in v1; all gameplay is on `/workshop`.)

### 2.2 Workshop (`/workshop`) — Bot Selection + Editor + Replay Viewer + Loadout

The workshop is the entire v1 experience.

#### Initial state (v1)
- Ensure the user has an identity (signed-in session **or** auto-created guest session), then load **My Bots** from the server.
  - v1 server should ensure there are exactly **3 server-stored bots** for the current user (see `ServerPlan.md`).
- Determine the selected bot for **BOT1**:
  - if `myBot` query param exists → use it
  - else if `ws:selectedMyBotId` exists → use it
  - else → default to the first bot returned by the server
- Load BOT1 source into the editor:
  - if a local draft exists for the selected bot → use it
  - else → load the server `sourceText`
  - else → load a built-in **starter template** (valid script that runs without edits)
    - v1 default template: `examples/bot0.md` ("Powerup Seeker")
- Load BOT1 loadout (local-only in v1):
  - if a local draft exists for the selected bot → use it
  - else → default to empty slots
- Built-in opponents default to:
  - `BOT2 = builtin/chaser-shooter` (Chaser Shooter; from `examples/bot2.md`)
  - `BOT3 = builtin/corner-bunker` (Corner Bunker; from `examples/bot3.md`)
  - `BOT4 = builtin/saw-rusher` (Saw Rusher; from `examples/bot4.md`)
- Preview run behavior:
  - recommended: auto-run **one** match on first workshop visit (so the arena is not static)
  - after that, only run when the user clicks **Run / Preview**
- First-run “What you can do here” hint (v1-friendly):
  1) Select one of **your bots (BOT1)** at the top
  2) Edit code on the left + pick a loadout at the bottom
  3) Click **Run / Preview**, then step tick-by-tick to debug deterministically

#### Layout (minimum viable)

Desktop/laptop:
- **Top area**: bot selection (BOT1) + run controls
- **Middle area**: 3-column layout
  - left: coding area (editor)
  - center: arena + replay controls
  - right: reference/help + bot inspector
- **Bottom area**: equipment/loadout selection (BOT1)

Mobile/narrow:
- Keep the arena visible.
- Editor and right panel become tabs/drawers.
- Bottom loadout becomes a collapsible sheet.

#### Top area: bot selection (BOT1) + server actions
- **Bot selector** (dropdown or list) showing the 3 server-stored bots.
  - Changing the selected bot updates:
    - the editor contents
    - the bottom loadout selector
    - the next preview run’s BOT1 (and should reset the current run/replay to avoid confusion)

- **Save** (server)
  - Saves the current editor contents for the selected bot to the server.
  - After save, the server returns an updated `source_hash`.
  - UX note: if the editor has unsaved changes, show a small “Unsaved” indicator near the bot selector.

- **Load from server** (optional but concrete)
  - Replaces the current editor contents with the server’s latest saved `source_text` for the selected bot.
  - This is the escape hatch when local drafts diverge or are corrupted.

- **Run on Server**
  - Launches a one-off server simulation using the selected bot as `BOT1` and the same built-in opponents as the local preview.
  - Uses the **latest server-saved source** for the selected bot.
    - If the editor has unsaved changes, require **Save** first (or provide an explicit “Run last saved” confirm).
  - API (minimal): `POST /api/simulations` → `{matchId}` → poll `GET /api/matches/:matchId` until `complete` → load `GET /api/matches/:matchId/replay`.
  - On completion, the Workshop fetches the replay JSON and displays it in the same replay viewer.
  - Minimal UX: treat it as an async job (show `queued/running` state; allow cancel later).

#### Left: coding area (editor)
- Bot code editor (multiline, line numbers)
- Inline validation/errors (syntax errors, invalid instructions, etc.)
- Clearly label which bot is being edited (name/id from the bot selector)

#### Center: arena + replay viewer
- Arena viewport
- Playback controls (play/pause, step +1, scrub to tick, restart, jump to end, speed)
  - show current tick and tick cap (e.g. `Tick 120 / 600`)
  - when stalemate countdown is active, show the remaining countdown (e.g. `Stalemate in 18s`)
- Recommended (consistent with `ReplayViewerPlan.md`): a tick scrubber/timeline under the arena controls.

#### Right: instruction reference/help + bot inspector
The right panel is always available and is split into two sections (tabs or stacked accordions):

1) **Instruction reference / help**
   - compact cheatsheet for core syntax + common patterns
   - includes a clear list of instructions with short examples
   - links to the full spec in `BotInstructions.md`

   Suggested v1 cheatsheet sections:
   - **Basics**: one instruction per line; `;` comments; labels (`LABEL X`) + jumps (`GOTO X`).
   - **Targeting**:
     - `TARGET_POWERUP HEALTH|AMMO|ENERGY`
     - `TARGET_CLOSEST_BOT` / `TARGET_WEAKEST_BOT`
   - **Movement**:
     - `MOVE_TO_TARGET`
     - `SET_MOVE_TO_BOT CLOSEST_BOT`
     - `SET_MOVE_TO_SECTOR <S> ZONE <Z>`
   - **Combat**:
     - `USE_SLOT1 TARGET` (or `USE_SLOT1 NEAREST_BOT`)
   - **Predicates (common)**:
     - `POWERUP_EXISTS(HEALTH)`
     - `DIST_TO_CLOSEST_BOT() <= 16`

   The right panel should be readable without scrolling too much; put the full instruction list behind an accordion/"More" link.

2) **Bot inspector**
   - bot list (select `BOT1..BOT4`)
   - appearance token, stats at the playhead tick, and code view with `pc` highlight
   - per-tick execution result (`EXECUTED | NOP | ERROR`) and reason (when available)
   - BOT2–BOT4 code is read-only

#### Bottom: equipment/loadout selection (BOT1)
- 3 slot selectors (`slot1`, `slot2`, `slot3`) for the selected BOT1
- Enforce v1 rules:
  - no duplicate modules among equipped slots
  - at most one weapon module equipped (v1: `BULLET` or `SAW`)
- Show a clear “loadout affects movement speed” reminder (see `Ruleset.md`)

#### Bots in the preview match (v1 default)
- The preview match is always **4 bots** (`BOT1..BOT4`).
- Default mapping in workshop:
  - `BOT1` = selected server-stored bot (editable)
  - `BOT2` = Built-in opponent A
  - `BOT3` = Built-in opponent B
  - `BOT4` = Built-in opponent C

Built-in opponents are bundled with the client as static examples (see `examples/`).

Future-proofing note:
- Treat both your bots and opponents as "real bots" with stable identities.
- Built-ins should be namespaced under `builtin/*` and carry pinned `{rulesetVersion, dslVersion, sourceHash}` so we can later swap the source from local bundle → server registry without changing the Workshop UX.

v1 starter template:
- `bot0.md` (Powerup Seeker)

v1 built-in opponent examples:
- `bot2.md` (Chaser Shooter) → `builtin/chaser-shooter`
- `bot3.md` (Corner Bunker) → `builtin/corner-bunker`
- `bot4.md` (Saw Rusher) → `builtin/saw-rusher`

(Identity/version planning: see `BotModelPlan.md`.)

#### Primary actions
- **Save** (server)
  - persists the selected bot’s current editor text to the server (`source_text` → `source_hash`)
- **Run / Preview** (local) (primary)
  - compiles/validates your bot
  - runs a local match (live) and records a replay
  - stops when the simulation ends (last bot alive) or when it reaches an end condition (`tickCap` / `STALEMATE`; see `Ruleset.md`)
- **Run on Server**
  - launches a one-off server match and then loads its replay into the viewer
- **Reset match** (secondary)
  - resets the current local run to tick 0

#### Opponent configuration (v1)
- v1 can keep opponents fixed (the same 3 bots every time).
- Optional (still v1-friendly): allow selecting which built-in bot is in BOT2/BOT3/BOT4.

---

## 3) Persistence / memory (v1)

v1 goal: don’t lose your work when you refresh.

- Persist your per-bot code/loadout drafts locally (so switching bots and refreshing is safe).
- Persist minimal run config: seed (optional), tick cap (optional), last selected opponent set.
- Server remains the source of truth for the 3 bots; local persistence is a draft/cache layer.
- The Workshop distinguishes between:
  - **local draft** (what’s currently in the editor, persisted locally), and
  - **server-saved source** (what `Save` writes; what `Load from server` restores).

Recommended storage:
- `localStorage` for small settings (seed, tick cap, selected bot ids, UI layout)
- `IndexedDB` for bot drafts (source text + metadata), if/when drafts become larger

MVP localStorage keys (concrete, v1-friendly):
- `ws:storageVersion` = `2`
- `ws:selectedMyBotId` = string (server bot id used for BOT1)
- `ws:botDrafts` = JSON map (`{[myBotId]: {sourceText, lastEditedAt}}`)
- `ws:botLoadouts` = JSON map (`{[myBotId]: loadout}`)
- `ws:opponents` = JSON array of built-in ids in BOT2..BOT4 order (default: `["bot2","bot3","bot4"]`)
- `ws:runConfig` = JSON (`{seedMode: "random"|"fixed", seed?: number, tickCap?: number}`)

(If/when drafts become larger or you support multiple drafts, move the draft bodies to IndexedDB and keep only ids in localStorage.)

---

## 4) Client state model (recommended)

Keep three layers of state:

1) **Persistent workshop state** (survives refresh)
- selected bot id for BOT1: `{selectedMyBotId}`
- per-bot drafts: `{[myBotId]: {sourceText, lastEditedAt, loadout}}`
- match defaults: `{tickCap, seedMode, lastOpponents}`

2) **Ephemeral live run state**
- run status: `idle | running | finished | error`
- current tick (newest tick produced)
- live replay buffer (events / snapshots being recorded)

3) **Replay viewer state** (works for live + saved)
- playhead tick
- playing/paused
- speed
- selected bot id
- Follow Live flag

Single-source-of-truth rule:
- arena + inspector render from `(replayData, playheadTick, selectedBotId)`.

---

## 5) Arena rendering (sectors + zones)

Detailed visual/UX spec (grid rendering, scaling, entity visuals, overlays): see `ArenaVisualPlan.md`.

### 5.0 Smooth movement (rendering) with tick-based simulation (v1)

Simulation remains **tick-based**:
- bot positions are continuous `pos` (world units) and change only at tick boundaries (end-of-tick snapshots)
- movement updates a bot’s `pos` by up to `speedUnitsPerTick` per tick (then collision/bump rules may clamp/cancel it)

Rendering must feel smooth while playing:
- while playback is running, the viewer **interpolates** bot/projectile positions within each tick (linear interpolation is fine)
- when paused or scrubbing, render the **exact tick snapshot** (no intra-tick interpolation)

(Implementation details and recommended interpolation rules: `ArenaVisualPlan.md` §7.2.)

### 5.1 World model + scaling

From `ArenaPlan.md`:
- zone: 32×32 world units
- sector: 64×64 (2×2 zones)
- arena: 192×192 (3×3 sectors)

Render scaling:
- choose integer `scale` for crisp pixel art
- `zoneRenderPx = 32 * scale`
- `sectorRenderPx = 64 * scale`
- `arenaRenderPx = 192 * scale`

### 5.2 Grid visibility requirements

- draw **sector boundaries** as **thicker green** lines
- draw **zone boundaries** as **thinner green** lines
- always show sector ids 1..9

### 5.3 Entity rendering

- bots:
  - v1 (locked): render each bot as a **circle token** (solid fill) + slot id (`BOT1..BOT4`) + resource bars
    - color comes from the replay header `bots[].appearance` (see `ReplayViewerPlan.md`)
    - fallback when missing: deterministic per-slot palette (e.g. BOT1 blue, BOT2 red, BOT3 green, BOT4 yellow)
  - bump feedback (render-only): when `BUMP_WALL` or `BUMP_BOT` occurs, render a small deterministic “bounce” effect (no gameplay physics). See `ArenaVisualPlan.md` §5.7.
  - later (images/gifs): if `bots[].appearance.kind = "IMAGE"` and the avatar resolves, draw the image **clipped to the same circle**, otherwise keep the v1 circle fallback
    - always keep a readable overlay (slot id or initials) for debugging
- powerups: icons at their anchor location
- bullets/grenades/mines: simple sprites rendered above the grid

Walls:
- only the **outer boundary** is a gameplay wall in v1
- outer wall should be visually distinct from the green grid

---

## 6) Inspector panel

- bot list with display names + slot ids
- code viewer with current `pc` highlight
- per-tick execution result (`EXECUTED | NOP | ERROR`) and reason (when available)

---

## 7) Playback + tick timing

Ruleset timing (locked for v1):
- `1 tick = 1 second` (see `Ruleset.md`, `ticksPerSecond = 1`)

Playback controls:
- Play/Pause
- Step +1
- Step -1 (enabled only if replay storage supports it)
- Jump to start / end
- Speed presets (example): 0.5× / 1× / 2× / 6× / 12×

Default playback:
- 1× advances at **1 tick/sec**

---

## 8) Replay saving/loading (client) (post-v1)

v1 note:
- The v1 Workshop only needs an **in-memory replay for the most recent run** (enables playback + inspection).

When added post-v1:
- On match end: show **Save Replay** dialog (name + save/discard)
- Store replays in **IndexedDB** (recommended)
- Provide:
  - Replay Library list (Open/Delete)
  - Export JSON
  - Import JSON

(Details: `ReplayViewerPlan.md`.)

---

## 9) Open UI decisions

1) Rendering tech: DOM/CSS vs Canvas2D
2) Replay storage for MVP: full snapshot per tick vs event log + checkpoints
3) Whether to expose match seed/tick cap controls in Workshop v1 or hide behind an “Advanced” accordion
