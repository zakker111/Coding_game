# Spec alignment to current engine behavior (rulesetVersion `0.1.0`)

## Goal

Make the Markdown “spec” documents match (and therefore **lock**) the behavior of the currently implemented deterministic engine in `packages/engine/src/sim/runMatchToReplay.js`.

Primary implementation references:
- `packages/engine/src/sim/runMatchToReplay.js`
- `packages/engine/src/sim/constants.js`
- `packages/engine/src/sim/bulletSim.js`
- `packages/engine/src/sim/powerupSim.js`
- `packages/engine/src/sim/arenaMath.js`

---

## What is now considered “locked” for `rulesetVersion = 0.1.0`

### Replay schema / event contract
- `BOT_EXEC` for invalid instructions:
  - emitted as `result = NOP`, `reason = INVALID_INSTR`, `pcAfter = 1`
- Powerup event payloads:
  - use `powerupType` (because `type` is reserved as the event discriminator)
- `DAMAGE` event fields:
  - required: `victimBotId`, `amount`, `source`, `kind`
  - optional: `sourceBotId`, `sourceRef`
  - current `source` values: `ENV | BOT | BULLET | SAW`
  - current `kind` values: `BUMP_WALL | BUMP_BOT | DIRECT`

### Tick ordering (engine phase order)
1. Bot VM execution (`BOT1..BOT4`) + `BOT_EXEC` (bullets may spawn here)
2. Toggle drains (SAW/SHIELD energy drain; auto-off at `energy == 0`)
3. Movement + collision resolution (Bresenham stepping for overlap detection)
4. SAW damage
5. Bullet simulation (`BULLET_MOVE/HIT/DESPAWN` + `DAMAGE`)
6. Powerup pickups
7. End-of-tick maintenance (cooldowns, bump flags shift to `*LastTick`, powerup TTL, powerup spawns, target-powerup invalidation)
8. Match end check + `MATCH_END`

### Movement + collision (important edge case)
- Bot movement uses integer deltas with `speedUnitsPerTick = 12`.
- Collision detection walks integer points along the segment using Bresenham.
- **Wall bump damage is suppressed if a bot bump occurs** (current engine behavior).

### Weapons / modules
- Explicit loadouts are **not implemented** yet.
  - The engine infers SAW/SHIELD capability by scanning bot source text for `SAW` / `SHIELD` tokens.
- Bullets:
  - damage `10`, speed `16`, TTL `18`, ammo cost `1`, cooldown `4`
  - muzzle-offset spawn (outside shooter AABB)
  - collision via Bresenham-stepped points (not analytic time-of-impact)
- SAW:
  - damage `6` per tick, energy drain `1` per tick, range `18` units (Euclidean check)
- SHIELD:
  - energy drain `1` per tick
  - bullet mitigation: 50% reduction (`amount - floor(amount/2)`)
- Bumps:
  - wall bump damage `2`
  - bot bump damage `1` to both bots (attributed to the other bot for kill credit)

### Powerups
- Spawn interval: uniform `10..20` ticks
- Max active: `6`
- Lifetime: `30` ticks
- Deltas: `HEALTH +30`, `AMMO +20`, `ENERGY +30`
- Spawn locations: 45 anchors in stable order (sector asc; center then zones 1..4)
- Spawn avoids:
  - occupied anchors
  - anchors currently inside any alive bot AABB
- Type distribution: uniform among `HEALTH|AMMO|ENERGY`

---

## Files updated

### Core rules + schema docs
- `Ruleset.md`
  - rewritten as an **engine-matching** ruleset reference for `rulesetVersion 0.1.0`
  - includes constants, tick ordering, collision semantics, powerups, and weapon rules
- `ReplayViewerPlan.md`
  - aligned `BOT_EXEC` invalid instruction semantics (`NOP`, not `ERROR`)
  - renamed powerup kind field to `powerupType`
  - aligned `DAMAGE` schema and documented current `source` / `kind` values
- `ServerSimulationPlan.md`
  - tick loop updated to match the implemented phase order

### Bot language reference + examples
- `BotInstructions.md`
  - restored full reference and aligned current-engine notes:
    - modules inferred from source text (temporary simplification)
    - SHIELD mitigation documented as 50% for `0.1.0`
    - ARMOR marked not implemented
- `examples/bot3.md`
  - removed invalid nested control flow: `IF (...) DO WAIT n` → label-based `GOTO` + `WAIT`
  - updated header to reflect that ARMOR/loadouts are not active in current engine
- `BotModelPlan.md`
  - updated the “Corner Bunker” snippet to avoid nested `WAIT`

### Project tracking docs
- `Todo.md`
  - rewritten to summarize the current engine contract and the next priorities
- `PhaseStatus.md`
  - Phase 1 “spec drift” items removed; now focused on running QA + optional cleanup
- `README.md`
  - updated to point to `packages/engine` as the runnable prototype core
  - clarified that explicit loadouts are not implemented in `0.1.0`
- `Versions.md`
  - updated `Unreleased` notes to reflect the spec-alignment work

---

## Recommended follow-on cleanups (optional)

- Add CI validation so deploy-time copies cannot drift:
  - assert `deploy/bot-instructions.md` equals `BotInstructions.md`
  - assert `deploy/workshop/exampleBots.js` matches `examples/` (or generate it)
- Add a “ruleset constants table” in one place (either `Ruleset.md` or a new `RulesetConstants.md`) if you want a single canonical reference for balance numbers.
