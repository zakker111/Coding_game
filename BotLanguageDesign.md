# BotLanguageDesign.md — Making `BotInstructions` Fun + Future-Proof (vNext Planning)

This document proposes how to evolve `BotInstructions.md` so it remains **small, teachable, and deterministic**, while supporting a growing catalog of slot modules:
- lasers / beams
- sniper rifles (hitscan)
- grenades (timed explosives)
- mines (deployables)
- teleports
- helper/minion spawners

The key idea is to keep the **instruction set stable** and put most “variety” into **data-driven module behaviors**.

Related docs:
- `BotInstructions.md` (current v1 language)
- `FutureProofing.md` (slot/module extensibility strategy)
- `CombatPlan.md` (cooldowns, projectiles, explosives)
- `ReplayViewerPlan.md` (how replays + debugging should work)

---

## 1) What makes the language fun (player experience)

A fun bot language usually has:

1) **Clear mental model**
   - 1 instruction per tick
   - predictable execution order

2) **Enough “state” to build strategies**
   - timers (already planned)
   - *optionally* small registers (for memory/state machines)

3) **Great observability**
   - replays show *what happened* and *why* (cooldown, no ammo, invalid target)
   - code line highlighting and execution trace

4) **Lots of module variety** without language bloat
   - add 100 weapons without adding 100 opcodes

---

## 2) Keep `BotInstructions.md` split into two layers

### 2.1 Layer A — Stable VM / language core (rarely changes)

`BotInstructions.md` should remain the source of truth for:
- control flow
- timing (WAIT + non-blocking timers)
- movement + targeting registers
- generic slot activation (`USE_SLOTn`, `STOP_SLOTn`)
- expressions/predicates (sensing)

### 2.2 Layer B — Module catalog (changes often)

Module definitions should live in a separate evolving document (or data schema), e.g. `Modules.md` later.

A module definition includes:
- costs: `costAmmo`, `costEnergy` (vector)
- cooldown: `cooldownOnUseTicks`
- delivery: `PROJECTILE | HITSCAN | TIMED_EXPLOSIVE | DEPLOYABLE | SPAWN_HELPER`
- target requirements (bot/sector/self/none)
- damage/effect numbers

This keeps the language stable while gameplay grows.

---

## 3) Unify module activation around `USE_SLOTn`

We already have `USE_SLOTn <BOT_TARGET>` in v1 planning.

To support teleport, mines, grenades, and other “non-bot” targeting, we need a **future-proof target grammar**.

### 3.1 Recommended vNext target union

Define a generic `<TARGET>` that can represent multiple target kinds:

- **Bot targets**:
  - `BOT1|BOT2|BOT3|BOT4`
  - `TARGET` (current target bot register)
  - `CLOSEST_BOT`

- **Location targets**:
  - `SECTOR <N>` (1..9)

- **Self/none**:
  - `SELF`
  - `NONE`

Then:
- `USE_SLOTn <TARGET>` becomes the canonical activation form.
- v1 compatibility: treat `USE_SLOTn <BOT_TARGET>` as a subset of `<TARGET>`.

### 3.2 Why this matters

- Grenade launchers may want a bot target or a sector target.
- Mines typically don’t need a bot target.
- Teleport needs a location target.
- Helper/minion spawners often need `NONE` or `SELF`.

---

## 4) Add **module introspection** predicates (to avoid wasted ticks)

If bots can’t check cooldown/resources, they will waste many ticks spamming actions.
That’s less fun and harder to debug.

Recommended *expression* functions:

- `HAS_MODULE(<SLOT>)` → bool
- `COOLDOWN_REMAINING(<SLOT>)` → int
- `SLOT_READY(<SLOT>)` → bool
  - shorthand for `COOLDOWN_REMAINING(slot) == 0` and enough resources
- `SLOT_ACTIVE(<SLOT>)` → bool
  - for toggle modules

Notes:
- These functions do not give bots control over mechanics; they only reveal state.
- The engine remains authoritative.

---

## 5) Optional: add tiny bot-local registers (for richer strategies)

Timers alone can implement many strategies, but registers make scripting feel more like programming.

Conservative option:
- Add 3–4 integer registers: `R1..R4` (range `0..999`)

Minimal instruction set:
- `SET R1 <INT>`
- `INC R1`
- `DEC R1`
- `ADD R1 <INT>`
- `SUB R1 <INT>`

Expression access:
- `R1`, `R2`, `R3`, `R4` usable inside `IF (...)`.

Determinism:
- values are integers
- overflow clamps or wraps (must be documented if added)

If you want to keep v1 ultra-simple, omit registers and lean on timers + label state machines.

---

## 6) Facing/orientation (enables better weapons + placement)

Some mechanics get easier and more tactical if bots have a deterministic “facing”:
- directional lasers
- dropping mines “in front”
- dashes

Three compatible models:

- **A) No facing** (simplest): abilities either use bot target or sector target.
- **B) Derived facing**: facing = last successful move direction.
- **C) Explicit facing**: add `FACE <DIR>` instruction.

---

## 7) How common future modules map to the language

### 7.1 Laser / beam weapon

Mechanics (module-defined):
- delivery: `HITSCAN`
- cost: energy only, or hybrid
- cooldown: medium
- targeting: either
  - bot target (auto-resolve line), or
  - directional (needs facing)

Language interaction:
- `USE_SLOTn TARGET` or `USE_SLOTn BOT2`
- optional predicates: `SLOT_READY(SLOTn)`

### 7.2 Sniper rifle

Mechanics:
- `HITSCAN`
- high cooldown
- high ammo or hybrid cost

Language interaction:
- `USE_SLOTn BOTx` / `USE_SLOTn TARGET`

### 7.3 Grenade launcher

Mechanics:
- `TIMED_EXPLOSIVE`
- fuse + AoE radius=1 sector with falloff (per `CombatPlan.md`)

Language interaction:
- `USE_SLOTn BOTx` or `USE_SLOTn SECTOR 5`

### 7.4 Mines

Mechanics:
- `DEPLOYABLE`
- triggers when a bot enters mine sector
- AoE radius=1 sector with falloff

Language interaction:
- `USE_SLOTn NONE` (drop at feet), or
- `USE_SLOTn SECTOR <N>` (if you allow targeted placement)

### 7.5 Teleport

Mechanics:
- location effect
- energy cost + cooldown

Language interaction:
- `USE_SLOTn SECTOR <N>`

---

## 8) Replay + debugging requirements that the language should enable

To make the instruction set feel good, the replay should explain failures.

For any `USE_SLOTn` attempt, include in replay trace:
- executed/no-op
- reason (cooldown, no ammo, no energy, invalid target, no module)

This directly supports the “what went wrong?” browser experience.

---

## 9) Recommended next edits to `BotInstructions.md` (planning)

When you’re ready to evolve the spec, the next safe edits are:

1) Generalize `USE_SLOTn` to accept `<TARGET>` (adds `SECTOR <N>`, `SELF`, `NONE`).
2) Add introspection predicates (`COOLDOWN_REMAINING`, `SLOT_READY`, etc.).
3) Optionally add facing model (B or C) if you want directional weapons.
4) Optionally add registers if you want deeper programming strategies.

---

## 10) Decisions to lock (pick one per row)

1) Target grammar for `USE_SLOTn`:
- **A)** keep only `<BOT_TARGET>` (bots only)
- **B)** expand to `<TARGET>` union (bots + `SECTOR n` + `SELF/NONE`) (recommended)

2) Cooldown/resource introspection:
- **A)** no introspection (bots may waste ticks)
- **B)** add `COOLDOWN_REMAINING` / `SLOT_READY` (recommended)

3) Facing model:
- **A)** no facing
- **B)** derived facing from last successful move
- **C)** explicit `FACE <DIR>` instruction

4) Bot-local registers:
- **A)** none (timers only)
- **B)** add `R1..R4` with minimal ops
