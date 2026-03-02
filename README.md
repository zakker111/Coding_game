# Coding Game (spec-first)

A competitive programming/bot-fighting game where you write a tiny script to control your bot in a deterministic arena.

This repo currently contains the **design/spec in Markdown**. Implementation comes next.

## What the game is (v1)

- **4 bots per match** (`BOT1..BOT4`)
- **Deterministic tick simulation**: `ticksPerSecond = 1` (so **1 tick = 1 simulated second**)
- Each bot executes **exactly 1 instruction per tick** in a small DSL (with beginner-friendly aliases like `TARGET_CLOSEST`, `MOVE_TO_ZONE`, `IN_ZONE`, etc.; these are intended to normalize to a small canonical core at parse/compile time and do not affect determinism)
- Arena is a **3×3 grid of sectors** (1–9). Each sector has **4 zones** (2×2). Movement is **anchor-based** (sector centers + zone centers).
- Bots equip up to **3 module slots** (slots may be empty). **More equipped slots = slower movement**.
- Powerups (`HEALTH|AMMO|ENERGY`) spawn deterministically (seeded RNG) every **10–20 ticks** and are picked up by occupying the same anchor.
- Matches are fully replayable from `(rulesetVersion, matchSeed, bot sources + loadouts)`.

## Where to look (recommended reading order)

1. `Ruleset.md` — core gameplay rules (stats, speed model, damage/kill credit, powerups)
2. `BotInstructions.md` — the bot language
3. `ArenaPlan.md` — arena topology + anchors + movement model
4. `ReplayViewerPlan.md` — replay schema + viewer UX
5. `ServerSimulationPlan.md` / `ServerPlan.md` — deterministic server runner + storage/API

Supporting docs:
- `examples/bot1.md` — sample beginner-friendly combat bots (BULLET/SAW + SHIELD)
- `CombatPlan.md` — weapons/projectiles planning
- `UIPlan.md` — client UI layout + rendering requirements
- `DailyCompetition.md` — daily/season competition format
- `ServerTechStack.md` — recommended backend stack
- `Todo.md`, `Bugs.md`, `Versions.md` — tracking and versioning
