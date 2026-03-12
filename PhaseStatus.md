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

Key items left:
- Run the QA gates after doc updates and example bot fixes:
  - `pnpm -C packages/engine test`
  - `pnpm qa`
- Optional Phase 1 cleanup: unify/remove legacy docs that still describe the old `packages/replay` sample generator as authoritative.

QA gates:
- `pnpm -C packages/engine test`
- `pnpm qa`

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

Key items left:
- Add golden replay fixtures (or stable replay hashes)
- Ensure CI runs engine tests (not only `apps/web` tests)

---

## Phase 7 — Deployment unification / reduce duplication

Key items left:
- Auto-generate or validate:
  - `deploy/bot-instructions.md` vs `BotInstructions.md`
  - `deploy/workshop/exampleBots.js` vs `examples/bot*.md`

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
