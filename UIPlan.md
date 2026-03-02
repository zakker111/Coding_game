# UIPlan.md — Client UI Plan (v1: Simple Landing → Workshop)

This document describes the **client-first UI/UX** for the bot battle game:
- players write bot code
- run local simulations
- inspect/replay what happened (deterministic ticks)

v1 goal: ship the smallest UI that proves the core loop:
**edit bot → run a 4-bot match locally → replay/debug → iterate**.

It builds on:
- `BotInstructions.md` (bot language)
- `ArenaPlan.md` (sectors/zones/anchors)
- `Ruleset.md` (timing, powerups, damage)
- `ReplayViewerPlan.md` (replay UX + schema)
- `ArenaVisualPlan.md` (arena rendering visuals)
- `Todo.md` (locked decisions)

---

## 1) App flow + routes (client-first)

### 1.1 v1 routes (minimal)

1) **Landing** (`/`)
   - one button: **Start Game** → `/workshop`
   - no auth gating in v1

2) **Workshop** (`/workshop`)
   - the main “coding page”
   - contains:
     - code editor for **your bot**
     - an **arena preview** (live local simulation + replay controls)
     - **three built-in opponent bots** (read-only code view)

Optional (post-v1, can be added later without changing the v1 funnel):
- **Replay Library** (`/matches`)
- **Replay viewer deep-link** (`/replay/:replayId`)

### 1.2 URL state (refresh/debug-friendly)

Recommended query params on workshop/replay pages:
- `tick` (current playhead)
- `bot` (selected bot id, e.g. `BOT2`)
- `speed` (playback speed multiplier)
- `follow` (0/1, whether the viewer follows the newest tick during live run)

Example:
- `/workshop?tick=120&bot=BOT2&speed=2&follow=0`

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
- minimal text only (optional): title + one sentence

Interaction (v1):
- the **Start Game** button should be focused by default
- pressing **Enter** should trigger Start Game

(No bots or arena preview on the landing page in v1; all gameplay is on `/workshop`.)

### 2.2 Workshop (`/workshop`) — Editor + Arena + Opponents

The workshop is the entire v1 experience.

#### Initial state (v1)
- Load **Your Bot** source:
  - if `ws:myBotSourceText` exists → load it
  - else → load a built-in **starter template** (valid script that runs without edits)
- Built-in opponents default to:
  - `BOT2 = bot2` (Chaser Shooter)
  - `BOT3 = bot3` (Corner Bunker)
  - `BOT4 = bot4` (Saw Rusher)
- Preview run behavior:
  - recommended: auto-run **one** match on first workshop visit (so the arena is not static)
  - after that, only run when the user clicks **Run / Preview**

#### Layout (minimum viable)

Desktop/laptop:
- **Two-column** layout: Editor (left) + Preview/Inspector (right)
- Right side uses **tabs** by default: Inspector | Opponents | Code

Mobile/narrow:
- Arena stays visible; secondary panels become drawers/bottom-sheets.

#### Editor (left)
- Bot code editor (multiline, line numbers)
- Inline validation/errors (syntax errors, invalid instructions, etc.)

#### Preview (right)
- Arena viewport
- Playback controls (play/pause, step +1, restart, speed)
- Bot list + inspector (select BOT1..BOT4 → show stats + code with pc highlight)

#### Bots in the preview match (v1 default)
- The preview match is always **4 bots** (`BOT1..BOT4`).
- Default mapping in workshop:
  - `BOT1` = **Your Bot** (editable)
  - `BOT2` = Built-in opponent A
  - `BOT3` = Built-in opponent B
  - `BOT4` = Built-in opponent C

Built-in opponents are bundled with the client as static examples (see `examples/`).

Future-proofing note:
- Even in v1 client-only mode, treat opponents as "real bots" with stable identities.
- Built-ins should be namespaced under `builtin/*` and carry pinned `{rulesetVersion, dslVersion, sourceHash}` so we can later swap the source from local bundle → server registry without changing the Workshop UX.

v1 built-in examples:
- `bot2.md` (Chaser Shooter) → `builtin/chaser-shooter`
- `bot3.md` (Corner Bunker) → `builtin/corner-bunker`
- `bot4.md` (Saw Rusher) → `builtin/saw-rusher`

(Identity/version planning: see `BotModelPlan.md`.)

#### Primary actions
- **Run / Preview** (primary)
  - compiles/validates your bot
  - runs a local match (live) and records a replay
  - stops when the simulation ends (e.g. last bot alive) or when it reaches a tick cap (default cap is a UI setting until match rules are fully locked)
- **Reset match** (secondary)
  - resets the current local run to tick 0

#### Opponent configuration (v1)
- v1 can keep opponents fixed (the same 3 bots every time).
- Optional (still v1-friendly): allow selecting which built-in bot is in BOT2/BOT3/BOT4.

---

## 3) Persistence / memory (v1)

v1 goal: don’t lose your bot when you refresh.

- Persist your bot draft locally (guest mode).
- Persist minimal run config: seed (optional), tick cap (optional), last selected opponent set.

Recommended storage:
- `localStorage` for small settings (seed, tick cap, selected bot ids, UI layout)
- `IndexedDB` for bot drafts (source text + metadata), if/when drafts become larger

MVP localStorage keys (concrete, v1-friendly):
- `ws:storageVersion` = `1`
- `ws:myBotSourceText` = string
- `ws:myBotLoadout` = JSON (if/when loadout selection exists)
- `ws:opponents` = JSON array of built-in ids in BOT2..BOT4 order (default: `["bot2","bot3","bot4"]`)
- `ws:runConfig` = JSON (`{seedMode: "random"|"fixed", seed?: number, tickCap?: number}`)

(If/when drafts become larger or you support multiple drafts, move the draft bodies to IndexedDB and keep only ids in localStorage.)

---

## 4) Client state model (recommended)

Keep three layers of state:

1) **Persistent workshop state** (survives refresh)
- bot draft: `{sourceText, lastEditedAt}`
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
- optionally label sector ids 1..9

### 5.3 Entity rendering

- bots: square sprite (visual footprint smaller than collision box; see `ArenaVisualPlan.md`) + slot id (`BOT1..BOT4`) + resource bars
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

## 8) Replay saving/loading (client)

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
