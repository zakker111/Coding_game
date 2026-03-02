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
- **sector boundaries** (inner walls) between adjacent sectors

Open: whether sector boundaries are always open for movement (like rooms connected by doors), or fully blocked.

---

## 3) Movement model options (needs a decision)

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

## 4) Recommended next step

Before we finalize walls and movement, we should choose **Option A vs Option B**.

Given the current language + 9-sector design, Option A is the consistent v1 choice; Option B is a later expansion.

---

## 5) Open parameters (regardless of option)

- `wall_bump_damage` (small integer)
- Do bullets collide with walls? (stop/bounce/pass-through)
- Are internal sector boundaries always passable, or do some walls block passage?
- If internal walls can block passage, how are “doors” represented?

