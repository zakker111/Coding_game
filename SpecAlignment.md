# Spec alignment to current engine behavior (rulesetVersion `0.2.0`, schemaVersion `0.1.0`)

## Goal

Make the Markdown “spec” documents match (and therefore **lock**) the behavior of the deterministic engine in:
- `packages/engine/src/sim/runMatchToReplay.js`

Primary implementation references:
- `packages/engine/src/sim/runMatchToReplay.js`
- `packages/engine/src/sim/constants.js`
- `packages/engine/src/sim/bulletSim.js`
- `packages/engine/src/sim/powerupSim.js`
- `packages/engine/src/sim/arenaMath.js`

---

## What is considered “locked” for `rulesetVersion = 0.2.0`

### Replay header
- `schemaVersion` is currently emitted as `'0.1.0'`.
- `rulesetVersion` is currently emitted as `'0.2.0'`.
- `bots[i].loadout` is a 3-slot array (`[slot1, slot2, slot3]`), where each entry is `"BULLET" | "SAW" | "SHIELD" | "ARMOR" | null`.
- `bots[i].loadoutIssues` may be present (informational), when the engine normalized an invalid loadout.

### Tick ordering (engine phase order)
1. Bot VM execution (`BOT1..BOT4`) + `BOT_EXEC` (bullets may spawn here)
2. Toggle drains (SAW/SHIELD energy drain; auto-off at `energy == 0`)
3. Movement + collision resolution (Bresenham stepping for overlap detection)
4. SAW damage
5. Bullet simulation (`BULLET_MOVE/HIT/DESPAWN` + `DAMAGE`)
6. Powerup pickups
7. End-of-tick maintenance (cooldowns, bump flags shift to `*LastTick`, powerup TTL, powerup spawns, target-powerup invalidation)
8. Match end check + `MATCH_END`

### Movement + collision
- Base speed is `12` units/tick; with `ARMOR` equipped: `floor(12 * 3/4) = 9`.
- Collision detection walks integer points along the move segment using Bresenham.
- **Wall bump damage is suppressed if a bot bump occurs**.

### Weapons / modules
- Explicit per-bot loadouts are implemented; default if omitted is **all empty** `[null, null, null]`.
- Loadout normalization is deterministic and records issues (`UNKNOWN_MODULE`, `DUPLICATE`, `MULTI_WEAPON`).
- Bullets:
  - damage `10`, speed `16`, TTL `18`, ammo cost `1`, cooldown `4`
  - muzzle-offset spawn is outside shooter AABB (`BOT_HALF_SIZE + 2 = 10` via L∞ normalization)
  - collision via Bresenham-stepped points (not analytic time-of-impact)
- SAW:
  - damage `6` per tick, energy drain `1` per tick, range `18` units (Euclidean check)
- SHIELD:
  - energy drain `1` per tick
  - bullet mitigation: 50% reduction (`amount - floor(amount/2)`)
- ARMOR:
  - incoming damage mitigation (all sources): `amount - floor(amount/3)`
  - for bullets: apply SHIELD first, then ARMOR

### Environmental damage
- Wall bump damage `2`.
- Bot bump damage `1` to both bots (attributed to the other bot for kill credit), applied at most once per unordered bot-pair per tick.

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

## Canonical docs

- `Ruleset.md` — the gameplay rules for the current engine.
- `ReplayViewerPlan.md` — replay schema/viewer expectations (including legacy handling when `loadout` is missing).
