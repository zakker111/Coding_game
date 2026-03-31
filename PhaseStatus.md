# Phase status (what’s left)

This repo already has a working end-to-end local loop:
- Bot DSL compiler + VM (`packages/engine/src/dsl`, `packages/engine/src/vm`)
- Deterministic simulation + replay generation (`packages/engine/src/sim/runMatchToReplay.js`)
- Workshop UI running the engine in a worker (`apps/web/src/worker`)

Current slice (Phase 2.A + 2.1 — spec-first lock + ARMOR):
- Wire explicit per-bot `loadout` through all runners/frontends (Workshop worker, deploy runners) so matches don’t silently run with `[null, null, null]`.
- Workshop UX: loadout editor + inspector display of resolved `loadout` and any `loadoutIssues` (**visible, non-blocking warning/error**).
- ARMOR QA/UX: keep deterministic tests for mitigation/ordering/speed penalty and surface the effects in replay inspection.

Recent gameplay changes already shipped:
- Example bots now dodge bullets using `BULLET_IN_SAME_SECTOR()` / `BULLET_IN_ADJ_SECTOR()`.
- Bot-to-bot collisions (`BUMP_BOT`) now deal ramming damage (`BOT_BUMP_DAMAGE = 1`) with kill credit.

---

## Phase 1 — Spec + implementation alignment

Goal: make docs, engine behavior, and replay schema agree so future work doesn’t create regressions.

Completion criteria (Phase 1 is “done” once these are green):
- QA gates:
  - `pnpm -C packages/engine test`
  - `pnpm qa`

Recommended (but optional) smoke checks:
- `pnpm check:deploy:imports`
- `pnpm qa:workshop -- --serve --url http://127.0.0.1:8787`

Optional cleanup:
- Unify/remove legacy docs that still describe the old `packages/replay` sample generator as authoritative.

---

## Phase 2 — Real loadouts + module model (`rulesetVersion = 0.2.0`)

Goal: make module availability an explicit match input (not source-scanned), and make replays self-describing via per-bot `loadout`.

Implemented (authoritative engine: `packages/engine`):
- Explicit per-bot 3-slot `loadout` input (`SLOT1..SLOT3`) with default-empty + deterministic normalization.
- v1 constraints enforced via normalization (unknown modules → EMPTY, dedupe, at most one weapon).
- `ARMOR` implemented:
  - speed penalty: `floor(12 * 3/4) = 9`
  - mitigation (all damage sources): `amount - floor(amount/3)`

Consumers / wiring:
- ✅ `apps/web` Workshop passes explicit per-bot loadouts through the worker into the engine.
- ✅ Deploy Workshop uses the upgraded `deploy/engine` copy that matches `packages/engine` (`rulesetVersion = 0.2.0`).

QA gates:
- ✅ Deterministic engine tests cover loadout effects (weapon availability, ARMOR speed + mitigation).

---

## Phase 3 — Bullet awareness “v2”: bullets as first-class targets

Goal: upgrade from coarse threat booleans to bullet-target-driven behavior.

Key items left:
- DSL/compiler + runtime support for:
  - `TARGET_CLOSEST_BULLET`
  - `HAS_TARGET_BULLET()`
  - `DIST_TO_TARGET_BULLET()`
- Add an evasion movement primitive:
  - `MOVE_AWAY_FROM_TARGET` (or a dedicated `EVADE_*` instruction)

QA gates:
- Unit tests for target selection determinism (tie-breaks by bullet id / creation order).
- Sim tests demonstrating reliable evasion.

---

## Phase 4 — Simulation correctness + invariants hardening

Goal: tighten the sim so it matches the written rules and stays robust as mechanics expand.

Key items left:
- Improve bullet collision math (current stepping approach may miss edge cases)
- Optional: de-dupe `BUMP_BOT` events per bot-pair per tick (damage is already de-duped)
- Add more invariants:
  - bullets always despawn with a reason/pos
  - no out-of-bounds / NaNs

---

## Phase 5 — Replay/UI polish (Workshop ergonomics)

Key items left:
- Bullet despawn-tick smoothing (avoid “pop” on HIT/WALL/TTL)
- Richer debugging:
  - executed instruction per tick + `pc` highlight
  - prominent `BOT_EXEC.reason` display

---

## Phase 6 — Determinism “golden replay” tests

Status:
- ✅ Fixtures committed (golden hash fixtures under `packages/engine/test/golden/fixtures/`).
- ✅ CI-enforced (QA workflow sets `GOLDEN_STRICT=1`).

Commands:
- Generate fixtures: `pnpm golden:update`
- Run golden-only tests: `pnpm test:golden`

Automation:
- You can also run the GitHub Actions workflow **"Golden fixtures update (Phase 6)"** (see `.github/workflows/golden-update.yml`) to generate fixtures and open a PR automatically.

Key items left:
- When simulation behavior changes intentionally, re-run `pnpm golden:update` (or the GH workflow) and merge the fixture update PR.

Notes:
- Strict checking is enabled by setting `GOLDEN_STRICT=1` (locally or in CI).
- For local strict checking, run `pnpm golden:check:ci`.

---

## Phase 7 — Deployment unification / reduce duplication

Goal: prevent deploy-time copies drifting from the repo’s authoritative sources.

Implemented:
- CI validation (via `packages/engine/test/deploySync.test.js`) that fails if:
  - `deploy/bot-instructions.md` drifts from `BotInstructions.md`
  - `deploy/workshop/exampleBots.js` drifts from `examples/bot*.md`
- In-repo tooling:
  - `pnpm sync:deploy` (regenerates deploy-time copies)
  - `pnpm check:deploy` (fails fast if deploy-time copies drift)

---

## Phase 8 — Server: daily runner + submissions

Key items left:
- Headless deterministic match runner (scheduling + storage + replay output)
- Auth + bot submissions + versioning + validation

---

## Suggested next slice (after Phase 2.A + 2.1)

1) Phase 6 determinism lock-in (commit/enforce golden fixtures)
2) Phase 3 bullet-as-target + evasion
3) Phase 8 server runner MVP
