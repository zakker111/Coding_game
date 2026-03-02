# ZonePowerupPlan.md — Zones, Powerups, Collision, and Server Determinism (Plan)

This document is a **planning/checklist view** of the zone-aware arena + powerup collision/spawning rules.
It summarizes how the existing repo specs fit together.

Authoritative specs referenced:
- `ArenaPlan.md` (sectors/zones, anchors, wall model, physics migration)
- `BotInstructions.md` (zone-aware movement + powerup sensing)
- `Ruleset.md` (powerup spawning + pickup/collision semantics)
- `ServerSimulationPlan.md` (tick loop and phase ordering)
- `ReplayViewerPlan.md` (replay events for spawns/pickups/resource deltas)
- `UIPlan.md` (green sector/zone grid rendering)

---

## 1) Arena model (sectors + zones)

- Sectors `1..9` in a 3×3 grid (`5` is center).
- Each sector has zones `1..4` in a 2×2 grid:
  - `1 2`
  - `3 4`
- Zone size: `32×32`
- Sector size: `64×64`
- Arena size: `192×192`

### 1.1 Deterministic anchors (v1)

All entity positions are expressed as deterministic **location anchors**:
- sector center: `SECTOR s`
- zone center: `SECTOR s ZONE z`

This is the basis for:
- movement
- collision
- replay encoding

---

## 2) UI requirements

From `UIPlan.md`:
- sector boundaries: **thicker green** grid lines
- zone boundaries: **thinner green** grid lines inside sectors
- outer wall: visually distinct from green grid (thicker border)

---

## 3) Bot language requirements

From `BotInstructions.md`:

Movement targets:
- `MOVE_TO_SECTOR <SECTOR>` → toward sector center
- `MOVE_TO_SECTOR <SECTOR> ZONE <ZONE>` → toward zone center
- zone-in-current-sector sugar (aliases; see `BotInstructions.md` for exact semantics):
  - `MOVE_TO_ZONE <ZONE>` → toward zone center in your current sector
- persistent goals:
  - `SET_MOVE_TO_SECTOR <SECTOR>`
  - `SET_MOVE_TO_SECTOR <SECTOR> ZONE <ZONE>`
  - `SET_MOVE_TO_ZONE <ZONE>` → goal toward zone center in your current sector

Zone convenience (examples):
- `IN_ZONE(<ZONE>)` (equivalent to `ZONE() == <ZONE>`)

Powerup sensing (examples):
- `POWERUP_IN_ZONE(HEALTH, 1, 2)`
- `POWERUP_EXISTS(HEALTH)`
- `DIST_TO_CLOSEST_POWERUP(HEALTH)`

Powerup targeting invalidation:
- if no powerup of a targeted type exists anymore, the target becomes invalid and is cleared (so bots stop “chasing a non-existent item”).

---

## 4) Powerups: spawn + collision pickup (server-authoritative)

From `Ruleset.md`:

### 4.1 Spawn schedule

- A **global** `spawnRemainingTicks` controls overall spawn rate.
- Timing decisions (v1):
  - `ticksPerSecond = 1` (so `1 tick = 1 second`)
  - after each spawn attempt, reset the timer by sampling an integer uniformly from **[10, 20] ticks** (so **10–20 seconds**)
  - equivalently: `powerupSpawnIntervalMinTicks = 10`, `powerupSpawnIntervalMaxTicks = 20`

Related v1 mechanics:
- bot movement speed is affected by equipped slot count (see `Ruleset.md` §1.2)
- General constraint (still applies if timing becomes configurable later):
  - `powerupSpawnIntervalMaxTicks <= ticksPerSecond * 60` (≥ 1 spawn/min)

On spawn:
- pick an empty anchor among the 45 anchors (seeded RNG)
  - constraint: at most **1** powerup may exist at a given anchor at a time
- pick a type (seeded RNG; optional weights)

### 4.2 Pickup = collision

Pickup rule (anchor-based collision):
- if `bot.loc == powerup.loc` after movement resolution, the bot picks it up.

Pickup effect rule (fixed amount per type; capped at 100):
- `health = min(100, health + powerupHealthDelta)`
- `ammo   = min(100, ammo   + powerupAmmoDelta)`
- `energy = min(100, energy + powerupEnergyDelta)`

This “fixed delta per powerup type” principle should apply to any future powerup.

---

## 5) Tick loop integration

From `ServerSimulationPlan.md`:

- Pickups occur in the **Pickups** phase after movement/projectile resolution.
- Powerup spawning occurs in **End-of-tick maintenance**.

This sequencing ensures:
- bots can pick up a powerup in the same tick they arrive at its anchor
- spawns are deterministic and consistent across client/server

---

## 6) Replay implications

From `ReplayViewerPlan.md`:

- represent locations as `loc = { sector: 1..9, zone: 0..4 }` (`zone=0` = sector center)
- emit:
  - `POWERUP_SPAWN`
  - `POWERUP_PICKUP`
  - `RESOURCE_DELTA` with cause `PICKUP_*`

---

## 7) Physics migration (later)

Current v1 is **anchor-based** (discrete).

When migrating to physics:
- bots/powerups move to continuous `(x,y)` positions
- collision becomes 32×32 AABB overlap
- **spawn rate, type RNG, and fixed pickup deltas remain unchanged**
- the main change is collision detection + movement model (and therefore replay detail level)
