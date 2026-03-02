# FutureProofing.md — Future-Proofing Bot Instructions + Slot Modules

This document outlines how to keep the bot language **stable** while allowing many new weapons, utilities, and “pet/minion” style mechanics in the future.

It complements:
- `BotInstructions.md` (player-facing language)
- `Ruleset.md` (simulation rules)

---

## 1) Problem statement

We want to add new gameplay modules over time:
- new weapons (different projectile patterns, AoE, mines, beams)
- new defenses (variants of shields)
- utility modules (teleport, dash, scan)
- **spawn modules** (e.g., small helper bots that orbit, heal, intercept bullets)

If each new module requires adding new bespoke bot instructions, the instruction set will:
- grow too fast
- get inconsistent
- become harder to validate/sandbox
- make older replays/scripts harder to preserve

We need an extensibility layer.

---

## 2) Core strategy: keep the VM instruction set small; make modules data-driven

### 2.1 Stable instruction “spine”
Keep these categories stable (rarely change):
- control flow (`LABEL`, `GOTO`, `IF ...`)
- deterministic timing (`WAIT`, timers)
- movement (`MOVE`, `MOVE_TO_*`)
- targeting registers
- **generic slot use** (see §3)

### 2.2 Modules are simulation-side “plugins”
New content is added primarily by:
- defining a new **module type** (e.g., `DRONE_SPAWNER`)
- implementing its deterministic behavior in the simulation engine
- defining its resource usage (ammo/energy), cooldowns, and effects in data

Recommended module schema fields (high-level):
- activation: `INSTANT | TOGGLE | PASSIVE`
- costs (vector): `costAmmo`, `costEnergy`
- cooldown: `cooldownOnUseTicks`
- optional drains while active: `drainEnergyPerTick`

Delivery / behavior kind (examples):
- attacks: `PROJECTILE | HITSCAN | TIMED_EXPLOSIVE`
- deployables: `DEPLOYABLE` (mines, turrets, traps)
- spawns: `SPAWN_HELPER`

See `CombatPlan.md` for projectile + cooldown details.

The bot language does **not** need a new opcode for each module.

---

## 3) Extensibility layer: slot-addressed `USE_SLOTn` + `STOP_SLOTn`

### 3.1 Slot actions
Treat slot-addressed actions as the long-term compatibility surface:
- `USE_SLOT1 <TARGET>`
- `USE_SLOT2 <TARGET>`
- `USE_SLOT3 <TARGET>`
- `STOP_SLOT1|STOP_SLOT2|STOP_SLOT3`

Meaning:
- `USE_SLOTn` triggers the **default/primary action** of the module equipped in that slot.
- `STOP_SLOTn` disables/toggles off a module if it has an “on” state.

This makes adding modules mostly a matter of implementing how that module responds to `USE`/`STOP`.

### 3.2 Keep module-type commands as “syntax sugar” (optional)
Player-friendly commands like `SAW ON` / `SHIELD ON` can remain for the first few modules.
But internally the compiler can treat them as sugar for `USE_SLOTn` / `STOP_SLOTn`.

This allows:
- a beginner-friendly language
- plus a stable low-level core

---

## 4) Future-proof targeting: standardize targets

To support many kinds of abilities, define a stable target model.

Recommended target kinds (expandable):
- bot slot: `BOT1..BOT4`, `TARGET`, `CLOSEST_BOT`
- arena locations:
  - `SECTOR 1..9` (sector centers)
  - `SECTOR 1..9 ZONE 1..4` (zone centers)
  - (and later `POS x y` if continuous targeting is ever exposed)
- self/none: `SELF`, `NONE`

Rule:
- `USE_SLOTn` may ignore targets that do not apply.

This prevents having to add unique “target forms” per weapon.

---

## 5) Future-proof sensing: add generic counters before bespoke predicates

Spawn modules (helper bots/minions) create new entity types.
Instead of adding many one-off predicates, prefer generic primitives like:
- `OWNED_COUNT(<ENTITY_KIND>)`
- `ENEMY_COUNT(<ENTITY_KIND>)`
- `DIST_TO_CLOSEST(<ENTITY_KIND>)`

Then layer convenience predicates later if needed.

---

## 6) Minions / helper bots design (future)

Model helpers as first-class simulation entities:
- `entityId`, `kind`, `ownerBotId`
- deterministic movement pattern (orbit/seek)
- deterministic effect (heal, shield, intercept)

Important design constraints:
- helpers must have deterministic update order (entity id ascending)
- their resource drain (e.g., "heals but consumes owner energy") is explicit and tick-based

Bot interaction:
- bots use `USE_SLOTn` to spawn/command helpers
- bots use generic counters to decide when to spawn/stop them

---

## 7) Versioning and backwards compatibility

To keep old scripts/replays meaningful:
- every bot version stores:
  - `ruleset_version`
  - compiled IR hash
- every replay references:
  - `ruleset_version`
  - bot version hashes

When adding a new module type:
- increase ruleset version
- do not change the meaning of old instructions
- prefer additive changes

---

## 8) Practical near-term recommendations

- Introduce `USE_SLOTn` as the canonical extensibility instruction.
- Keep existing `FIRE_SLOTn` as an alias/sugar for compatibility and readability.
- Prefer new module work to be implemented via module behavior + data, not new opcodes.
- When new opcodes are unavoidable, treat them as sugar that compiles down to a stable internal IR.
