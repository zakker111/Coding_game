# ArenaPlan.md — Arena, Walls, and Movement (Design Draft)

This document captures the current plan for the arena and wall interactions.

It is aligned with:
- `Todo.md`
- `BotInstructions.md`
- `DailyCompetition.md`

---

## 1) Arena topology (locked)

- The arena is a **3×3 grid of sectors** numbered:

  - `1 2 3`
  - `4 5 6`
  - `7 8 9`

- Standard match format is **4 bots** (`BOT1..BOT4`).
- Default spawn positions for 4-bot matches (locked): arena corners
  - `BOT1 → SECTOR 1 ZONE 1` (top-left)
  - `BOT2 → SECTOR 3 ZONE 2` (top-right)
  - `BOT3 → SECTOR 7 ZONE 3` (bottom-left)
  - `BOT4 → SECTOR 9 ZONE 4` (bottom-right)

Client-only testing note (optional, post-v1):
- The client may support **1v1 testing** by spawning only 2 bots in two corners (e.g., `SECTOR 1 ZONE 1` and `SECTOR 9 ZONE 4`).
- This is a UI/testing feature; server daily matches remain 4-bot.

### 1.1 World units: sectors + zones (locked)

- Each **sector** contains **zones `1..4`** arranged as a 2×2 grid:
  - `1 2`
  - `3 4`
- Each **zone** is **32×32 world units**.
- Each **sector** is therefore **64×64 world units**.
- The full arena is:
  - **width = 3 × 64 = 192 world units**
  - **height = 3 × 64 = 192 world units**

### 1.2 Coordinate mapping (sector/zone → world)

Assume world coordinates:
- origin `(0,0)` at the **top-left** of the arena
- `+x` to the right, `+y` downward

Sector mapping:
- `sectorRow = floor((sectorId - 1) / 3)`
- `sectorCol = (sectorId - 1) % 3`
- `sectorOrigin = (sectorCol * 64, sectorRow * 64)`

Zone mapping inside a sector:
- zone `1` → offset `(0, 0)`
- zone `2` → offset `(32, 0)`
- zone `3` → offset `(0, 32)`
- zone `4` → offset `(32, 32)`

Therefore:
- `zoneOrigin = sectorOrigin + zoneOffset`

### 1.3 Anchor points (sector center + zone centers)

We treat a "location" used by bot scripts and powerups as one of these deterministic anchors:

- **Sector center** (`SECTOR s`):
  - `sectorCenter = sectorOrigin + (32, 32)`

- **Zone center** (`SECTOR s ZONE z`):
  - `zoneCenter = zoneOrigin + (16, 16)`

This aligns with a notional **32×32 bot collision box** (matching zone size), but v1 collision/occupancy is **anchor-based** (see §3).

### 1.4 Powerup spawn anchors

Powerups can spawn at deterministic location anchors:
- **sector center**: `SECTOR <SECTOR>`
- **zone center**: `SECTOR <SECTOR> ZONE <ZONE>`

So each sector has **5** possible powerup locations (center + 4 zones), and the arena has **45**.

The **spawn timers/logic** are specified in `Ruleset.md`.

### 1.5 Client-side render sizing

The UI may scale world units to screen pixels.

Recommended v1 approach:
- Treat the world as **192×192 units**.
- Choose a `scale` factor for rendering (e.g., 2×, 3×, 4×) based on available screen size.
- Derived sizes:
  - `zoneRenderPx = 32 * scale`
  - `sectorRenderPx = 64 * scale`
  - `arenaRenderPx = 192 * scale`

If you still want a clamp, apply it to **`sectorRenderPx`** or **`arenaRenderPx`** rather than redefining world units.

---

## 2) Walls (gameplay)

You confirmed walls are part of gameplay:
- bots can **bump into walls**
- on bump:
  - bot takes a **small amount of damage**
  - bot **bounces**

### 2.1 Wall layout

At minimum, walls include:
- an **outer boundary** around the 3×3 arena

Sector boundaries and zone boundaries are **visual grid lines** in v1, not blocking walls.
- This matches the "no doors" model (we are not modeling door openings).

Future:
- you can introduce internal blocking walls later, but then you’ll need a data-driven wall layout and likely a door/opening mechanic.

---

## 3) Collision representation (zone-aware)

Locked geometry:
- each bot has a **32×32 collision box**
- each **zone** is **32×32**

Recommended v1 semantics:
- a bot’s authoritative location is a deterministic anchor (`SECTOR s` or `SECTOR s ZONE z`)
- collision/occupancy in v1 is **anchor-based**:
  - two bots cannot occupy the same anchor
  - the 32×32 collision box is primarily for **visuals/intuition** (until a future physics migration)

---

## 4) Movement model (locked for v1)

v1 is locked to **Option A (discrete anchors)**.

Rationale:
- easiest determinism and debugging
- matches the bot language (move to sector/zone)
- supports a clean replay viewer

### Option A — Discrete anchors (recommended)

Bots do **discrete movement** between anchors:
- sector centers (`SECTOR s`)
- zone centers (`SECTOR s ZONE z`)

Rendering note (client/viewer): movement **must** be shown as smooth while playing by interpolating between anchors over the tick duration, but gameplay remains tick-based and discrete.

Rules:
- movement is 1 anchor-step per tick (when a move occurs)
  - simulation is tick-based; the authoritative location changes only on tick boundaries
  - the client/replay viewer renders movement smoothly by interpolating from `fromLoc` → `toLoc` within the tick (presentation-only)
- collisions are grid-like:
  - attempting to step outside the outer boundary → wall bump (no movement + bump damage)
  - attempting to step into an occupied anchor → bot bump (no movement + bump event)

Anchor adjacency (v1; defines distance + pathfinding):
- Each **sector center** connects to its 4 **zone centers** (`ZONE 1..4`) within that sector.
- Zone centers connect across sector borders (orthogonal neighbors):
  - Right edge: `(sector s, zone 2)` connects to `(sector s+1, zone 1)` if `s` is not in column 3.
  - Right edge: `(sector s, zone 4)` connects to `(sector s+1, zone 3)` if `s` is not in column 3.
  - Left edge is symmetric.
  - Bottom edge: `(sector s, zone 3)` connects to `(sector s+3, zone 1)` if `s` is not in row 3.
  - Bottom edge: `(sector s, zone 4)` connects to `(sector s+3, zone 2)` if `s` is not in row 3.
  - Top edge is symmetric.

Directional moves (`MOVE <DIR>`) select among adjacent anchors whose destination is in that direction (destination has smaller `y` for `UP`, larger `y` for `DOWN`, smaller `x` for `LEFT`, larger `x` for `RIGHT`), then apply deterministic tie-breakers.

Pros:
- deterministic, easy to replay/debug
- matches the language (“move to sector/zone”) without introducing physics

Cons:
- bounce is mostly visual feedback

### Option B — Continuous positions (true physics)

- bots have continuous `(x,y)` positions
- movement is velocity/heading based
- walls reflect velocity
- collision uses the 32×32 box against geometry

Pros:
- richer movement and true bounce

Cons:
- significantly more complex
- determinism requires strict integer/fixed-point rules

---

## 5) Recommended next step

Given the current design goals (determinism + easy replays), prefer:
- **Option A (discrete anchors)**

If later you want physics-style bounce and more granular positioning, you can migrate to Option B (but it will be a major ruleset/version change).

---

## 6) Open parameters (regardless of option)

- `wallBumpDamage` (small integer; ruleset parameter, see `Ruleset.md`)
- **Bullets vs walls (locked v1):** bullets **stop at walls** and are **removed immediately** (emit replay event `BULLET_DESPAWN reason=WALL`).
- Doors:
  - **Locked:** there are **no doors**.



