# NextPlan.md — What to build next (post `0.0.3`)

This repo already has a working, end-to-end *local* loop:

- **Engine**: deterministic bot DSL → VM → simulation → replay (`packages/engine`)
- **Workshop UI**: runs the engine in a worker + replay viewer (`apps/web`)
- **Static deploy**: buildless workshop prototype (`deploy/`)

The docs in this repo are already organized into “phases” (`PhaseStatus.md`, `Todo.md`). This plan is a **decision + execution checklist** for the next concrete slice.

Slice 2.A (docs-only):
- Update docs/specs to match the implemented `rulesetVersion = 0.2.0` engine.
- No code edits in this slice (especially none under `packages/engine/**`).

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

## 4) Decision: pick the next slice

Pick **one** slice to execute next.

### Option A (recommended): Phase 0.3 + Phase 6 — determinism lock-in

Outcome:
- `pnpm qa:phase1` actually defends determinism across commits.

This unlocks safe iteration on all later mechanics.

### Option B: Phase 2 + 2.1 — explicit loadouts + ARMOR (`rulesetVersion = 0.2.0`)

Outcome:
- makes module availability an explicit match input + replay header field (loadout is authoritative)
- locks loadout default-empty + deterministic normalization rules in the ruleset
- removes remaining legacy “scan source text for SAW/SHIELD” shortcuts in non-authoritative runners (notably `deploy/engine`)
- wires Workshop UI state → engine loadout so matches don’t silently run with an all-empty loadout

### Option C: Phase 3 — bullet targeting + evasion primitive

Outcome:
- bots can treat bullets as first-class targets (better AI behaviors)

### Option D: Phase 8 — server runner MVP

Outcome:
- deterministic headless runner + bot submissions + replay storage

---

## 5) Execution plan for Option A (recommended)

### A1) Make Phase 1 QA a reliable baseline

Run and make green:

```bash
pnpm qa:phase1
# (Optional but recommended)
pnpm check:deploy
pnpm check:deploy:imports
pnpm qa:workshop -- --serve --url http://127.0.0.1:8787
```

If anything fails, fix *one thing at a time* and add regression tests.

### A2) Fix the golden harness to match the real replay schema

Target files:

- `packages/engine/test/golden/updateGolden.mjs`
- `packages/engine/test/golden/goldenReplays.test.js`

Fix:
- stop reading `replay.header?.bots`
- use `replay.bots` (the actual header bots array)

Also decide whether goldens should include bot source text in hashes:
- Recommended: **exclude** `bots[].sourceText` from the golden hash so comment-only edits don’t churn fixtures.

### A3) Generate and commit real fixtures

```bash
pnpm golden:update
```

This should replace placeholders in:

- `packages/engine/test/golden/fixtures/examples_smoke_seed123.json`
- `packages/engine/test/golden/fixtures/modules_powerups_seed999.json`

### A4) Enforce goldens in CI (no more placeholder pass)

Once fixtures are real:

- change `packages/engine/test/golden/checkGoldens.mjs` to **fail** if *any* fixture contains the placeholder
- keep `pnpm qa:phase1` gated by `pnpm golden:check` (already wired in root `package.json`)

### A5) Optional quick doc cleanup to reduce confusion

These aren’t engine changes, but they reduce reader confusion:

- Ensure built-in examples clearly communicate their intended loadouts (and that Workshop wiring passes those loadouts into `runMatchToReplay`).
  - `examples/bot5.md` is the canonical **BULLET + ARMOR** example; it should only be used in UIs that actually pass a loadout to the engine.

---

## 6) What Option B/C/D look like (high-level only)

### Option B: explicit loadouts + ARMOR (`rulesetVersion = 0.2.0`)

Primary work items (remaining)
- Wire `loadout` through all local runners/frontends (notably `apps/web` worker) so matches don’t silently run with an all-empty loadout.
- Workshop UX:
  - add per-bot loadout selection/editing + persistence
  - show resolved `loadout` + `loadoutIssues` warnings in the inspector
- Deployment unification:
  - remove/upgrade legacy `deploy/engine` copy that still uses source-scanning (`rulesetVersion = 0.1.0`) semantics
  - ensure deploy Workshop matches are either loadout-aware or clearly marked legacy
- Tests:
  - keep explicit engine regression tests for loadouts + ARMOR
  - add an integration smoke test that exercises the full Workshop → worker → engine pipeline with a **non-empty** loadout (e.g. ARMOR affects speed/mitigation)

### Option C: bullet targeting

Primary work items:
- VM/DSL: `TARGET_CLOSEST_BULLET`, `HAS_TARGET_BULLET()`, `DIST_TO_TARGET_BULLET()`
- add movement primitive: `MOVE_AWAY_FROM_TARGET` (or a dedicated evade instruction)
- determinism rules: bullet id tie-breaks must be specified + tested

### Option D: server runner MVP

Primary work items:
- build a headless runner that uses `packages/engine` deterministically
- minimal bot storage + submissions validation
- replay storage + retrieval API

---

## 7) Immediate question to answer before we start

Choose the next slice:

- **A**: Determinism lock-in (goldens + QA hardening)
- **B**: Explicit loadouts + ARMOR
- **C**: Bullet targeting + evasion
- **D**: Server runner MVP
