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
- New sample scripts: `examples/bot1.md` (combat bot variants).

### Changed
- Loadout rules: slots may be empty; at most one weapon equipped (v1: `BULLET` or `SAW`).
- Gameplay timing locked in docs: `ticksPerSecond = 1` and powerup spawn interval is 10–20 seconds.
- UI plan clarified: Landing page is a single **Start Game** button for v1 (auth planned later).
- Docs authoring rule: keep a stable core language and add “sugar” only as explicit aliases.

### Fixed
- Documentation formatting/copy issues across planning docs.

## 0.0.1

- Initial repository created (`README.md`).
