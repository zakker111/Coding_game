# UIPlan.md — Client UI Plan (Bot Arena + Code/Debug Panels)

This document captures the **planned UI/UX and data flow** for the client-side experience:
- watch matches (live or replay)
- inspect each bot’s program and current execution line
- understand why actions happened (deterministic tick + instruction trace)

It builds on:
- `BotInstructions.md` (instruction language)
- `Todo.md` (current locked decisions)

---

## 1.1 MVP app flow (new)

The client should have a minimal, end-to-end loop:

1) **Landing / Auth**
2) **Bot Workshop** (avatar + code editor + instruction reference)
3) **Match Screen / Replay Viewer** (arena + playback + click bots to inspect code)
4) **Match History (Battle Picker)** (list saved replays; later list server matches)

This is client-first UX planning; server integration can come later.

Replay viewer + battle picker requirements are detailed in `ReplayViewerPlan.md`.

### 1.1.1 Landing / Auth screen

Goal: let a user either create an account or sign in.

UI elements:
- Title + short description
- Tabs or two buttons:
  - **Create account**
  - **Sign in**
- Minimal form fields:
  - username
  - password
- Primary CTA:
  - **Continue** (navigates to Bot Workshop)

Notes:
- No advanced flows in v1 (forgot password, email verification) unless needed.

### 1.1.2 Bot Workshop screen

Left/center:
- **Bot name** (display name)
  - Client-only v1: stored locally.
  - Server-side later: persisted and visible to other users.
  - Scripts still refer to runtime slots as `BOT1..BOT4`.

- **Bot avatar selection**
  - For now: a palette of **different colored circles** rendered inside a **32×32** square.
  - Later: replace with GIF upload/selection.

- **Code editor**
  - multiline editor for the bot script
  - basic validation feedback later

Right side panel:
- **Instruction reference**
  - show the contents/summary of `BotInstructions.md`
  - include small examples (e.g., `IF (...) DO MOVE_TO_POWERUP HEALTH`)

Match setup:
- Mode selector:
  - **1v1** (client-only testing)
  - **1v1v1v1 deathmatch** (4 bots total)
- CTA:
  - **Load Match** (navigates to Match Screen)

Opponents (v1):
- opponents are **dummy bots** (preset scripts + preset avatars)
- user can inspect their code on the Match Screen

### 1.1.3 Match Screen / Replay Viewer

When the user clicks **Load Match** (or opens an existing replay):
- show the arena + bot list
- show a **Start** button to begin ticking the simulation (local sim) or start playback (replay)

Playback:
- default is a “real-time feeling” by advancing ticks automatically at a modest speed
- user can pause and step ticks

Inspection:
- user can click any bot in the arena (or in a bot list) to view that bot’s code
- show both:
  - **display name** (user-chosen)
  - **match slot id** (`BOT1..BOT4`) for deterministic reference
- the code viewer highlights the current instruction per tick

Details: `ReplayViewerPlan.md`.

### 1.1.4 Match History (Battle Picker)

- Lists saved replays.
  - Client-first: local matches saved in the browser.
  - Later: also list server-run matches for logged-in users.
- Selecting a match opens the **Replay Viewer**.

Details: `ReplayViewerPlan.md`.

---

## 3) Screen layout (proposed)

### 3.1 Primary regions

1) **Arena viewport (center/left)**
   - Displays the 3×3 sector grid.
   - Shows bot sprites, bullets, powerups, and simple effects.

2) **Right-side code/inspection panel (movable)**
   - Docked panel on the right by default.
   - User can drag/move it (and optionally resize it).
   - Contains:
     - bot list (BOT1..BOT4) with display names
     - selected bot’s script (instruction lines)
     - highlight current `pc` line for the selected bot

3) **Bottom timeline**
   - current tick number
   - start/pause, speed, step forward/back
   - optional: tick scrubber

### 3.2 Minimal UI v1

- Arena viewport
- Right-side panel with:
  - bot selector
  - code viewer with current line highlight
- Basic playback controls: start/pause + step tick

---

## 4) Arena rendering plan

### 4.1 Visual style

- Bots are represented as **32×32** sprites.
- For v1, avatars are colored circles; later they become user-selected GIFs.
- Animation is purely visual; the simulation remains tick-based and deterministic.

### 4.2 Sprite sizing policy (user-customizable bots)

- Each sector is subdivided into **4 zones**, and each zone is **32×32 world units**.
- Recommended v1 rule: a bot’s collision box is **32×32 world units** (fits exactly in one zone).

Rendering:
- Bot sprites should be rendered proportional to the chosen `scale`:
  - `botRenderPx = 32 * scale`
- User uploads can be any size, but should be normalized into the bot’s rendered size.

### 4.3 Arena sizing (client-side)

World units (from `ArenaPlan.md`):
- each **zone** is **32×32**
- each **sector** is **64×64** (2×2 zones)
- the full arena is **192×192** (3×3 sectors)

Client rendering should scale these world units.

Recommended responsive sizing:
- choose a `scale` based on available space
- `zoneRenderPx = 32 * scale`
- `sectorRenderPx = 64 * scale`
- `arenaRenderPx = 192 * scale`

If you want clamping, clamp `sectorRenderPx` or `arenaRenderPx` directly (example):
- `sectorRenderPx = clamp(floor(min(availableWidth, availableHeight) / 3), 64, 256)`

### 4.4 Arena model on screen

- 9 sectors arranged as:
  - `1 2 3`
  - `4 5 6`
  - `7 8 9`
- Each sector contains **4 zones** arranged as:
  - `1 2`
  - `3 4`

Corner spawns (4-bot matches):
- `BOT1 → SECTOR 1 ZONE 1`
- `BOT2 → SECTOR 3 ZONE 2`
- `BOT3 → SECTOR 7 ZONE 3`
- `BOT4 → SECTOR 9 ZONE 4`

Grid rendering requirement (clarity):
- draw **sector boundaries** as **thicker green lines**
- draw **zone boundaries** as **thinner green lines** inside each sector
- optionally label sectors `1..9` (small, unobtrusive)

### 4.5 Entity overlays

- **Bots**: sprite + display name + slot id (`BOT1..BOT4`) + resource bars (health/ammo/energy)
- **Bullets**: simple dot/line sprite traveling sector-to-sector per tick
- **Powerups**: icons for HEALTH/AMMO/ENERGY
- **Status indicators**: saw/shield on states (small icons)

### 4.6 Multi-entity layout inside a sector (avoid overlapping)

Deterministic placement (recommended):
- Each sector is subdivided into **4 zones** (2×2) per `ArenaPlan.md`:
  - zone `1`: top-left
  - zone `2`: top-right
  - zone `3`: bottom-left
  - zone `4`: bottom-right
- Assign bots to sector-zones deterministically (by bot id order):
  - lowest bot id gets the lowest available zone number
- Place powerup icon at its deterministic spawn location:
  - sector center (`SECTOR s`) or
  - zone center (`SECTOR s ZONE z`)
- Render bullets on an overlay layer above sector background.

### 4.7 Grid lines (green) + walls

You want sectors and zones to be visible **clearly**.

Grid rendering (v1):
- Render **sector boundaries** as **thicker green lines**.
- Render **zone boundaries** inside each sector as **thinner green lines**.

Walls (gameplay):
- In v1, only the **outer boundary** is a gameplay wall.
- When a bot bumps the outer wall:
  - it takes a small amount of damage
  - it visually “bounces” from the wall

UI requirements:
- Outer wall must be visually distinct from the green grid:
  - thick border (can be darker/stronger than grid lines)
- Render collision feedback:
  - a small hit flash on the bot
  - a floating damage number (optional)
  - a short bounce animation (tiny positional nudge) while keeping tick stepping clear

---

## 5) Bot inspection panel (right)

### 5.1 Bot selector

- List `BOT1..BOT4` and show each bot’s display name.
- Clicking a bot selects it and updates the panel.

### 5.2 Code viewer

- Displays the bot’s source text.
- Highlights:
  - current `pc` line at the current tick
  - label lines (jump targets)
  - optional: invalid lines flagged by validator

### 5.3 Execution trace per tick

At tick `t`, show:
- executed instruction text
- whether it had an effect or was a no-op
- resulting events (damage dealt, toggles, pickup)

This implies the replay format should store at least:
- `tick`, `botId`
- `pc_before`, `pc_after`
- `instruction_text` (or instruction index)
- `result` flags (executed/no-op/error)

---

## 6) Timeline + playback

### 6.1 Controls

- Start / Pause
- Step +1 tick
- Step -1 tick (if replay supports reverse stepping via checkpoints)
- Speed presets:
  - 0.5× / 1× / 2×

Default “real-time feeling”:
- 1× should advance ticks at a readable cadence (for example: **6–12 ticks/sec**).
- The UI can visually smooth movement between ticks, but state changes must remain tick-accurate.

### 6.2 Jumping to tick

Two approaches:

- **A) Full-state per tick** (simple viewer, more storage)
- **B) Event log + periodic checkpoints** (recommended)

---

## 7) Data flow: simulation vs UI

Recommended:
- The simulation engine runs headlessly and produces:
  - state snapshots (or checkpoints)
  - per-tick event list
- The UI consumes replay/state and renders a selected tick.

### 7.1 Local test mode

- Client can run a local match using the same engine (same ruleset) and immediately show replay.
- Client-only convenience: allow a **1v1 spawn mode** for testing (does not affect server daily matches).

---

## 8) UI elements that should exist (but can be phased)

- Bot state card: loadout slots, toggles, resources
- Event log: filter by bot, tick range, event type
- Hover tooltips for bots/bullets/powerups

---

## 9) Open UI decisions (need your preference)

1) Arena rendering approach:
   - **A) DOM/CSS** (recommended for v1)
   - **B) Canvas 2D**

2) Visibility rules:
   - show full match state (recommended for debugging), or obey bot sensing limits?

3) Replay navigation:
   - do you need step-back immediately (requires checkpoints/full snapshots), or step-forward + scrub only?
