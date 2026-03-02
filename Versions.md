# Versions

This project follows **Semantic Versioning** (SemVer): `MAJOR.MINOR.PATCH`.

- **MAJOR**: breaking changes to bot APIs, replay formats, save formats, or public interfaces.
- **MINOR**: new features that are backwards-compatible.
- **PATCH**: bug fixes and small improvements.

## Unreleased

### Added
- Project documentation scaffolding: `Prompt.md`, `Versions.md`, `Bugs.md`, `Todo.md`.
- New rules documentation for v1 bot speed model (movement cooldown affected by equipped slot count).

### Changed
- Loadout rules: slots may be empty; at most one weapon equipped (v1: `BULLET` or `SAW`).
- Gameplay timing locked in docs: `ticksPerSecond = 1` and powerup spawn interval is 10–20 seconds.
- UI plan clarified: Landing page is a single **Start Game** button for v1 (auth planned later).

### Fixed
- Documentation formatting/copy issues across planning docs.

## 0.0.1

- Initial repository created (`README.md`).
