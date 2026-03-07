# Versions

This project follows **Semantic Versioning** (SemVer): `MAJOR.MINOR.PATCH`.

- **MAJOR**: breaking changes to bot APIs, replay formats, save formats, or public interfaces.
- **MINOR**: new features that are backwards-compatible.
- **PATCH**: bug fixes and small improvements.

## Release discipline (required)

- Every deployable build (client and/or server) must have a **version string**.
  - The deployed version should be visible somewhere (UI footer/about panel) and logged on startup.
- Every merge that changes user-visible behavior or spec contracts must update `Versions.md`.
- **Bump the version before merging** (no “we’ll do it later”).
- Every release entry must include a **timestamp**.
  - Format: ISO 8601 in UTC (example: `2026-03-02T12:34:56Z`).

---

## Unreleased

### Planned (first implementation target)
- **0.1.0 (first playable implementation):** Landing (`/`) → Workshop (`/workshop`) with local deterministic simulation + replay viewer.
  - Bot visuals: placeholder circle tokens (later replaceable with avatars/images/GIFs).

### Definitions (planning)
- `rulesetVersion`: the version of **gameplay rules + deterministic simulation semantics** (SemVer).
- `dslVersion`: the version of the **bot language spec** (`BotInstructions.md`) (SemVer).
  - Open decision: DSL may either be versioned separately (`dslVersion`) or treated as part of `rulesetVersion` (see `BotModelPlan.md`).

Naming convention note:
- Docs/replay/client JSON examples tend to use `camelCase` (e.g. `rulesetVersion`).
- Server DB fields tend to use `snake_case` (e.g. `ruleset_version`).

---

## 0.0.4 — 2026-03-06T00:00:00Z

### Changed
- Example bot docs updated for variety and to ensure all example bots move:
  - `examples/bot1.md` is now **Zone Patrol Shooter** (zone patrol loop + shooting).
  - `examples/bot2.md` updated to demonstrate explicit `BOT_ALIVE(...)` + `SET_TARGET` targeting.
  - `examples/bot3.md` updated to demonstrate powerup goal selection + brief `WAIT` commitment.
  - `examples/bot4.md` updated to demonstrate toggle modules + timers.

### Added
- Workshop planning now includes server interactions:
  - **Save to server**, **Load from server**, and **Run on Server** (`UIPlan.md`).
- Server planning expanded to support the above:
  - optional `BotVersion` history to support “load older saved code” (`ServerPlan.md`).
  - sandbox matches via `POST /api/simulations` (`ServerPlan.md`, `ServerSimulationPlan.md`).

## 0.0.3 — 2026-03-04T00:00:00Z

### Added
- Workshop starter template: `examples/bot0.md` ("Powerup Seeker").
- Workshop UI layout spec updates:
  - top bot selector (choose 1 of 3 server-stored bots for `BOT1`)
  - right-side instruction reference/help panel alongside bot inspector
  - bottom equipment/loadout selector (v1: local-preview only)

### Changed
- Server planning simplified for v1 bot persistence:
  - server stores `{owner_username, bot_name, source_text}` (plus `source_hash` for determinism)
  - server ensures each user has exactly **3 bots** (auto-created from the starter template when missing)
  - server-run matches use a fixed default loadout (`SLOT1=BULLET`) so simulation can run without storing per-bot loadouts
- Server API plan expanded to support replay lookup by bot:
  - `GET /api/matches?botId=...` (and related filters)
- Replay viewer schema clarified:
  - replay header `loadout` is optional (viewers may assume a server default if omitted)

### Fixed
- Cross-doc consistency between `UIPlan.md`, `ServerPlan.md`, `BotModelPlan.md`, and `ReplayViewerPlan.md` for bot selection and replay lookup.

## 0.0.2 — 2026-03-02T00:00:00Z

### Added
- Project documentation scaffolding: `Prompt.md`, `Versions.md`, `Bugs.md`, `Todo.md`.
- Bot identity/version planning: `BotModelPlan.md` (future-proof built-ins → user-submitted bots).
- New rules documentation for v1 bot speed model (`speedUnitsPerTick` reduced by equipped slot count).
- Beginner-friendly zone convenience in the bot language:
  - `MOVE_TO_ZONE <ZONE>` / `SET_MOVE_TO_ZONE <ZONE>`
  - `IN_ZONE(<ZONE>)`
- Readability-only instruction aliases in the bot language:
  - `TARGET_CLOSEST` (aliases: `TARGET_CLOSEST_BOT`, `TARGET_NEAREST`)
  - `TARGET_WEAKEST` (alias of `TARGET_LOWEST_HEALTH`)
  - `MOVE_TO_WALL UP|DOWN|LEFT|RIGHT` / `DIST_TO_WALL(UP|DOWN|LEFT|RIGHT)` (aliases of `MOVE_TO_ARENA_EDGE UP|DOWN|LEFT|RIGHT` / `DIST_TO_ARENA_EDGE(UP|DOWN|LEFT|RIGHT)`)
  - `TARGET_CLOSEST_POWERUP <TYPE>` / `MOVE_TO_CLOSEST_POWERUP <TYPE>`
  - `FIRE_SLOT1|2|3 <TARGET>` (alias of `USE_SLOT1|2|3 <TARGET>`)
  - `FIRE_TARGET <SLOT>` convenience (uses the current target bot id)
- New arena visual spec: `ArenaVisualPlan.md` (workshop arena preview rendering + scaling + overlays).
- New sample scripts:
  - `examples/bot1.md` (Zone Patrol Shooter)
  - `examples/bot2.md` (Chaser Shooter)
  - `examples/bot3.md` (Corner Bunker)
  - `examples/bot4.md` (Saw Rusher)

### Changed
- Loadout rules: slots may be empty; at most one weapon equipped (v1: `BULLET` or `SAW`).
- Gameplay timing locked in docs: `ticksPerSecond = 1` and powerup spawn interval is 10–20 seconds.
- UI plan updated: v1 is **Landing (`/`) → Workshop (`/workshop`)**; the workshop includes the editor, live local preview, replay controls, and 3 built-in opponent bots with viewable code.
- Arena visuals updated: v1 bots are rendered as **circle tokens** (placeholder) sized to avoid overlap between sector-center and zone-center anchors.
- Bot appearance planning added: bots have presentation-only **`appearance`** metadata (v1 color; future image/GIF), snapshotted into the replay header.
- Replay schema updated: replay header `bots[]` includes `appearance` (presentation-only; must not affect determinism) with a future-proof reference shape for assets.
- Docs authoring rule: keep a stable core language and add “sugar” only as explicit aliases.
- `BotInstructions.md` clarified **why aliases exist**, why they’re deterministic, and when to use the **target register** vs **inline selectors**.
- `BotInstructions.md` clarified source preprocessing for v1: `;` comments + blank lines ignored; `LABEL` is compile-time only; `pc` is indexed into the compiled executable instruction list (with an optional `pc -> sourceLine` mapping for UI).
- `BotInstructions.md` added an **optional, non-semantic UI metadata convention** via comments:
  - `;@name ...`
  - `;@appearance ...` (v1: `#RRGGBB`; future: asset/hash refs)
- Daily competition docs clarified the deterministic end-of-run rule:
  - if fewer than 4 eligible bots remain, **stop scheduling** and end the run.

### Fixed
- Documentation formatting/copy issues across planning docs.

## 0.0.1

- Initial repository created (`README.md`).
