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

- Deploy Workshop:
  - Example bots updated to include locked loadout header directives (`;@slot1/2/3 ...`) at the top of each script fence.
  - Workshop now **parses loadout directives** from bot source and passes per-bot `loadout` into the engine worker (so local runs reflect the `rulesetVersion = 0.2.0` engine).
  - `deploy/engine` is synced to `rulesetVersion = 0.2.0` (explicit loadouts + ARMOR speed/damage effects).
  - Workshop build tag is **v0.3.1** (see `deploy/workshop/workshop.js`).
- `apps/web` Workshop local runner now passes explicit per-bot `loadout` into `@coding-game/engine` (derived from `;@slot` directives; if missing, defaults to all-empty).
- Docs/spec: restore detailed `Ruleset.md` and align `ReplayViewerPlan.md`/`SpecAlignment.md` with current `rulesetVersion = 0.2.0` behavior (explicit loadouts + ARMOR, default-empty + normalization).

---

## 0.0.3 — 2026-03-17T00:00:00Z

> Marketing version: **0.03** (SemVer: `0.0.3`).

### Added
- Deploy Workshop (buildless static):
  - Visible build tag chip in header (`WORKSHOP_BUILD`), **v0.3**.
  - Inspector improvements:
    - bot display names shown in Inspector + event formatting
    - tick events grouped (Movement/Combat/Resources/Other) with collapsible headers
    - tick events modes: **All** toggle + **Raw** toggle
    - tick events filter/search + match count status
    - raw tick events JSON includes `nameMap` and `eventsWithNames` (and includes query metadata when filtered)
- Deploy drift guardrails:
  - `pnpm sync:deploy`, `pnpm check:deploy`
  - `pnpm check:deploy:imports` validates deploy-time JS import targets
- Workshop QA smoke:
  - `scripts/qa-workshop.mjs` supports local serve (`--serve`) and multi-URL checks.
  - Covers run/preview + opponent selection/randomize + tick-events All/Raw/Filter + raw JSON shape.

### Fixed
- Deploy Workshop now ensures `/workshop` resolves to `/workshop/` to avoid broken relative module imports.
- Deploy Workshop engine worker boundary: improved failure reporting and rejects in-flight runs on worker errors.

### Changed
- Bumped workspace package versions to `0.0.3` (`apps/web`, `packages/engine`, `packages/replay`, root, and legacy `site`).

---

## 0.0.2 — 2026-03-07T00:00:00Z

> Marketing version: **0.02** (SemVer: `0.0.2`).

### Added
- Monorepo workspace:
  - `apps/web` (Nowt web app)
  - `packages/engine` (bot DSL compiler/VM + deterministic simulation + replay generation)
  - `packages/replay` (legacy replay generator + typings; not used by the Workshop)
  - `deploy/` (buildless static workshop prototype)
- Deterministic simulation + replay generation (engine-driven) including:
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
- `packages/engine` is the authoritative simulation core for `rulesetVersion = 0.2.0` (replay `schemaVersion` remains `0.1.0`).
- `packages/replay` remains a legacy/sample generator and should not be treated as authoritative.

---

## 0.0.1 — 2026-03-01T00:00:00Z

> Marketing version: **0.01** (SemVer: `0.0.1`).

### Added
- Initial repository created (spec-first Markdown + planning docs).
