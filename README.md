# Coding Game (spec-first)

A competitive programming/bot-fighting game where you write a tiny script to control your bot in a deterministic arena.

This repo currently contains the **design/spec in Markdown**. Implementation comes next.

## What the game is (v1)

- **4 bots per match** (`BOT1..BOT4`)
- **Deterministic tick simulation**: `ticksPerSecond = 1` (so **1 tick = 1 simulated second**)
  - Rendering/playback **must** be smooth while playing: interpolate bot/projectile positions within each tick (viewer-only; does not affect gameplay). When paused/scrubbing/stepping, render the exact tick snapshot (no intra-tick interpolation).
- Each bot executes **exactly 1 instruction per tick** in a small DSL (with beginner-friendly aliases like `TARGET_CLOSEST`, `MOVE_TO_ZONE`, `IN_ZONE`, etc.; these are intended to normalize to a small canonical core at parse/compile time and do not affect determinism)
- Arena is a **3×3 grid of sectors** (1–9). Each sector has **4 zones** (2×2). Bots have continuous world positions (`pos = {x,y}` in a 192×192 arena); sector/zone are UI/rules regions derived from `pos`.
- Bots equip up to **3 module slots** (slots may be empty). **More equipped slots = slower movement**.
- Powerups (`HEALTH|AMMO|ENERGY`) may remain anchored at deterministic centers (seeded RNG) every **10–20 ticks** and are picked up when a bot’s position overlaps the pickup region around that anchor.
- Matches end by rules: last bot alive, or `tickCap`, or `STALEMATE` (no bot-vs-bot damage for a configured window) — see `Ruleset.md`.
- Matches are fully replayable from `(rulesetVersion, matchSeed, bot sources + loadouts)`.

## Where to look (recommended reading order)

1. `Ruleset.md` — core gameplay rules (stats, speed model, damage/kill credit, powerups)
2. `BotInstructions.md` — the bot language
3. `ArenaPlan.md` — arena topology + sectors/zones + movement model
4. `UIPlan.md` + `ArenaVisualPlan.md` — client workshop UX and exact arena rendering spec
5. `ReplayViewerPlan.md` — replay schema + viewer UX
6. `BotModelPlan.md` — bot identity/version planning (built-ins → user-submitted bots)
7. `ServerSimulationPlan.md` / `ServerPlan.md` — deterministic server runner + storage/API

Supporting docs:
- `examples/bot0.md` — bot0 starter (Workshop starter template): Powerup Seeker
- `examples/bot1.md` — bot1: Zone Patrol Shooter
- `examples/bot2.md` — bot2: Chaser Shooter
- `examples/bot3.md` — bot3: Corner Bunker
- `examples/bot4.md` — bot4: Saw Rusher
- `CombatPlan.md` — weapons/projectiles planning
- `FutureProofing.md` / `BotLanguageDesign.md` — extensibility direction (modules, targeting, future DSL)
- `DailyCompetition.md` — daily/season competition format
- `ServerTechStack.md` — recommended backend stack
- `Todo.md`, `Bugs.md`, `Versions.md` — tracking and versioning
