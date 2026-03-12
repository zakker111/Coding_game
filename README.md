# Coding Game (Nowt)

A competitive programming/bot-fighting game where you write a tiny script to control your bot in a deterministic arena.

This repo is **spec-first**, and includes a runnable prototype:

- `packages/engine`: bot DSL compiler/VM + deterministic simulation + replay generation
- `apps/web`: Vite + React workshop that runs local matches in a Web Worker and renders the replay
- `packages/replay`: legacy replay schema + sample generator (not authoritative engine behavior)

## Running the prototype

Prereqs: Node.js + pnpm.

```bash
pnpm install
pnpm dev
```

Then open the printed URL (usually http://localhost:5173).

- `/` is the landing page
- `/workshop` runs a deterministic local match and lets you inspect the replay (play/pause/step/scrub)

To run tests:

```bash
pnpm test          # apps/web
pnpm -C packages/engine test
```

## QA (Phase 1)

Phase 1 QA is intended to be fully reproducible in CI and locally.

```bash
pnpm qa:phase1
```

This runs workspace-wide tests + builds (including `apps/web`).

Note: `site/` is a legacy prototype and is intentionally excluded from the pnpm workspace + CI.

## Deploying (static)

Build the client-only app:

```bash
pnpm build
```

Then deploy the generated static files from:

- `apps/web/dist`

Notes:
- `apps/web/public/404.html` + the script in `apps/web/index.html` provide SPA deep-link support on hosts like GitHub Pages.
- `apps/web/public/_redirects` provides SPA rewrites on Netlify/Cloudflare Pages.

## What the game is (v1)

- **4 bots per match** (`BOT1..BOT4`)
- **Deterministic tick simulation**: `ticksPerSecond = 1` (so **1 tick = 1 simulated second**)
  - Rendering/playback **must** be smooth while playing: interpolate bot/projectile positions within each tick (viewer-only; does not affect gameplay). When paused/scrubbing/stepping, render the exact tick snapshot (no intra-tick interpolation).
- Each bot executes **exactly 1 instruction per tick** in a small DSL (with beginner-friendly aliases like `TARGET_CLOSEST`, `MOVE_TO_ZONE`, `IN_ZONE`, etc.; these are intended to normalize to a small canonical core at parse/compile time and do not affect determinism)
- Arena is a **3×3 grid of sectors** (1–9). Each sector has **4 zones** (2×2). Bots have continuous world positions (`pos = {x,y}` in a 192×192 arena) and a **16×16 hitbox** (centered at `pos`); sector/zone are UI/rules regions derived from `pos`.
  - Bots do **not** move anchor-to-anchor or snap to sector/zone centers; only powerups use anchor locations for compact encoding.
- Module/loadout note (rulesetVersion `0.1.0`): explicit 3-slot loadouts are not implemented yet; the engine infers whether a bot has `SAW`/`SHIELD` by scanning the bot source text.
- Powerups (`HEALTH|AMMO|ENERGY`) spawn at deterministic anchors (seeded RNG) every **10–20 ticks** and are picked up when a bot’s AABB overlaps the anchor point.
- Matches end by rules: last bot alive, or `tickCap`, or `STALEMATE` (no bot-vs-bot damage for a configured window) — see `Ruleset.md`.
- Matches are fully replayable from `(rulesetVersion, matchSeed, bot source snapshots)` (and future: explicit loadouts).

## Where to look (recommended reading order)

1. `Ruleset.md` — core gameplay rules (stats, speed model, damage/kill credit, powerups)
2. `BotInstructions.md` — the bot language
3. `ArenaPlan.md` — arena topology + sectors/zones + movement model
4. `UIPlan.md` + `ArenaVisualPlan.md` — client workshop UX and exact arena rendering spec
5. `ReplayViewerPlan.md` — replay schema + viewer UX
6. `BotModelPlan.md` — bot identity/version planning (built-ins → user-submitted bots)
7. `ServerSimulationPlan.md` / `ServerPlan.md` — deterministic server runner + storage/API

Supporting docs:

- `examples/bot0.md` — bot0 starter (Workshop starter template): Aggressive Skirmisher
- `examples/bot1.md` — bot1: Zone Patrol Shooter
- `examples/bot2.md` — bot2: Chaser Shooter
- `examples/bot3.md` — bot3: Corner Bunker
- `examples/bot4.md` — bot4: Saw Rusher
- `examples/bot5.md` — bot5: Burst Hunter
- `examples/bot6.md` — bot6: Energy Saw Skirmisher
- `CombatPlan.md` — weapons/projectiles planning
- `FutureProofing.md` / `BotLanguageDesign.md` — extensibility direction (modules, targeting, future DSL)
- `DailyCompetition.md` — daily/season competition format
- `ServerTechStack.md` — recommended backend stack
- `Todo.md`, `Bugs.md`, `Versions.md` — tracking and versioning