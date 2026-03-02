# Versions

This project follows **Semantic Versioning** (SemVer): `MAJOR.MINOR.PATCH`.

- **MAJOR**: breaking changes to bot APIs, replay formats, save formats, or public interfaces.
- **MINOR**: new features that are backwards-compatible.
- **PATCH**: bug fixes and small improvements.

## Unreleased

### Added
- Project documentation scaffolding: `Prompt.md`, `Versions.md`, `Bugs.md`, `Todo.md`.
- New rules documentation for v1 bot speed model (movement cooldown affected by equipped slot count).
- Future-proof combat planning for advanced weapons: burst MG/SMG, fast rifle rounds, deterministic wavy projectiles, and lasers/beams that can ignore shields.
- Replay viewer schema forward-compatibility notes for burst sequences, variable-speed/curved projectiles, and beams.

### Changed
- Loadout rules: slots may be empty; at most one weapon equipped (v1: `BULLET` or `SAW`).
- Gameplay timing locked in docs: `ticksPerSecond = 1` and powerup spawn interval is 10–20 seconds.
- UI plan clarified/expanded (arena grid rendering + replay viewer layout).
- Future-proofing docs expanded: standardized module capability flags (`delivery`, shield interaction flags), standardized target kinds (`BOT|LOCATION|DIRECTION|NONE`), and a plan for generic slot introspection (`SLOT_QUERY`, `SLOT_HAS_CAP`) in vNext.

### Fixed
- Documentation formatting/copy issues across planning docs.

## 0.0.1

- Initial repository created (`README.md`).
