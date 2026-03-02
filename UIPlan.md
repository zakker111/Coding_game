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
- **Replay navigation**: pause/play, speed control, step tick, jump to tick, search events.
- **Determinism-friendly**: the UI is a pure view over replay data/simulation state.

---

## 1.1 MVP app flow (new)

The client should have a minimal, end-to-end loop:

1) **Landing / Auth**
2) **Bot Workshop** (avatar + code editor + instruction reference)
3) **Match Screen** (arena + playback + click bots to inspect code)

This is client-first UX planning; server integration can come later.

### 1.1.1 Landing / Auth screen (rough v1)

Goal: let a user either create an account or sign in.

UI elements:
- Title + short description
- Tabs or two buttons:
  - **Create account**
  - **Sign in**
- Minimal form fields (exact fields can change later):
  - username
  - password
- Primary CTA:
  - **Continue** (navigates to Bot Workshop)

Notes:
- No advanced flows in v1 (forgot password, email verification) unless needed.

### 1.1.2 Bot Workshop screen (rough v1)

This is the main build/test screen.

Left / center:
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

Match setup block:
- Mode selector:
  - **1v1** (client-only testing)
  - **1v1v1v1 deathmatch** (4 bots total)
- Start button:
  - **Load Match** (navigates to Match Screen)

Opponents (v1):
- opponents are **dummy bots** (preset scripts + preset avatars)
- user can inspect their code on the Match Screen

### 1.1.3 Match Screen (rough v1)

When the user clicks **Load Match**:
- show the arena + bot list
- show a **Start** button to begin ticking the simulation

Playback:
- default is “real-time feeling” by advancing ticks automatically at a modest speed
- user can pause and step ticks

Inspection:
- user can click any bot in the arena (or in a bot list) to view that bot’s code
- the code viewer highlights the current instruction per tick

---

## 2) Screen layout (proposed)

### 2.1 Primary regions

1) **Arena viewport (center/left)**
   - Displays the 3×3 sector grid.
   - Shows bot sprites (GIFs), bullets, powerups, and simple effects.

2) **Right-side code/inspection panel (movable)**
   - A docked panel on the right by default.
   - User can drag/move it (and optionally resize it).
   - Contains:
     - bot list (BOT1..BOT4)
     - selected bot’s script (instruction lines)
     - highlight current `pc` line for the selected bot
     - show previous instruction (tick-1) and next instruction (tick+1)

3) **Bottom timeline (recommended)**
   - Tick scrubber (slider)
   - current tick number
   - play/pause, speed, step forward/back

### 2.2 Minimal UI v1 (if you want to ship fast)
- Arena viewport
- Right-side panel with:
  - bot selector
  - code viewer with current line highlight
- Basic playback controls: play/pause + step tick

---

## 3) Arena rendering plan

### 3.1 Visual style
- Bots are represented as **32×32 GIF sprites**.
- Users can change bot sprites; the client must still render them within a consistent footprint.
- Animation is purely visual; the simulation remains headless and deterministic.

### 3.2 Sprite sizing policy (user-customizable bots)
To keep the arena readable and avoid layout breakage:

- **Render size is fixed**: the UI always displays bots at **32×32 CSS pixels**.
- User uploads can be any size, but they should be **normalized** (server-side or client-side) into a 32×32 rendered form:
  - scale-to-fit into 32×32 while preserving aspect ratio
  - optionally center-crop if you want uniform composition
- Recommended constraints (so uploads don’t become an abuse vector):
  - max file size limit
  - max pixel dimensions limit
  - content-type allowlist (e.g., `image/gif`, optionally `image/png`)

This keeps the arena “spacy but not too spacy”: the arena spacing is controlled by sector sizing, not by user sprite dimensions.

### 3.3 Arena sizing (client-side; sector render size clamp)

You clarified: the **128×128 clamp is client-side**.

Recommended interpretation (consistent with 32×32 sprites and “fit 4 bots per sector”):
- Treat **128×128 as the default render size per sector cell**.
- Total arena render size is therefore about **384×384** at default scale (3×3).

Responsive sizing approach:
- Compute `sectorRenderPx` from available space, but clamp it:
  - `sectorRenderPx = clamp(floor(min(availableWidth, availableHeight) / 3), 128, 256)`
- Total arena size is `3 * sectorRenderPx`.

This keeps the arena:
- large enough to show 4 bots per sector,
- small enough to fit common screens,
- adjustable in the future by changing clamp bounds.

### 3.4 Arena model on screen
- 9 sectors arranged as:
  - `1 2 3`
  - `4 5 6`
  - `7 8 9`
- Corner spawns (locked for daily matches): sectors `1, 3, 7, 9`.

### 3.5 Entity overlays
- **Bots**: sprite + name + small resource bars (health/ammo/energy).
- **Bullets**: simple dot/line sprite traveling sector-to-sector per tick.
- **Powerups**: icons for HEALTH/AMMO/ENERGY.
- **Status indicators**: saw/shield on states (small icons).

### 3.6 Multi-entity layout inside a sector (avoid overlapping)
Because bullets can hit any bot in a sector, multiple bots may occupy the same sector. The UI must avoid sprite overlap.

Deterministic placement (recommended):
- Predefine **4 anchors** inside each sector cell:
  - top-left, top-right, bottom-left, bottom-right
- Add padding so sprites don’t collide visually with the walls:
  - e.g. 10–16px padding from sector edges
- Assign bots to anchors deterministically (by bot id order).
- Place powerup icon at the center, or reserve a fixed mini-slot for it.
- Render bullets on an overlay layer above sector background.

This guarantees each sector has space for 4× 32×32 bots without overlap.

### 3.7 Walls (distinct sector boundaries, and gameplay-relevant)
You requested distinct walls and confirmed they are **part of gameplay**:
- when a bot bumps into a wall it takes a small amount of damage
- the bot visually “bounces” from the wall

UI implications:
- Walls must be very clear visually.
- The UI should render **collision feedback**:
  - a small hit flash on the bot
  - a floating damage number (optional)
  - a short bounce animation (tiny positional nudge) while keeping tick stepping clear

Recommended v1 wall styling:
- A thick **outer border** around the whole 3×3 arena (e.g., 6–10px).
- Clear **inner walls** between sectors (e.g., 3–6px).
- Use consistent wall color and slight shading to make boundaries obvious.

Implementation options:
- **CSS borders** on sector cells + a thicker border on the arena container.
- Or an **SVG overlay** that draws walls (more control for future doors/hazards).

Data-driven note (recommended):
- Even if walls start as a simple fixed layout, the UI should consume a wall layout representation from the ruleset/replay so:
  - the viewer matches server truth,
  - future wall patterns (doors/obstacles) don’t require UI rewrites.

---

## 4) Bot inspection panel (right)

### 4.1 Bot selector
- List BOT1..BOT4.
- Clicking a bot selects it and updates the panel.

### 4.2 Code viewer
- Displays the bot’s submitted `source_text` (line-based).
- UI highlights:
  - current `pc` line at the current tick
  - lines that are jump targets (labels)
  - optional: invalid lines flagged during validation

### 4.3 Execution trace per tick (core requirement)
To make "clear way to see what tick/instruction is in play":
- At tick `t`, show:
  - executed instruction text
  - decoded instruction (optional)
  - whether it had an effect or was a no-op (out of ammo/energy/missing module)
  - any resulting events (damage dealt, toggles, pickup)

This implies the replay format should store at least:
- `tick`
- `botId`
- `pc_before`, `pc_after`
- `instruction_text` (or instruction index)
- `result` flags (executed/no-op/error)

---

## 5) Timeline + playback

### 5.1 Controls
- Start / Pause (Start begins automatic ticking)
- Step +1 tick
- Step -1 tick (if replay supports reverse stepping by storing states or using checkpoints)
- Speed (recommended presets):
  - 0.5× / 1× / 2×

"Real-time feeling" default (recommended):
- Start at **1×** with a tick cadence that is readable (for example: **6–12 ticks/sec**).
- The UI should visually smooth movement between ticks, but state changes must remain tick-accurate.

### 5.2 Jumping to tick
Two approaches:

- **A) Full-state per tick** (simple viewer, more storage)
  - Replay stores the full state each tick.
  - UI can jump to any tick instantly.

- **B) Event log + periodic checkpoints** (recommended)
  - Store:
    - initial state
    - events per tick
    - checkpoints every N ticks (e.g., every 50)
  - To jump to tick T:
    - load nearest checkpoint
    - apply events forward

---

## 6) Data flow: simulation vs UI

### 6.1 Recommended approach
- The simulation engine runs headlessly and produces:
  - state snapshots (or checkpoints)
  - per-tick event list
- The UI is a renderer that:
  - consumes replay/state
  - renders current tick
  - highlights relevant code lines

This ensures:
- client replay viewer matches server results
- deterministic debugging is possible

### 6.2 Local test mode
- Client can run a local match using the same engine (same ruleset) and immediately show replay.
- Client-only convenience: allow a **1v1 spawn mode** for testing.
  - Example: spawn two selected bots in opposite corners (e.g., sectors 1 and 9).
  - This does not change server daily matches (which remain 4-bot).

---

## 7) UI elements that should exist (but can be phased)

- **Bot state card**: loadout slots, toggles, resources.
- **Event log**: filter by bot, tick range, event type.
- **Hover tooltips**:
  - bullets: owner, target, remaining TTL
  - powerups: type
  - bots: resources, current target, toggles

---

## 8) Open UI decisions (need your preference)

1) Arena rendering approach:
   - **A) DOM/CSS** (recommended for v1): CSS grid for sectors + absolutely positioned `<img>` sprites
   - **B) Canvas 2D** (fine if you want a single draw surface)
   - **C) WebGL (PixiJS/Three)** (overkill for v1 unless you want lots of effects)

2) Bot sprites:
   - You confirmed bots are **32×32** and users can change them.
   - Open: do you want to store only the normalized 32×32 output, or store original + normalized variants?

3) Visibility rules:
   - Does the viewer always show **full match state** (recommended for debugging), or obey bot sensing limits?

4) Replay navigation:
   - do you need step-back immediately (requires checkpoints/full snapshots), or step-forward + scrub only?
