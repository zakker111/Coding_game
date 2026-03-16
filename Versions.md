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

- Phase 1 spec/schema alignment (rulesetVersion `0.1.0`):
  - `Ruleset.md`, `ReplayViewerPlan.md`, `ServerSimulationPlan.md` updated to match the current engine.
  - Examples updated to avoid invalid nested control-flow (e.g. `IF (...) DO WAIT n`).
- Deploy drift guardrails:
  - `packages/engine/test/deploySync.test.js` enforces:
    - `deploy/bot-instructions.md` matches `BotInstructions.md`
    - `deploy/workshop/exampleBots.js` matches `examples/bot*.md`
- Deploy Workshop (buildless static):
  - Visible build tag in header (`WORKSHOP_BUILD`), currently **v0.2**.
  - Inspector tick events: grouped view + All/Raw toggles + filter + names in raw (`eventsWithNames`).
- Workshop QA:
  - `scripts/qa-workshop.mjs` supports local serve (`--serve`) and multi-URL checks.
  - Covers tick-events filtering + raw JSON shape + randomize opponents.

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
- `packages/engine` is the authoritative simulation core for `rulesetVersion = 0.1.0`.
- `packages/replay` remains a legacy/sample generator and should not be treated as authoritative.

## 0.0.1

- Initial repository created (spec-first Markdown + planning docs).
