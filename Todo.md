# Todo

Near-term engineering tasks and the **current ruleset/engine contract**.

Primary specs (authoritative for `rulesetVersion = 0.1.0`):
- `Ruleset.md`
- `ReplayViewerPlan.md` (schema contract)

---

## Current status

Implemented:
- Deterministic local engine (`packages/engine`) with replay output (`runMatchToReplay`).
- Workshop UI (`apps/web`) running the engine in a Worker.

Legacy:
- `packages/replay` is a sample replay generator and is not authoritative.

### Checklist (done vs. not done)

Done (shipped)
- [x] Deploy Workshop build tag chip (`WORKSHOP_BUILD`) visible in `/workshop/`.
- [x] Inspector shows bot display names (beyond `BOT1/BOT2…`).
- [x] Tick events list grouped by category (Movement/Combat/Resources/Other) with collapsible headers.
- [x] Tick events modes: **All** toggle (scope), **Raw** toggle.
- [x] Tick events filter/search (affects list + raw) + status line.
- [x] Raw tick events include `nameMap` + `eventsWithNames`.
- [x] `pnpm qa:workshop` Playwright smoke covers: run/preview, opponent selects, randomize opponents, tick-events All/Raw/Filter + raw JSON shape.

Not done yet (next milestones)
- [ ] Phase 0.3+: close remaining spec/schema drift (`Ruleset.md` + `ReplayViewerPlan.md` vs engine output).
- [ ] Phase 6: run `pnpm golden:update`, commit fixtures, and make `pnpm golden:check` CI-enforced.
- [ ] Phase 2: replace “infer modules from source text” with explicit per-bot 3-slot `loadout`.
- [ ] Phase 2.1: implement ARMOR (mitigation + any speed penalty) + tests.
- [ ] Phase 3: bullet targeting DSL (`TARGET_CLOSEST_BULLET`, `HAS_TARGET_BULLET`, `DIST_TO_TARGET_BULLET`) + evasion primitive.
- [ ] Phase 8: server runner MVP (submissions + deterministic runs + replay storage).

---

## Current engine contract (rulesetVersion `0.1.0`)

### Determinism
- Seeded RNG per match.
- Stable ordering:
  - bots: `BOT1..BOT4`
  - bullets: creation order
  - powerups: stable anchor order for enumeration; RNG choice for spawn candidate

### Tick ordering
See `Ruleset.md` §5.

### Runtime error policy
- Invalid instruction at runtime:
  - treated as `NOP`
  - bot `pc` resets to `1` next tick
  - engine emits `BOT_EXEC { result: "NOP", reason: "INVALID_INSTR" }`

### Module availability (temporary simplification)
- No explicit loadouts yet.
- Capabilities inferred from source text:
  - contains `SAW` → saw-capable (SLOT1 behaves as SAW)
  - contains `SHIELD` → shield-capable (SLOT2 behaves as SHIELD)
  - otherwise SLOT1 behaves as BULLET; SLOT2 absent

### Implemented balance numbers
(These are *implemented constants*; tuneable only via a rulesetVersion bump.)

- Movement: `speedUnitsPerTick = 12`
- Bullets:
  - `damage = 10`, `speed = 16`, `ttl = 18`
  - `ammoCost = 1`, `cooldownTicks = 4`
- SAW:
  - `damagePerTick = 6`
  - `energyDrainPerTick = 1`
  - `rangeUnits = 18`
- SHIELD:
  - `energyDrainPerTick = 1`
  - bullet mitigation: 50% reduction (`amount - floor(amount/2)`)
- Wall bump:
  - `damage = 2`
- Bot bump:
  - `damage = 1` to each bot
- Powerups:
  - spawn interval `10..20` ticks
  - `maxActive = 6`, `lifetimeTicks = 30`
  - deltas: `HEALTH +30`, `AMMO +20`, `ENERGY +30`
  - type distribution: uniform among `HEALTH|AMMO|ENERGY`

---

## Future development plan

This section is the working roadmap. It’s structured as phases so we can ship incrementally while keeping determinism and the replay schema stable.

Recently completed:
- **Phase 0.1**: Add deploy Workshop build tag mechanism (visible version chip in header).
- **Phase 0.2**: Workshop Inspector ergonomics (deploy):
  - Human-readable tick-event list grouped by category (Movement/Combat/Resources/Other)
  - Bot display names shown in Inspector + event log (beyond BOT1/BOT2…)
  - Tick events modes: **All** toggle, **Raw** toggle
  - Filter/search for tick events (list + raw)
  - Raw JSON includes `nameMap` + `eventsWithNames` (and includes query metadata when filtered)
  - Playwright smoke coverage extended (`pnpm qa:workshop`) to cover these affordances
  See `Versions.md`.

### Global definition of done (all phases)

- Specs updated (as needed): `Ruleset.md`, `ReplayViewerPlan.md`, and any phase-specific docs.
- Version discipline followed:
  - Update `Versions.md` before merge if user-visible behavior or contracts change.
  - Bump `rulesetVersion` when changing sim/replay semantics.
  - If `deploy/workshop/*` changes user-visible behavior, bump the Workshop build tag:
    - `deploy/workshop/workshop.js`: `WORKSHOP_BUILD = '…'`
- QA gates green:
  - `pnpm -C packages/engine test`
  - `pnpm test:all`
  - `pnpm build:all`
  - `pnpm qa`

Optional smoke checks (recommended for anything touching Workshop or deploy artifacts):
- `pnpm check:deploy`
- `pnpm check:deploy:imports`
- `pnpm qa:workshop -- --serve --url http://127.0.0.1:8787`

Workshop QA contract (keep stable or update the QA script alongside UI changes):
- `/workshop` must resolve/redirect to `/workshop/` (relative module imports depend on trailing slash).
- `scripts/qa-workshop.mjs` relies on these IDs existing: `runBtn`, `randomizeOpponentsBtn`, `scrub`, `tickLabel`, `runNotice`, `inspectStats`, `tickEventsAllBtn`, `tickEventsRawBtn`, `tickEventsFilterInput`, `tickEventsFilterStatus`, `tickEventsList`, `eventLog`.
- Treat `pnpm qa:workshop` as **required** when changing `deploy/workshop/*` or `scripts/qa-workshop.mjs`.

---

## Phase 0.3+ — Post-0.0.2 hardening (keep `rulesetVersion = 0.1.0`)

Goal: close out alignment work, reduce drift, and make the existing loop “boringly reliable” before adding new mechanics.

Concrete tasks
- [ ] Close any remaining spec/schema drift:
  - `Ruleset.md` tick ordering + collision semantics match engine behavior.
  - `ReplayViewerPlan.md` fields/events match produced replays.
- [ ] Determinism audit checklist for new features:
  - no `Math.random()`
  - stable iteration order for maps/sets
  - tie-breakers specified (id order, creation order)
- [ ] Workshop stability:
  - worker startup + reload is robust
  - replay playback is stable (no NaNs; no crashes on scrub)
- [ ] Deploy drift guardrails:
  - expand `pnpm check:deploy` to cover any additional copied docs/assets introduced since 0.0.2.

Acceptance criteria
- `pnpm qa` is green on a clean checkout.
- A replay generated twice with the same seed produces byte-identical replay JSON (or matches golden hash, once Phase 6 is complete).
- `pnpm check:deploy` passes and `pnpm sync:deploy` is a no-op after it runs.

QA checklist
- `pnpm -C packages/engine test`
- `pnpm qa`
- `pnpm check:deploy`
- `pnpm qa:workshop -- --serve --url http://127.0.0.1:8787`

---

## Phase 2 — Real loadouts + module model (new `rulesetVersion`)

Goal: remove the temporary “infer modules from source text” shortcut and make bot capabilities explicit.

Concrete tasks
- [ ] Engine input model:
  - add per-bot `loadout` (3 slots) to the match config input.
  - define loadout normalization rules in `Ruleset.md` (validation vs. coercion).
- [ ] Enforcement:
  - no duplicates
  - at most one weapon
  - specify behavior for invalid loadouts (fail match vs. coerce to default).
- [ ] Simulation integration:
  - remove capability inference from source text.
  - make `SLOT1/SLOT2/SLOT3` behavior purely loadout-driven.
- [ ] Workshop integration:
  - UI for selecting/editing loadout per bot.
  - replay inspector shows loadout.
- [ ] Update examples:
  - update `examples/` bots to declare explicit loadouts (or whatever the new config format becomes).

Acceptance criteria
- Given the same seed and same loadouts, replays are deterministic.
- Changing only loadouts changes behavior in expected ways (e.g., weapon availability and/or speed penalties).
- Docs and schema are updated for the new match config and replay metadata.

QA checklist
- `pnpm -C packages/engine test`
- `pnpm test:all`
- `pnpm build:all`
- Workshop smoke: `pnpm qa:workshop -- --serve --url http://127.0.0.1:8787`

---

## Phase 2.1 — ARMOR (complete module set)

Goal: implement ARMOR as a first-class module with deterministic mitigation and any movement penalties.

Concrete tasks
- [ ] Implement ARMOR mitigation rules (document exact math and ordering with shield/bullet mitigation).
- [ ] Implement speed/acceleration penalty (if applicable) and document it.
- [ ] Add replay events/stats needed to debug mitigation (e.g., pre/post damage numbers).
- [ ] Add engine tests covering:
  - mitigation math
  - interaction with SHIELD (ordering is deterministic and documented)

Acceptance criteria
- ARMOR behavior is fully specified in `Ruleset.md` and matches the engine.
- Tests prove mitigation is deterministic and stable (including edge cases like odd-number mitigation).

QA checklist
- `pnpm -C packages/engine test`
- `pnpm qa`

---

## Phase 3 — Bullet awareness “v2”: bullets as first-class targets

Goal: upgrade from coarse bullet threat booleans to target-driven bullet evasion.

Concrete tasks
- [ ] DSL/compiler/runtime:
  - `TARGET_CLOSEST_BULLET`
  - `HAS_TARGET_BULLET()`
  - `DIST_TO_TARGET_BULLET()`
- [ ] Movement primitive:
  - add `MOVE_AWAY_FROM_TARGET` (or a dedicated `EVADE_*` instruction) and specify its semantics.
- [ ] Deterministic tie-break rules:
  - define bullet id + creation order tie-breaks in `Ruleset.md`.
- [ ] Update example bots to demonstrate reliable evasion.

Acceptance criteria
- Deterministic target selection (stable tie-breaks).
- New example bot behavior is reproducible across runs and environments.
- Replay log/inspector makes bullet targeting debuggable.

QA checklist
- `pnpm -C packages/engine test`
- `pnpm qa`
- Optional: run Workshop smoke to validate replay viewer behavior

---

## Phase 4 — Simulation correctness + invariants hardening

Goal: tighten simulation math and invariants so future mechanics don’t create subtle replay drift or edge-case bugs.

Concrete tasks
- [ ] Collision correctness:
  - improve bullet collision math so high-speed bullets can’t “tunnel” through thin targets/walls.
  - specify collision resolution ordering for multi-hit edge cases.
- [ ] Event and damage invariants:
  - bullets always despawn with an explicit reason and position.
  - no out-of-bounds positions; no NaNs.
  - optional: de-dupe `BUMP_BOT` events per bot-pair per tick (if it improves log readability) while keeping damage/credit deterministic.
- [ ] Add invariant-focused tests:
  - regression tests for known tricky collision scenarios.
  - tests that assert invariants on full replay output for a set of seeds.

Acceptance criteria
- Invariant tests fail on NaNs/out-of-bounds/despawn-without-reason.
- Collision behavior is documented and matches implementation.

QA checklist
- `pnpm -C packages/engine test`
- `pnpm qa`
- Optional: update golden fixtures (Phase 6) if changes are intentional.

---

## Phase 5 — Replay/UI polish (Workshop ergonomics)

Goal: make debugging and viewing matches pleasant enough for frequent iteration.

Concrete tasks
- [ ] Bullet despawn smoothing:
  - avoid “pop” on HIT/WALL/TTL; ensure interpolation remains deterministic.
- [ ] Instruction-level debugging:
  - show executed instruction per tick
  - `pc` highlight
  - prominent `BOT_EXEC.reason` display
- [ ] Quality-of-life:
  - improve event log filtering/search
  - add a one-click “copy replay JSON” / “download replay” affordance (if not already present)

Acceptance criteria
- Visual replay playback does not jump/pop on despawn cases.
- For any bot, a developer can answer “what instruction ran and why did it NOP?” from the UI.

QA checklist
- `pnpm -C apps/web test` (or `pnpm test:all`)
- `pnpm build:all`
- `pnpm qa:workshop -- --serve --url http://127.0.0.1:8787`

---

## Phase 6 — Determinism “golden replay” tests (CI-enforced)

Goal: lock in determinism via checked-in fixtures/hashes so future changes can’t silently alter simulation.

Concrete tasks
- [ ] Generate and commit fixtures/hashes under `packages/engine/test/golden/fixtures/`.
- [ ] Flip any placeholder “skip” behavior to “fail” so CI enforces goldens.
- [ ] Document fixture update workflow.

Acceptance criteria
- `pnpm golden:check` fails on any replay drift.
- Fixture update is a deliberate action (`pnpm golden:update`) and reviewed like a spec change.

QA checklist
- Generate: `pnpm golden:update`
- Verify: `pnpm golden:check`
- Full gate: `pnpm qa`

---

## Phase 7 — Deployment unification / reduce duplication

Goal: prevent deploy-time copies drifting from the repo’s authoritative sources.

Concrete tasks
- [ ] Expand deploy sync coverage:
  - ensure any new deploy artifacts are generated from authoritative sources.
  - add/update tests so drift fails in CI.
- [ ] Tighten `pnpm sync:deploy` workflow:
  - document when it must be run (and by whom) before releases.
  - ensure it is deterministic (stable formatting and ordering).
- [ ] Workshop deploy smoke checks:
  - validate that `deploy/` Workshop behaves consistently with `apps/web` for a baseline replay.

Acceptance criteria
- `pnpm check:deploy` fails on any drift and produces actionable output.
- Running `pnpm sync:deploy` followed by `pnpm check:deploy` is always green.

QA checklist
- `pnpm check:deploy`
- `pnpm check:deploy:imports`
- `pnpm qa:workshop -- --serve --url http://127.0.0.1:8787`

---

## Phase 8 — Server: daily runner + submissions

Goal: run deterministic daily competitions and accept bot submissions.

Concrete tasks
- [ ] Headless deterministic match runner:
  - accepts bot source + match config
  - runs engine deterministically
  - outputs replay JSON + summary results
- [ ] Storage + retrieval:
  - store bot submissions with versioning
  - store daily match results + replays
- [ ] Submission API:
  - auth
  - validation (size limits, compile/parse limits, timeouts)
  - rate limiting
- [ ] Operations:
  - scheduled daily runs
  - admin tooling to re-run a day with the same seed

Acceptance criteria
- Given a fixed seed and identical bot sources, the server produces the same replay as local engine execution.
- Submissions are validated consistently and failures are explainable (actionable error messages).

QA checklist
- Engine gates: `pnpm -C packages/engine test` + `pnpm golden:check`
- End-to-end (once server exists):
  - submit known bots, run match, fetch replay, compare to local replay (byte-identical or hash-identical)
