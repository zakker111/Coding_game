# ArenaVisualPlan.md — Arena Preview Visual/UX Spec (Workshop)

This document specifies **how the arena preview should look and behave** in the Workshop (grid rendering, world→pixel scaling, entity visuals, overlays, and in-arena info).

It is aligned with:
- `ArenaPlan.md` (world units, sectors/zones, anchors)
- `UIPlan.md` (green grid requirements)
- `ReplayViewerPlan.md` (events + location encoding)
- `ZonePowerupPlan.md` (powerups, anchors)

---

## 1) Goals (v1)

- **Readable at a glance**: players immediately see where bots are, what they’re doing, and who is winning.
- **Deterministic + debug-friendly**: visuals are a pure view over replay state/events.
- **Tick-based but smooth**: simulation state updates only on tick boundaries, but playback can animate motion within a tick for readability.
- **Crisp rendering**: integer scaling for pixel-art style (no blurry grid/sprites).
- **Low clutter by default**: show essentials always; show details on hover/selection.

Non-goals (v1): cinematic effects, physics-grade interpolation/easing, full minimap.

---

## 2) World model → pixels (authoritative mapping)

### 2.1 World units (from `ArenaPlan.md`)

- Zone size: **32×32 world units**
- Sector size: **64×64 world units** (2×2 zones)
- Arena size: **192×192 world units** (3×3 sectors)

### 2.2 Render scale

Use an integer `S` (“pixels per world unit”) for crisp scaling.

- `arenaRenderPx = 192 * S`
- `sectorRenderPx = 64 * S`
- `zoneRenderPx = 32 * S`

### 2.3 Location anchors → world coordinates

Replay locations are:
- `loc = { sector: 1..9, zone: 0..4 }` (per `ReplayViewerPlan.md`)
  - `zone=0` => sector center
  - `zone=1..4` => zone center

World coordinate mapping (origin `(0,0)` at arena top-left, `+x` right, `+y` down):

- `sectorRow = floor((sectorId - 1) / 3)`
- `sectorCol = (sectorId - 1) % 3`
- `sectorOrigin = (sectorCol * 64, sectorRow * 64)`
- `sectorCenter = sectorOrigin + (32, 32)`

Zone offsets inside a sector:
- `zone 1 => (0, 0)`
- `zone 2 => (32, 0)`
- `zone 3 => (0, 32)`
- `zone 4 => (32, 32)`

Zone center:
- `zoneCenter = sectorOrigin + zoneOffset + (16, 16)`

### 2.4 World coordinates → screen pixels

Let `worldToPx(x) = round(x * S)` and same for `y`.

- Any entity rendered at a *center* position `(wx, wy)` should be placed at:
  - `px = worldToPx(wx)`
  - `py = worldToPx(wy)`

Bots have a notional **32×32 world-unit collision box** in the rules (matching zone size), but v1 collision/occupancy is **anchor-based** (see `ArenaPlan.md`).

### Bot visual sizing (v1 placeholder: circle tokens)

In v1, bots are rendered as **filled circles**, centered on their anchor location.

Why not 32×32 world units?
- Bots can occupy both zone centers *and* sector centers (`zone=0`).
- Inside a sector, the distance from the sector center `(32,32)` to any zone center `(16,16)` / `(48,16)` / `(16,48)` / `(48,48)` is:
  - `dWorld = sqrt(16^2 + 16^2) = 16*sqrt(2) ≈ 22.63`
- To avoid visual overlap for “sector-center bot vs zone-center bot” in the same sector, we choose a smaller token.

**Chosen size (v1):**
- `botDiameterWorld = 16`
- `botRadiusWorld = 8`

Pixel sizing at render scale `S`:
- `botDiameterPx = botDiameterWorld * S = 16*S`
  - at default `S=2` → **32px diameter**
- `botRadiusPx = 8*S`

Placement:
- `botCenterPx = (round(wx*S), round(wy*S))`
- draw the circle at `botCenterPx` with radius `botRadiusPx`

This is purely visual; gameplay remains anchor-based.

### 2.5 HiDPI / devicePixelRatio (recommended)

If rendering on `<canvas>`:
- Keep **CSS size** = `arenaRenderPx`.
- Set backing store size:
  - `canvas.width  = arenaRenderPx * devicePixelRatio`
  - `canvas.height = arenaRenderPx * devicePixelRatio`
- Then scale the drawing context by `devicePixelRatio`.

This keeps lines crisp while matching layout pixels.

---

## 3) Arena viewport sizing + default scales

### 3.1 Scale selection rule

Pick the **largest** scale `S` from `{1,2,3,4,5,6}` such that:

- `192 * S <= availablePx`

Where `availablePx = min(arenaContainerWidthPx, arenaContainerHeightPx)` after padding.

If the container is non-square:
- Render arena at `192*S` and **center** it (letterbox) in the container.
- Do not non-uniformly stretch.

### 3.2 Recommended scale breakpoints (based on container min-dimension)

- `availablePx >= 1152` → `S=6` (arena 1152×1152)
- `availablePx >= 960`  → `S=5` (960×960)
- `availablePx >= 768`  → `S=4` (768×768)
- `availablePx >= 576`  → `S=3` (576×576)
- `availablePx >= 384`  → `S=2` (384×384)
- else → `S=1` (192×192)

### 3.3 Recommended defaults for common *viewport widths*

Because the Workshop uses a split layout (editor + preview), the **arena container** is typically smaller than full viewport width.

Use these as defaults if you need a fixed initial guess before measuring the container:

**A) Two-column Workshop layout (preview column ≈ 45% of viewport minus gutters)**
- viewport ~1024px → preview ~440–480px → `S=2`
- viewport ~1280px → preview ~560px → `S=2` (or `S=3` only if preview is ≥ 576px)
- viewport ~1440px → preview ~620px → `S=3`
- viewport ~1920px → preview ~840–900px → `S=4`
- viewport ~2560px → preview ~1130–1200px → `S=5`

**B) Single-column (mobile / narrow) layout (arena ≈ full width)**
- viewport ~360–375px → `S=1`
- viewport ~390–430px → `S=2`
- viewport ~768px → `S=4`

v1 UX recommendation:
- expose a small **Zoom** control (e.g. `S=2/3/4/5`) but keep the auto-scale default.

---

## 4) Grid + walls rendering

### 4.1 Layers (back-to-front)

1) Background fill
2) Optional subtle zone shading
3) Zone grid lines (32-unit spacing)
4) Sector grid lines (64-unit spacing)
5) Outer wall/border
6) Labels (sector ids)

### 4.2 Colors (recommendation; can be themed)

- Background: very dark neutral (e.g. near-black)
- Zone lines: thin green with low opacity
- Sector lines: thicker green with higher opacity
- Outer wall: distinct from green (e.g. neutral gray or teal), thicker

### 4.3 Line thickness rules

Line thickness should be stable in **screen pixels** (not scaled with `S`) so the grid remains readable at both `S=2` and `S=6`.

Recommended:
- zone line width: `1px`
- sector line width: `2px`
- outer wall width: `3px` (or `4px` if `S>=4`)

Canvas crispness note:
- For odd pixel line widths (1px, 3px), draw at `x + 0.5` / `y + 0.5` to avoid blur.

### 4.4 Sector labels

- Always show sector ids `1..9` at sector centers.
- Keep labels low-contrast so they don’t compete with entities.
- Optional: show zone ids `1..4` only on hover when the cursor is within that sector.

### 4.5 Hover affordances

When hovering the arena:
- highlight the hovered **anchor cell** (zone or sector center) with a subtle outline.
- show a small tooltip: `S<sector> Z<zone>` (zone `0` for sector center).

---

## 5) Bot visuals (v1)

### 5.1 Bot body (v1 placeholder: circle tokens)

Bots are rendered as a **circle token** sized by §2.4 (`botDiameterWorld = 16`, `botRadiusWorld = 8`).

At default scale `S=2`, this is a **32×32 px** circle.

- Visual size is defined in §2.4:
  - `botDiameterWorld = 16`
  - `botRadiusWorld = 8`

Style + source of truth:
- Each bot’s fill color comes from the replay header `bots[].appearance` (see `ReplayViewerPlan.md`).
  - v1 required placeholder: `{ kind: "COLOR", color: "#RRGGBB" }`.
  - If missing, fall back to a deterministic per-slot palette (e.g., BOT1 blue, BOT2 red, BOT3 green, BOT4 yellow).
- Draw a 1–2px dark outline so tokens remain readable over the grid.
- Always render the slot id label (`BOT1..BOT4`) above the token (see §5.3).

Future (post-v1):
- If `appearance.kind = "IMAGE"` and the avatar resolves, draw the image **clipped to the same circle**; otherwise keep the v1 circle fallback.

### 5.2 Facing / direction indicator

To make shooting/movement readable:
- draw a small triangle/notch/arrow on the bot pointing in its current facing or last action direction.
- if facing is not available in v1 state, derive from:
  - last `BOT_MOVED.dir` within the current tick window, else
  - last `BULLET_SPAWN.dir`.

### 5.3 Bot id label (required)

Always show `BOT1..BOT4` above each bot.

- Use a compact, high-contrast label with a background pill.
- Keep it screen-space sized (not too large at high `S`).

### 5.4 Resource bars (required: HP/ammo/energy)

Show three compact bars above (or on) each bot:
- **HP** (0–100): green → yellow → red gradient
- **Ammo** (0–100): amber/orange
- **Energy** (0–100): cyan/blue

Rules:
- Bars should be readable without obscuring the bot.
- Recommended per-bar height: `max(2px, floor(0.6*S))` with 1px gaps.
- If screen space is tight (`S=1`), default to showing **HP only** in-arena, and show ammo/energy in the inspector + tooltip.

### 5.5 Selection + hover

- Clicking a bot selects it.
- Selected bot:
  - thick outline and subtle glow
  - keep label visible even if overlapping others
- Hovered bot:
  - thin outline
  - tooltip with exact values: `HP 72 / Ammo 40 / Energy 90`

### 5.6 Dead bots

When `BOT_DIED` occurred:
- remove the bot body from subsequent ticks
- optional: render a faint “wreck” mark for 1–2 ticks at the death location

---

## 6) Powerup visuals

Powerups spawn at anchors (sector center or zone center).

### 6.1 Icon language (v1)

Use simple, distinct icons:
- HEALTH: heart / cross
- AMMO: bullet / magazine
- ENERGY: bolt

Recommended size:
- `powerupSizePx = 10*S` to `14*S`, centered on the anchor.

### 6.2 Spawn/pickup feedback

- On `POWERUP_SPAWN`: brief scale-in or glow pulse (≤ 300ms)
- On `POWERUP_PICKUP`: small burst + fade out (≤ 300ms)

### 6.3 Tooltip

On hover:
- show type and effect (if known): e.g. `HEALTH (+20)`

---

## 7) Projectile visuals (bullets, forward-compatible)

Projectiles should be drawn from replay events (`ReplayViewerPlan.md`), not inferred.

### 7.1 Bullets

- `BULLET_SPAWN`: draw a brief muzzle flash at the owner bot + create bullet entity visual
  - spawn position rule: if replay provides `pos`, use it; otherwise use the owner bot’s location at the moment of firing
    - v1 tick loop note: instruction execution happens before movement (`ServerSimulationPlan.md`), so for tick `t` this is the bot location in `state[t-1]`.
- `BULLET_MOVE`: animate bullet from `fromSector` → `toSector` over the tick duration
  - If `pathSectors[]` exists (speed>1): animate along the path within the same tick.
- `BULLET_HIT`: hit spark on victim
- `BULLET_DESPAWN`: fade out quickly (or pop) at last position

Visual style:
- bullet body: small bright dot (2–4px depending on `S`) with a 1px trail
- optional: draw the direction as a short line segment behind the bullet

### 7.2 Tick-based interpolation (recommended)

The simulation is tick-based, but the viewer should feel smooth.

While playing (not paused), render an intra-tick progress `p ∈ [0,1]` based on real time and playback speed.

Recommended v1 policy (keeps gameplay semantics clear):
- **Positions interpolate; game state stays tick-based.**
  - Interpolate bot/projectile positions linearly from their tick-start location to their tick-end location.
  - Keep non-positional state (HP/ammo/energy, deaths, pickups) “snapped” and only update it at tick boundaries.
    - Concretely: at `p=0`, render `state[t-1]`; at `p=1`, render `state[t]`.
- When paused or scrubbing, render the tick in a stable state:
  - recommended: render at `p=1` (end-of-tick positions) so the playhead tick matches the state after events resolve.

### 7.3 Grenades / mines (if enabled later)

Keep v1-ready visual conventions:
- grenade: larger dot with a fuse ring + countdown ticks shown on hover
- mine: small disc; on armed state, show subtle blinking outline
- AoE detonation: ring(s) over affected sectors for ~250–400ms

---

## 8) Overlays and debug affordances

### 8.1 Always-on HUD (minimal)

In the arena viewport corners:
- current `tick`
- playback speed (e.g. `2×`)
- Follow Live state (if in live mode)

### 8.2 Optional overlays (toggle)

Provide a “Visual Overlays” toggle group (persisted in localStorage) for:
- **Show sector ids** (default: ON)
- **Show zone ids** (default: OFF)
- **Show resource bars** (default: ON, but auto-reduce at `S=1`)
- **Show last action** (default: ON)
  - per bot: small icon for last executed action this tick (MOVE / SHOOT / PICKUP / BUMP)
- **Show event log markers** (default: OFF)
  - small markers at locations of hits/pickups

### 8.3 Selection-driven overlays

When a bot is selected:
- highlight its current anchor cell
- highlight its last movement (a short arrow from previous anchor)
- if it fired this tick, draw a thin aim ray in the shot `dir` (purely visual; damage still comes from events)

### 8.4 Hover tooltips

- Hover anchor: show location `S<sector> Z<zone>`.
- Hover bot: show bot id + exact HP/ammo/energy.
- Hover powerup: show type.

Tooltips should never obscure the hovered object completely; offset them slightly.

---

## 9) Implementation notes (recommended approach)

### 9.1 Rendering technology

Canvas2D is recommended for v1 because:
- clean layering
- easy pixel alignment
- cheap animation

DOM/SVG can work, but tends to be harder for projectile animation and crisp grid lines at multiple scales.

### 9.2 Z-order summary

Back-to-front draw order:
- background
- zone shading
- grid (zone then sector)
- outer wall
- sector labels
- powerups
- projectiles
- bots
- transient effects (hit sparks, pickup bursts)
- selection/hover outlines
- HUD/tooltips

### 9.3 Asset strategy (v1)

v1 can start with pure vector/Canvas primitives.
If you introduce pixel sprites later:
- keep them authored at **32×32** and scale by integer `S`.

---
