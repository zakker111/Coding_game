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

## Next priorities

1) **Real loadouts + module model**
- Add explicit per-bot `loadout` input (3 slots).
- Remove “infer SAW/SHIELD from source text”.
- Enforce v1 constraints (no duplicates; at most one weapon).

2) **Implement ARMOR**
- Passive mitigation.
- Speed penalty (if/when loadout weight returns).

3) **Golden replay determinism tests**
- Add fixtures or stable replay hashes.
- Ensure CI runs `pnpm -C packages/engine test` and `pnpm qa`.

4) **Docs duplication cleanup**
- Reduce drift between top-level docs and `deploy/` copies.
