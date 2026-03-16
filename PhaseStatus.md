# Phase status (what’s left)

This repo already has a working end-to-end local loop:
- Bot DSL compiler + VM (`packages/engine/src/dsl`, `packages/engine/src/vm`)
- Deterministic simulation + replay generation (`packages/engine/src/sim/runMatchToReplay.js`)
- Workshop UI running the engine in a worker (`apps/web/src/worker`)

Recent gameplay changes already shipped:
- Example bots now dodge bullets using `BULLET_IN_SAME_SECTOR()` / `BULLET_IN_ADJ_SECTOR()`.
- Bot-to-bot collisions (`BUMP_BOT`) now deal ramming damage (`BOT_BUMP_DAMAGE = 1`) with kill credit.

---

## Phase 1 — Spec + implementation alignment (highest priority)

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

## Phase 2 — Real loadouts + module model (v1 completeness)

Goal: remove the sim shortcut that infers modules from source text.

Key items left:
- Add explicit per-bot loadout input (`SLOT1..SLOT3`)
- Enforce v1 constraints (no duplicates; at most one weapon)
- Implement ARMOR fully:
  - heavy speed penalty
  - passive mitigation rules

QA gates:
- Add deterministic tests proving loadout affects speed + mitigation.

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
- Scaffolded: golden tests + fixture generator exist.
- Remaining: run the generator once and check in the generated fixture hashes.

Commands:
- Generate fixtures: `pnpm golden:update`
- Run golden-only tests: `pnpm test:golden`

Key items left:
- Commit the generated fixture JSON under `packages/engine/test/golden/fixtures/`.
- (After fixtures are committed) flip placeholder handling from “skip” to “fail” so CI enforces goldens.

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

## Suggested next slice (pick one)

1) Spec/schema alignment
2) Real loadouts + ARMOR
3) Bullet-as-target
