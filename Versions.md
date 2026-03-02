# Versions

This project follows **Semantic Versioning** (SemVer): `MAJOR.MINOR.PATCH`.

- **MAJOR**: breaking changes to bot APIs, replay formats, save formats, or public interfaces.
- **MINOR**: new features that are backwards-compatible.
- **PATCH**: bug fixes and small improvements.

## Unreleased

### Added
- Project documentation scaffolding: `Prompt.md`, `Versions.md`, `Bugs.md`, `Todo.md`.
- New rules documentation for v1 bot speed model (movement cooldown affected by equipped slot count).
- Beginner-friendly zone convenience in the bot language:
  - `MOVE_TO_ZONE <ZONE>` / `SET_MOVE_TO_ZONE <ZONE>`
  - `IN_ZONE(<ZONE>)`
- Readability-only instruction aliases in the bot language:
  - `TARGET_CLOSEST` (aliases: `TARGET_CLOSEST_BOT`, `TARGET_NEAREST`)
  - `TARGET_WEAKEST` (alias of `TARGET_LOWEST_HEALTH`)
  - `MOVE_TO_WALL <DIR>` / `DIST_TO_WALL(<DIR>)` (aliases of `MOVE_TO_ARENA_EDGE <DIR>` / `DIST_TO_ARENA_EDGE(<DIR>)`)
  - `TARGET_CLOSEST_POWERUP <TYPE>` / `MOVE_TO_CLOSEST_POWERUP <TYPE>`
  - `FIRE_SLOT1|2|3 <TARGET>` (alias of `USE_SLOT1|2|3 <TARGET>`)
  - `FIRE_TARGET <SLOT>` convenience (uses the current target bot id)
- New arena visual spec: `ArenaVisualPlan.md` (workshop arena preview rendering + scaling + overlays).
- New sample scripts:
  - `examples/bot1.md` (combat bot variants)
  - `examples/bot2.md` (Chaser Shooter)
  - `examples/bot3.md` (Corner Bunker)
  - `examples/bot4.md` (Saw Rusher)

### Changed
- Loadout rules: slots may be empty; at most one weapon equipped (v1: `BULLET` or `SAW`).
- Gameplay timing locked in docs: `ticksPerSecond = 1` and powerup spawn interval is 10–20 seconds.
- UI plan updated: v1 is **Landing (`/`) → Workshop (`/workshop`)**; the workshop includes the editor, live local preview, replay controls, and 3 built-in opponent bots with viewable code.
- Docs authoring rule: keep a stable core language and add “sugar” only as explicit aliases.
- `BotInstructions.md` clarified **why aliases exist**, why they’re deterministic, and when to use the **target register** vs **inline selectors**.
- `BotInstructions.md` clarified source preprocessing for v1: `;` comments + blank lines ignored; `LABEL` is compile-time only; `pc` is indexed into the compiled executable instruction list (with an optional `pc -> sourceLine` mapping for UI).
- Planning trackers updated (`Todo.md`): added v1 client UI plan tasks and new built-in opponents.

### Fixed
- Documentation formatting/copy issues across planning docs.

## 0.0.1

- Initial repository created (`README.md`).
