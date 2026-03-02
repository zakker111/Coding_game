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
- Bots are represented as **same-size GIF sprites**.
- Animation is purely visual; the simulation remains headless and deterministic.

### 3.2 Arena model on screen
- 9 sectors arranged as:
  - `1 2 3`
  - `4 5 6`
  - `7 8 9`
- Corner spawns (locked for daily matches): sectors `1, 3, 7, 9`.

### 3.3 Entity overlays
- **Bots**: sprite + name + small resource bars (health/ammo/energy).
- **Bullets**: simple dot/line sprite traveling sector-to-sector per tick.
- **Powerups**: icons for HEALTH/AMMO/ENERGY.
- **Status indicators**: saw/shield on states (small icons).

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
- Play / Pause
- Step +1 tick
- Step -1 tick (if replay supports reverse stepping by storing states or using checkpoints)
- Speed: 0.25× / 0.5× / 1× / 2× / 4×

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

1) Rendering tech:
   - Canvas 2D vs SVG vs WebGL (PixiJS/Three)
2) Bot sprites:
   - Are GIFs user-uploaded per bot, or fixed assets?
3) Visibility rules:
   - Does UI show full state (all bots/bullets/powerups) always, or match bot sensing rules?
4) Reverse stepping:
   - do you need step-back immediately (requires checkpoints/full snapshots)?
