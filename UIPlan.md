# UIPlan.md — Client UI Plan (Landing → Workshop → Match/Replay)

This document describes the **client-first UI/UX** for the bot battle game:
- players write bot code
- run local simulations
- inspect/replay what happened (deterministic ticks)

Server-side simulation is a future step; this plan keeps server integration in mind without blocking the client prototype.

It builds on:
- `BotInstructions.md` (bot language)
- `ArenaPlan.md` (sectors/zones/anchors)
- `Ruleset.md` (timing, powerups, damage)
- `ReplayViewerPlan.md` (replay UX + schema)
- `Todo.md` (locked decisions)

---

## 1) App flow + routes (client-first)

### 1.1 MVP flow

1) **Landing** (`/`)
   - v1: one button **Start Game** → `/workshop`
   - later: auth / accounts

2) **Workshop** (`/workshop`)
   - choose bot name + avatar
   - write bot script
   - choose opponents + match mode
   - click **Start Match**

3) **Match (live simulation + replay viewer)** (`/match`)
   - run the simulation locally (live)
   - render via the replay viewer UI (same UI used for saved replays)
   - save replay to local library

Optional (can be a page later, or a drawer/modal first):
- **Replay Library** (`/matches`)
- **Replay viewer deep-link** (`/replay/:replayId`)

### 1.2 URL state (refresh/debug-friendly)

Recommended query params on match/replay pages:
- `tick` (current playhead)
- `bot` (selected bot id, e.g. `BOT2`)
- `speed` (playback speed multiplier)
- `follow` (0/1, whether the viewer follows the newest tick during live run)

Example:
- `/replay/abc123?tick=120&bot=BOT2&speed=2&follow=0`

---

## 2) Screens

### 2.1 Landing (`/`)

Goal: minimal friction to start.

v1 UI (locked):
- a single primary button: **Start Game** → goes to `/workshop`

Future (planned, not v1):
- optional auth (username/password)

### 2.2 Workshop (`/workshop`)

Primary UI:
- **Bot profile**: display name + avatar (v1: colored 32×32 circle; later GIF)
- **Code editor**: multiline, line numbers, basic validation/errors
- **Instruction reference**: summarized from `BotInstructions.md`

Match setup:
- mode: `1v1` (client-only testing) or `1v1v1v1`
- opponents: choose from preset bots (and optionally view their code)
- seed (optional): random or user-specified
- tick cap (optional): default sensible value

CTA:
- **Start Match** → navigates to `/match` in a “ready” state

### 2.3 Match / Replay (`/match`, `/replay/:replayId`)

This screen is the **same UI** for:
- live simulation (local runner produces replay ticks continuously)
- viewing a saved replay

Layout regions:
1) **Arena viewport** (left/center)
2) **Inspector panel** (right)
3) **Playback bar** (bottom)
4) (optional) **Event log panel**

Live-run UX:
- start in `ready` state with a **Start** button
- when running, the viewer can **Follow Live** (auto-jumps to newest tick)
- if the user scrubs back, Follow Live automatically turns off
- provide **Jump to Live** button

---

## 3) Client state model (recommended)

Keep three layers of state:

1) **Persistent workshop state** (survives refresh)
- bot drafts: `{name, avatar, sourceText, lastEditedAt}`
- match defaults: `{mode, lastOpponents, tickCap, seedMode}`

Storage:
- localStorage for small drafts/settings
- IndexedDB if you want to store multiple bots / large text reliably

2) **Ephemeral live run state**
- run status: `idle | ready | running | finished | error`
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

## 4) Arena rendering (sectors + zones)

### 4.1 World model + scaling

From `ArenaPlan.md`:
- zone: 32×32 world units
- sector: 64×64 (2×2 zones)
- arena: 192×192 (3×3 sectors)

Render scaling:
- choose integer `scale` for crisp pixel art
- `zoneRenderPx = 32 * scale`
- `sectorRenderPx = 64 * scale`
- `arenaRenderPx = 192 * scale`

### 4.2 Grid visibility requirements

- draw **sector boundaries** as **thicker green** lines
- draw **zone boundaries** as **thinner green** lines
- optionally label sector ids 1..9

Note: the sector center anchor (`SECTOR s`, `zone=0`) is the center point of the sector (intersection of the four zones).

### 4.3 Entity rendering

- bots: 32×32 sprite + name + slot id (`BOT1..BOT4`) + small resource bars
- powerups: icons at their anchor location
- bullets/grenades/mines: simple sprites rendered above the grid
- future (not v1):
  - burst fire: multiple projectile spawns in a tick can be rendered as rapid successive muzzle flashes/trails (using ordered per-tick events)
  - variable-speed / wavy projectiles: render using replay `speed`/`trajectory` hints (and optional continuous `pos`)
  - beams/lasers: render as a line for the tick(s) they are active

Walls:
- only the **outer boundary** is a gameplay wall in v1
- outer wall should be visually distinct from the green grid

---

## 5) Inspector panel (right)

- bot list with display names + slot ids
- code viewer with current `pc` highlight
- per-tick execution result (`EXECUTED | NOOP | ERROR`) and reason (when available)

---

## 6) Playback + tick timing

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

## 7) Replay saving/loading (client)

- On match end: show **Save Replay** dialog (name + save/discard)
- Store replays in **IndexedDB** (recommended)
- Provide:
  - Replay Library list (Open/Delete)
  - Export JSON
  - Import JSON

(Details: `ReplayViewerPlan.md`.)

---

## 8) Open UI decisions

1) Rendering tech: DOM/CSS vs Canvas2D
2) Replay storage for MVP: full snapshot per tick vs event log + checkpoints
3) Whether to expose match seed/tick cap controls in Workshop v1 or hide behind an “Advanced” accordion
