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

- Powerups: add `powerupLifetimeTicks` and despawn expired powerups with `POWERUP_DESPAWN reason=RULES`.

---

## 0.0.2 — 2026-03-07T00:00:00Z

> Marketing version: **0.02** (SemVer: `0.0.2`).

### Added
- Monorepo workspace:
  - `apps/web` (Nowt web app)
  - `packages/replay` (deterministic replay generator + typings)
  - `deploy/` (buildless static workshop prototype)
- Deterministic replay generation (`generateSampleReplay(seed, { tickCap, bots? })`) including:
  - stable PRNG (no `Math.random()`)
  - continuous positions in a 192×192 arena
  - bots spawning in the four corners
  - bullets + bot/bot + bot/wall collisions
  - powerups (spawn/pickup/despawn) represented in replay state and rendered in the arena
  - SAW melee demo behavior for SAW-capable bots
- Client Workshop features (local, deterministic):
  - landing (`/`) → workshop (`/workshop`)
  - bot editing for `BOT1..BOT4` with local persistence and an explicit apply/update flow for BOT1
  - deterministic opponent selection/randomization (seeded; no `Math.random()`)
  - replay controls (play/pause, step, scrub) with smooth intra-tick interpolation
  - arena rendering: grid + walls + bots + bullets + powerups
  - inspector: per-bot stats + filtered tick event log (including bumps and powerups)
- Vite global `__APP_VERSION__` injected from `apps/web/package.json` and shown in UI.
- Tests:
  - determinism tests for replay generation
  - unit tests for opponent selection and arena utilities

### Changed
- Root `pnpm` scripts target `apps/web` for `dev/build/test`.
- Workspace configuration (`pnpm-workspace.yaml`) includes `apps/*` and `packages/*`, excluding legacy `site/`.

### Notes
- `packages/replay` currently provides a **sample replay generator** used by the Workshop. The full DSL VM + ruleset-accurate simulation engine remains planned work.

## 0.0.1

- Initial repository created (spec-first Markdown + planning docs).
