# NextPlan.md — What to build next (post `0.0.3`)

This repo already has a working, end-to-end *local* loop:

- **Engine**: deterministic bot DSL → VM → simulation → replay (`packages/engine`)
- **Workshop UI**: runs the engine in a worker + replay viewer (`apps/web`)
- **Static deploy**: buildless workshop prototype (`deploy/`)

The docs in this repo are already organized into “phases” (`PhaseStatus.md`, `Todo.md`). This plan is a **decision + execution checklist** for the next concrete slice.

Current slice (Phase 2 + 2.1):
- Implement Phase 2 wiring: pass explicit per-bot `loadout` into the engine from all runners/frontends.
- Implement Phase 2.1 wiring/UX: make ARMOR behavior visible and debuggable (tests + inspector).

---

## 1) What’s “locked” right now

If you change any of the below, treat it as a **contract change** and update `Versions.md` + any affected specs.

- `rulesetVersion = 0.2.0` behavior (see `Ruleset.md`)
- Replay schema contract (see `ReplayViewerPlan.md` + `packages/replay/src/index.d.ts`)
- Deterministic tick loop order (see `Ruleset.md` §5, `ServerSimulationPlan.md`, `SpecAlignment.md`)

---

## 2) Repository document map (so we don’t “plan past” what exists)

**Authoritative for v1 behavior**

- `Ruleset.md` — engine-matching rules + constants for `0.2.0`
- `BotInstructions.md` — stable v1 DSL contract
- `ReplayViewerPlan.md` — replay/viewer contract (schema + UX semantics)
- `ArenaPlan.md` — topology + units + collision model

**Primary “what’s next” trackers**

- `PhaseStatus.md` — prioritized phase list
- `Todo.md` — executable checklist + current engine contract summary

**Forward-looking (useful, but not binding until implemented)**

- `BotLanguageDesign.md`, `FutureProofing.md`, `CombatPlan.md` — extensibility direction
- `ServerPlan.md`, `ServerSimulationPlan.md`, `ServerTechStack.md`, `DailyCompetition.md` — server + daily competitions
- `UIPlan.md`, `ArenaVisualPlan.md` — workshop UX + rendering requirements

---

## 3) The biggest *project risk* right now

Before adding more mechanics, the highest-leverage work is to **prevent silent determinism drift**.

Concretely:

- Phase 6 golden tests exist, but fixtures are placeholders (see `packages/engine/test/golden/fixtures/*.json`).
- The golden harness currently references `replay.header` even though the schema uses `replay.bots` (see `packages/replay/src/index.d.ts` and `packages/engine/src/sim/runMatchToReplay.js`).

Until goldens are real + enforced, it’s too easy to break determinism while “just refactoring”.

---

## 4) Current slice: Phase 2 + 2.1 — explicit loadouts + ARMOR (`rulesetVersion = 0.2.0`)

Outcome:
- module availability is an explicit match input (no source scanning)
- replay headers are self-describing via per-bot `loadout` (+ optional `loadoutIssues`)
- ARMOR semantics are locked (mitigation + speed penalty) and debuggable

### Execution checklist

1) Wire `loadout` through all runners/frontends
- Workshop (`apps/web` worker boundary)
- any deploy-time runners that still pass implicit/legacy loadouts

2) Workshop UX
- per-bot loadout selection/editing + persistence
- inspector rendering for resolved `loadout`
- non-blocking warning + detail view for `loadoutIssues`

3) Tests
- engine regressions for:
  - loadout normalization + issue recording
  - ARMOR mitigation math (incl. odd amounts)
  - SHIELD→ARMOR ordering for bullets
  - ARMOR speed penalty when equipped
- integration smoke ensuring Workshop actually passes non-empty loadouts into the worker → engine pipeline

4) QA commands (run locally before merging)

```bash
pnpm -C packages/engine test
pnpm test:all
pnpm build:all
pnpm qa
# optional but recommended if deploy/workshop is touched
pnpm check:deploy
pnpm check:deploy:imports
pnpm qa:workshop -- --serve --url http://127.0.0.1:8787
```

---

## 5) Up next (after Phase 2 + 2.1)

- Phase 6 determinism lock-in (commit/enforce golden fixtures)
- Phase 3 bullet-as-target + evasion
- Phase 8 server runner MVP
