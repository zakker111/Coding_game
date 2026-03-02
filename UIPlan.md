# UIPlan.md — Client UI Plan (Bot Arena + Code/Debug Panels)

This document captures the **planned UI/UX and data flow** for the client-side experience:
- watch matches (live or replay)
- inspect each bot’s program and current execution line
- understand why actions happened (deterministic tick + instruction trace)

It builds on:
- `BotInstructions.md` (instruction language)
- `Todo.md` (current locked decisions)

---

## 1) UI goals

- **Readable match playback** in a 9-sector arena.
- **First-class debugging**: clearly show which instruction executed on each tick.
- **Per-bot inspection**: click a bot to view its code, state, loadout, and recent events.
- **Replay navigation**: start/pause, speed control, step tick, jump to tick.
- **Determinism-friendly**: the UI is a pure view over replay data/simulation state.

---

## 2) MVP app flow (rough v1)

The client should have a minimal, end-to-end loop:

1) **Landing / Auth**
2) **Bot Workshop** (name + avatar + code editor + instruction reference)
3) **Match Screen** (arena + playback + click bots to inspect code)

This is client-first UX planning; server integration can come later.

### 2.1 Landing / Auth screen

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

### 2.2 Bot Workshop screen

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

### 2.3 Match Screen

When the user clicks **Load Match**:
- show the arena + bot list
- show a **Start** button to begin ticking the simulation

Playback:
- default is a “real-time feeling” by advancing ticks automatically at a modest speed
- user can pause and step ticks

Inspection:
- user can click any bot in the arena (or in a bot list) to view that bot’s code
- show both:
  - **display name** (user-chosen)
  - **match slot id** (`BOT1..BOT4`) for deterministic reference
- the code viewer highlights the current instruction per tick

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

- **Render size is fixed**: bots display at **32×32 CSS pixels**.
- User uploads can be any size, but should be normalized into a 32×32 rendered form.

### 4.3 Arena sizing (client-side; sector render size clamp)

You clarified: the **128×128 clamp is client-side**.

Recommended interpretation:
- default **sector render size** is ~128×128
- total arena render is ~384×384 (3×3)

Responsive sizing approach:
- `sectorRenderPx = clamp(floor(min(availableWidth, availableHeight) / 3), 128, 256)`
- total arena size is `3 * sectorRenderPx`

### 4.4 Arena model on screen

- 9 sectors arranged as:
  - `1 2 3`
  - `4 5 6`
  - `7 8 9`
- Corner spawns: sectors `1, 3, 7, 9`.

### 4.5 Entity overlays

- **Bots**: sprite + display name + slot id (`BOT1..BOT4`) + resource bars (health/ammo/energy)
- **Bullets**: simple dot/line sprite traveling sector-to-sector per tick
- **Powerups**: icons for HEALTH/AMMO/ENERGY
- **Status indicators**: saw/shield on states (small icons)

### 4.6 Multi-entity layout inside a sector (avoid overlapping)

Deterministic placement (recommended):
- Predefine **4 anchors** inside each sector cell:
  - top-left, top-right, bottom-left, bottom-right
- Assign bots to anchors deterministically (by bot id order).
- Place powerup icon at the center.
- Render bullets on an overlay layer above sector background.

### 4.7 Walls (distinct sector boundaries, and gameplay-relevant)

Walls are part of gameplay:
- when a bot bumps into a wall it takes a small amount of damage
- the bot visually “bounces” from the wall

UI requirements:
- Walls must be very clear visually.
- Render collision feedback:
  - a small hit flash on the bot
  - a floating damage number (optional)
  - a short bounce animation (tiny positional nudge) while keeping tick stepping clear

Recommended v1 wall styling:
- thick outer border around the whole arena
- clear inner walls between sectors

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
