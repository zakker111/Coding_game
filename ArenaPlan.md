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

- Matches run with up to **4 bots**.
- Default spawn positions for 4-bot matches (locked): corners
  - `BOT1 → 1`, `BOT2 → 3`, `BOT3 → 7`, `BOT4 → 9`

Client-only testing note:
- The client may support **1v1 testing** by spawning only 2 bots in two corners (e.g., `1` and `9`).
- This is a UI/testing feature; server daily matches remain 4-bot.

### 1.1 Client-side render sizing (v1)

You stated: "arena size for now is clamped **128×128** but might need to be bigger in future" and clarified it is **client-side**.

Recommended interpretation:
- **128×128 is the render size per sector cell** (not gameplay/world units).
- total arena render size is therefore ~ **384×384** at default scale (3×3).

The simulation remains sector-based; this is a UI sizing rule.

---

## 2) Walls (gameplay)

You confirmed walls are part of gameplay:
- bots can **bump into walls**
- on bump:
  - bot takes a **small amount of damage**
  - bot **bounces**

This requires specifying what a “wall” means in the movement model.

### 2.1 Wall layout

At minimum, walls include:
- an **outer boundary** around the 3×3 arena

Sector boundaries (the lines between the 9 sectors) are **visual boundaries** in v1, not blocking walls.
- This matches your statement that there are **no doors** (we are not modeling door openings between sectors).
- Bots can still move between sectors normally.

Future: you can introduce internal blocking walls later, but then you’ll need a data-driven wall layout and likely a door/opening mechanic.

---

## 3) Collision representation (new)

You specified:
- each bot has a **32×32 collision box**.

This affects how we define:
- bot-vs-wall bumps (which side was hit)
- bot-vs-bot bumps (which bot was hit)
- future projectile collision precision (optional)

Two interpretations are possible:

- **A) Sector-first (logical), collision-box used for UI + tie-break precision**
  - bots still move sector-to-sector
  - the “collision box” primarily defines UI footprint and can be used for more precise hit testing later

- **B) Continuous positions (physical), collision-box used for real collisions**
  - bots have continuous `(x,y)` positions
  - the 32×32 box is used for true wall/bot collisions and bounce resolution

---

## 4) Movement model options (needs a decision)

Because our bot language currently uses sector-level commands (`MOVE UP`, `MOVE_TO_SECTOR`, etc.), there are two compatible ways to interpret wall bumps.

### Option A — Sector-only movement with “bump” penalties (smallest change)

- Bots exist in exactly one sector at a time.
- A movement instruction attempts a sector transition.
- If a move is blocked by a wall (outer boundary or an internal wall that blocks passage):
  - the bot stays in the same sector
  - bot takes `wall_bump_damage`
  - record a deterministic event `WALL_BUMP`
  - “bounce” is represented visually as a small nudge in the UI

Pros:
- preserves the current deterministic sector-based simulation
- easy to debug and replay

Cons:
- bounce is mostly visual; there is no true physical reflection

### Option B — Continuous positions with true bounce (bigger change)

- Bots have `(x,y)` positions and velocity/heading inside the arena.
- Movement instructions affect velocity/heading.
- Walls are geometric boundaries; collision reflects velocity.
- Bump damage applies on collision.

Pros:
- real bounce behavior
- richer movement

Cons:
- requires a new physics-ish layer (more complexity)
- determinism across environments requires careful integer math or fixed-point

---

## 5) Recommended next step

Before we finalize walls and movement, we should choose **Option A vs Option B**.

Your recent requirement (“each bot has a 32×32 collision box” + wall bumps with bounce direction) is compatible with either option, but it pushes us toward one of these v1 choices:

- **If you want bounce to be mostly a gameplay penalty** (damage + feedback), with simple deterministic rules:
  - choose **Option A (sector-only)**
  - interpret `BUMPED_WALL_DIR(LEFT)` as "the bot attempted to move LEFT but hit a blocking wall"

- **If you want true physical bounce** (position reflect) and collisions based on the 32×32 box:
  - choose **Option B (continuous positions)**
  - use integer/fixed-point coordinates for determinism

---

## 6) Open parameters (regardless of option)

- `wall_bump_damage` (small integer)
- **Bullets vs walls (locked):** bullets **stop at walls**.
  - still to define: do they disappear immediately, or remain as a stuck entity for 1+ ticks?
- Doors:
  - **Locked:** there are **no doors**.
- Sector boundaries:
  - **Locked (v1):** sector boundaries are **not blocking walls**; only the outer boundary is a wall.
  - implication: bump damage only occurs when trying to move outside the 3×3 arena.
  - implication: bullets stop at the outer boundary (and any future internal walls, if added).



