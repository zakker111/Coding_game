# Bot Instruction List (v1)

> This file specifies the **stable v1 bot language**.
> For future-proof planning (lasers/snipers/teleport/grenades/mines/helpers) without bloating the opcode list, see `BotLanguageDesign.md`.

This is a **single-line-per-tick** language:
- Each bot executes **exactly 1 instruction per tick** at its current `pc` (program counter).
- If an instruction is invalid or malformed at runtime, it is treated as `NOP`, and `pc` resets to `1` next tick (per-bot; does not crash the match).
- If a bot’s `HEALTH` reaches `0`, the bot is **dead** and stops being considered by targeting/movement helpers (details in `Ruleset.md`).

> Notation:
> - `<BOT>`: `BOT1|BOT2|BOT3|BOT4`
> - `<TYPE>`: `HEALTH|AMMO|ENERGY`
> - `<BOT_TARGET>`: `<BOT>|TARGET|CLOSEST_BOT|NEAREST_BOT|LOWEST_HEALTH_BOT|WEAKEST_BOT` (subset of `<TARGET>`)
>   - These `*_BOT` values are **inline selectors**: they are passed as arguments to other instructions (e.g. `USE_SLOT1`, `FIRE_BULLET`, `SET_MOVE_TO_BOT`) and are resolved deterministically when that instruction executes.
>   - `NEAREST_BOT` is an alias of `CLOSEST_BOT`.
>   - `WEAKEST_BOT` is an alias of `LOWEST_HEALTH_BOT`.
>   - Contrast: `TARGET_CLOSEST` / `TARGET_LOWEST_HEALTH` are instructions that **write** the target register; `CLOSEST_BOT` / `LOWEST_HEALTH_BOT` are argument tokens that do **not** write any state.
> - `<DIR>`: `UP|DOWN|LEFT|RIGHT`
> - `<SECTOR>`: `1..9`
> - `<ZONE>`: `1..4`
> - `<LOC>`:
>   - `SECTOR <SECTOR>` (sector center)
>   - `SECTOR <SECTOR> ZONE <ZONE>` (zone center)
> - `<TARGET>`: `<BOT_TARGET>|<LOC>|SELF|NONE`
>   - note: an aim-direction target form (`DIR ...`) is **deferred** (only needed if/when directional weapons are introduced), and is **not** part of the stable v1 language; see `BotLanguageDesign.md`.
> - `<SLOT>`: `SLOT1|SLOT2|SLOT3`
> - `<TIMER>`: `T1|T2|T3` (bot-local non-blocking timers)
>
> Where:
> - `BOT1..BOT4` are **match slot identifiers** (deterministic engine ids).
> - Bots may also have **displayName** and **appearance/avatar** metadata in UI/server contexts (for labels, icons, gifs), but scripts still refer to match slots as `BOT1..BOT4`.
> - `TARGET` refers to the bot’s current `targetBotId`.
> - All numeric values are integers.
> - Each bot has 3 slot positions (`SLOT1..SLOT3`); a slot may be **empty**.
> - No duplicate modules among equipped slots in v1.
> - At most **one weapon module** equipped in v1 (weapons in v1: `BULLET | SAW`).

---

## 0) Aliases and determinism (read this first)

This language intentionally has a **small canonical core**, then layers **aliases** on top for readability.

Why aliases exist:
- To keep the opcode list stable (fewer primitives to implement/test).
- To make scripts more beginner-friendly (common words like “nearest” and “weakest”).
- To support future modules via `USE_SLOTn` without needing a new opcode for every module.

Why aliases are safe / deterministic:
- Most aliases are **compile-time name mappings** (“normalization”). For example, `TARGET_NEAREST` and `TARGET_CLOSEST` mean the same thing in v1. A compiler/parser can rewrite the source to a canonical form before execution.
- This mapping is **pure and deterministic**: it does not depend on random numbers, time, or hidden state.
- The few “macro-like” conveniences (notably `MOVE_TO_ZONE` / `SET_MOVE_TO_ZONE`) evaluate `SECTOR()` once when the instruction executes and then behave exactly like the equivalent `...SECTOR <current> ZONE <zone>` form. This still remains deterministic because `SECTOR()` is derived from simulation state.

A useful mental model:
- `TARGET_*` instructions are **verbs**: they update the bot’s target register.
- `*_BOT` tokens (`CLOSEST_BOT`, `LOWEST_HEALTH_BOT`, etc.) are **nouns**: they are inline selectors passed to other instructions and resolved deterministically when that instruction executes.

### 0.1 Source format (comments, blank lines, labels)

The language is line-based for readability, but the engine uses a compiled form.

Preprocessing rules (v1):
- **Blank lines are ignored**.
- **Comment lines are ignored**:
  - any line whose first non-whitespace character is `;` is a comment.
- `LABEL <name>` is a **compile-time directive**, not a runtime instruction:
  - it does **not** consume a tick.
  - it does **not** appear in the executable instruction list.
  - labels are resolved to jump targets during compilation.

Program counter (pc) model (v1):
- `pc` is **1-indexed** into the compiled executable instruction list (after preprocessing).
- For replay/UI debugging, the engine should retain a mapping: `pc -> originalSourceLine`.

Optional (v1, non-semantic): UI metadata directives
- Tools/UIs may read presentation-only metadata from comment lines of the form:
  - `;@name <text>`
  - `;@appearance <value>`
- These lines are still **comments** and must be ignored by the compiler/VM for gameplay.
- Suggested UI-side constraints (planning):
  - `name`: 1–32 chars after trimming; no newlines
  - `appearance`:
    - v1: hex color `#RRGGBB`
    - future: `asset:<id>` or `hash:<contentHash>` (resolved by server/UI)

Rationale:
- Lets a single `.md` / script file carry optional “persona” info (name + avatar) without changing deterministic runtime semantics.

## 1) Control flow

- `LABEL <name>`
- `GOTO <name>`
- `IF <EXPR> GOTO <name>`
  - `<EXPR>` is a **C-like boolean expression** (see §6).
- `IF <EXPR> DO <INSTR>`
  - Convenience form: evaluate `<EXPR>`; if true, execute `<INSTR>`; otherwise do nothing.
  - `<INSTR>` must be a **single non-control instruction** (movement / module action / target selection / timing).
- `NOP`

### 1.1 Timing

#### Blocking delay
- `WAIT <TICKS>`
  - **Blocking** delay: pauses execution for `<TICKS>` ticks.
  - While waiting, the bot does not execute other instructions (equivalent to repeated `NOP`).
  - Deterministic semantics (recommended):
    - on first execution, store `waitRemaining = <TICKS>` and do **not** advance `pc`
    - each subsequent tick, decrement `waitRemaining`
    - when `waitRemaining == 0`, advance `pc` to the next line and continue next tick

#### Non-blocking timers (bot-local)
Non-blocking timers are **per-bot state**, updated deterministically once per simulation tick.
- They are not wall-clock time.
- They do not affect match scheduling; they only affect bot logic.

Update semantics (recommended):
- `SET_TIMER T1 5` sets remaining ticks to `5`.
- At the **end of each simulation tick**, timers decrement by 1 until they reach `0`.
- Setting a timer again overwrites its remaining time.

Instructions:
- `SET_TIMER <TIMER> <TICKS>`
- `CLEAR_TIMER <TIMER>`

---

## 2) Target selection

The bot maintains:
- `targetBotId` (optional)
- `targetPowerupType` (optional)

### 2.0 Target register vs inline selectors (when to use which)

You can pick targets in two different ways:

1) **Write the target register** with `SET_TARGET ...` or `TARGET_*` instructions.
- Use this when you want to “lock in” a bot id and reuse it across multiple future ticks.
- It pairs naturally with `TARGET` (the `<BOT_TARGET>` token) and with `MOVE_TO_TARGET` / `SET_MOVE_TO_TARGET`.
- Example pattern:

```text
TARGET_CLOSEST
IF (SLOT_READY(SLOT1)) DO USE_SLOT1 TARGET
SET_MOVE_TO_TARGET
```

2) **Inline select a bot** by passing `CLOSEST_BOT`, `LOWEST_HEALTH_BOT`, etc. as a `<BOT_TARGET>` argument.
- Use this for one-off actions (`USE_SLOT1 NEAREST_BOT`) where you don’t want to mutate the target register.
- These selectors are resolved deterministically when the instruction executes (ties use the documented “lowest bot id” rule).
- Example pattern:

```text
IF (SLOT_READY(SLOT1)) DO USE_SLOT1 NEAREST_BOT
```

### 2.1 Target a bot

- `SET_TARGET <BOT>`

- `TARGET_CLOSEST` (aliases: `TARGET_NEAREST`, `TARGET_CLOSEST_BOT`)
  - sets `targetBotId` to the **closest alive bot** (ties: lowest bot id)

- `TARGET_LOWEST_HEALTH` (alias: `TARGET_WEAKEST`)
  - sets `targetBotId` to the alive bot with the lowest health (ties: lowest bot id)

- `TARGET_NEXT`
- `TARGET_NEXT_IF_DEAD`

### 2.2 Target a powerup

Bots know where powerups are (global knowledge).

- `TARGET_POWERUP <TYPE>`
  - sets `targetPowerupType = <TYPE>`
- `TARGET_CLOSEST_POWERUP <TYPE>`
  - alias of `TARGET_POWERUP <TYPE>` in v1 (kept for readability)

Invalidation rule (important for "someone else took it"):
- `targetPowerupType` refers to a **type**, not a specific instance.
- When *no* powerup of that type currently exists anywhere in the arena:
  - `MOVE_TO_TARGET` / `MOVE_TO_POWERUP <TYPE>` no-op
  - and at end of tick, `targetPowerupType` is automatically **cleared** (so "target is false" next tick)

Note on targets vs goals:
- `targetPowerupType` is a **type preference** and is only auto-cleared when that type no longer exists.
- `SET_MOVE_TO_POWERUP <TYPE>` is a **navigation goal** and clears when you pick up a powerup of that type.

Priority rule:
- If both a bot target and a powerup target are set, `MOVE_TO_TARGET` uses the bot target first unless you clear it.

### 2.3 Clearing targets

- `CLEAR_TARGET_BOT`
- `CLEAR_TARGET_POWERUP`
- `CLEAR_TARGET` (clears both)

---

## 3) Movement

Movement is **continuous** in arena world units (see `ArenaPlan.md`).

Per tick, a bot may attempt at most **one** movement (either from the executed instruction, or from an active move goal). The maximum travel distance is the bot’s `speedUnitsPerTick` (derived from loadout; see `Ruleset.md` §1.2).

Bots still refer to **named locations** via sectors/zones:
- `SECTOR <SECTOR>` means the **sector center point**.
- `SECTOR <SECTOR> ZONE <ZONE>` means the **zone center point**.

### 3.0 Immediate movement (this tick)

#### Directional movement

- `MOVE <DIR>`
  - Requests movement along a cardinal axis.
  - Desired displacement for the tick:
    - `UP    => ( 0, -speedUnitsPerTick)`
    - `DOWN  => ( 0,  speedUnitsPerTick)`
    - `LEFT  => (-speedUnitsPerTick, 0)`
    - `RIGHT => ( speedUnitsPerTick, 0)`

#### Move toward a location point

These instructions request movement toward a target point. The engine converts this to a cardinal step of length `speedUnitsPerTick` using the deterministic rule below.

- `MOVE_TO_SECTOR <SECTOR>`
  - target point = center of `SECTOR <SECTOR>`.

- `MOVE_TO_SECTOR <SECTOR> ZONE <ZONE>`
  - target point = center of `SECTOR <SECTOR> ZONE <ZONE>`.

Zone-only convenience (current sector; compile-time sugar):
- `MOVE_TO_ZONE <ZONE>`
  - Alias semantics:
    - let `S = SECTOR()` (evaluated once when the instruction executes)
    - behave as if the script had written: `MOVE_TO_SECTOR S ZONE <ZONE>`

#### Move toward a bot / powerup

- `MOVE_TO_BOT <BOT>`
  - Requests movement toward that bot’s current position.
  - If the bot is dead, this is a no-op.

- `MOVE_TO_POWERUP <TYPE>`
  - Requests movement toward the **closest currently-existing** powerup of that type.
  - Tie-breaks (deterministic):
    1) shortest distance (world units; Manhattan; see §6.3)
    2) lowest sector id
    3) sector center before zones
    4) lowest zone id

Aliases:
- `MOVE_TO_CLOSEST_POWERUP <TYPE>` (alias of `MOVE_TO_POWERUP <TYPE>`)

Enemy convenience:
- `MOVE_TO_CLOSEST_BOT`
  - Requests movement toward the closest alive bot (ties: lowest bot id).
- `MOVE_TO_LOWEST_HEALTH_BOT`
  - Requests movement toward the alive bot with the lowest health (ties: lowest bot id).

Walls / arena edge (outer boundary in v1):
- `MOVE_TO_ARENA_EDGE <DIR>`
  - Requests movement toward the outer boundary in that direction.
  - If already touching the edge in that direction, this is a no-op.
- `MOVE_TO_WALL <DIR>` (alias of `MOVE_TO_ARENA_EDGE <DIR>`)

Target-driven movement:
- `MOVE_TO_TARGET`
  - If `targetBotId` is set and alive: behaves like `MOVE_TO_BOT <targetBotId>`
  - Else if `targetPowerupType` is set and such a powerup exists: behaves like `MOVE_TO_POWERUP <targetPowerupType>`
  - Else: no-op

#### Deterministic “move toward point” step rule (v1)

Given current bot position `p = (x,y)` and target point `t = (tx,ty)`:
- Let `dx = tx - x`, `dy = ty - y`.
- If `dx == 0 && dy == 0`: no movement.
- Otherwise choose a cardinal direction:
  1) If `abs(dx) > abs(dy)`: move horizontally toward the target (`RIGHT` if `dx>0` else `LEFT`).
  2) Else if `abs(dy) > abs(dx)`: move vertically toward the target (`DOWN` if `dy>0` else `UP`).
  3) Else (tie): move horizontally (same as rule 1).

Then apply the same displacement rules as `MOVE <DIR>`.

### 3.1 Persistent navigation goals (move while doing other actions)

These instructions set a **movement goal** in bot state. When a goal is set, the bot will attempt to move toward that goal **every tick**, including ticks where its instruction is something else (shooting, targeting, timers, etc.).

Instructions:
- `SET_MOVE_TO_SECTOR <SECTOR>`
- `SET_MOVE_TO_SECTOR <SECTOR> ZONE <ZONE>`
- `SET_MOVE_TO_ZONE <ZONE>`
  - Alias semantics:
    - let `S = SECTOR()` (evaluated once when the instruction executes)
    - behave as if the script had written: `SET_MOVE_TO_SECTOR S ZONE <ZONE>`
- `SET_MOVE_TO_BOT <BOT_TARGET>`
  - If `<BOT_TARGET>` is a dynamic selector (`CLOSEST_BOT`/`NEAREST_BOT`/`LOWEST_HEALTH_BOT`/`WEAKEST_BOT`), it is re-resolved each tick.
  - If `<BOT_TARGET>` is `TARGET`, it follows your current `targetBotId`.
  - If `<BOT_TARGET>` is a specific bot id (`BOT1..BOT4`), it follows that bot until it dies.
- `SET_MOVE_TO_POWERUP <TYPE>`
- `SET_MOVE_TO_TARGET`
- `CLEAR_MOVE`

Resolution rules (recommended):
- Each tick, the engine determines one `moveRequest` per bot:
  - if the bot executed an **immediate movement** instruction this tick (§3.0), use that movement
  - else if the bot has a **movement goal** active, derive a movement request from the goal
  - else: no movement

Goal completion:
- For goals with a fixed point target (sector center / zone center): clear when the bot reaches the point.
  - recommended engine behavior: if the remaining Manhattan distance to the goal point is `<= speedUnitsPerTick`, the engine may snap the bot to the exact target point and clear the goal.
- `SET_MOVE_TO_POWERUP`:
  - each tick, the goal re-resolves to the closest currently-existing powerup of that type
  - clears when the bot picks up a powerup of that type
  - clears if no such powerup exists (the goal becomes invalid)
- `SET_MOVE_TO_BOT` / `SET_MOVE_TO_TARGET`: clears when the resolved target bot is dead/missing.

Collision note:
- Movement requests can be clamped/canceled by walls or other bots (see `Ruleset.md` §1.2).
- Bump events (`BUMPED_WALL*`, `BUMPED_BOT*`) apply regardless of whether movement came from an immediate move or a movement goal.

---

## 4) Module actions (module-type)

> If the required module is not equipped, the instruction does nothing.

Future-proofing note (planning):
- Conceptually, these module-type instructions (`FIRE_BULLET`, `SAW ON/OFF`, `SHIELD ON/OFF`) are **syntax sugar** over the stable slot primitives `USE_SLOTn` / `STOP_SLOTn`.
- In v1 this is unambiguous because v1 forbids duplicate modules in a loadout.
- If a future ruleset ever allows duplicates, module-type spellings that don’t specify a slot should become a **compile-time error** (or be removed in favor of explicit `USE_SLOTn`).

- `FIRE_BULLET <BOT_TARGET>`
  - Ammo-based. If `ammo == 0`, does nothing.
  - `<BOT_TARGET>` can be:
    - a specific bot id: `BOT1..BOT4`
    - `TARGET` (your current `targetBotId`; if invalid/dead, no-op)
    - `CLOSEST_BOT` / `NEAREST_BOT` (closest alive bot; ties: lowest bot id)
    - `LOWEST_HEALTH_BOT` / `WEAKEST_BOT` (lowest-health alive bot; ties: lowest bot id)
  - Bullets are continuous projectiles; bullets can hit **any bot** they collide with (32×32 bot hitbox), not only the chosen target.

- `SAW ON`
- `SAW OFF`
  - Energy-based. When ON, drains energy per tick; auto-OFF at `energy == 0`.

- `SHIELD ON`
- `SHIELD OFF`
  - Energy-based. When ON, drains energy per tick; auto-OFF at `energy == 0`.
  - Exact mitigation/reflect behavior is intentionally deferred.

> Armor is passive (no instruction). It provides additional damage reduction on top of the bot’s base armor (exact math deferred; see `Ruleset.md`).

---

## 5) Module actions (slot-addressed)

Slot-addressed actions are the **future-proof** layer for adding new modules without growing the opcode set.

### 5.1 Generic slot use (recommended)

- `USE_SLOT1 <TARGET>`
- `USE_SLOT2 <TARGET>`
- `USE_SLOT3 <TARGET>`

Semantics:
- Triggers the **primary action** of whatever module is equipped in that slot.
- Target is passed to the module:
  - bot targets: `BOT1..BOT4`, `TARGET`, `CLOSEST_BOT`/`NEAREST_BOT`, `LOWEST_HEALTH_BOT`/`WEAKEST_BOT`
  - location targets:
    - `SECTOR <SECTOR>` (sector center point)
    - `SECTOR <SECTOR> ZONE <ZONE>` (zone center point)
  - `SELF` / `NONE`
- Inline selector targets (`CLOSEST_BOT`, `WEAKEST_BOT`, etc.) are resolved deterministically when `USE_SLOTn` executes; they do not modify the target register.
- Modules may ignore targets that are not relevant.
- If a module requires a different target kind, using the wrong target kind is a deterministic no-op (no cost, no cooldown) and should emit a replay/debug reason such as `INVALID_TARGET_KIND`.

To turn off toggles via slot:
- `STOP_SLOT1`
- `STOP_SLOT2`
- `STOP_SLOT3`

`STOP_SLOTn` stable contract (v1+):
- “Request to stop/cancel whatever the module in this slot is currently doing.”
- For toggle modules (SAW/SHIELD): turns the module off.
- For passive or instant modules: no-op.
- For future modules (beams, burst queues, deployables, helpers): the module defines what “stop” means, but the call must remain deterministic and should emit a replay/debug reason if it had no effect.

### 5.2 Compatibility aliases (v1)

- `FIRE_SLOT1 <TARGET>` (alias of `USE_SLOT1 <TARGET>`)
- `FIRE_SLOT2 <TARGET>` (alias of `USE_SLOT2 <TARGET>`)
- `FIRE_SLOT3 <TARGET>` (alias of `USE_SLOT3 <TARGET>`)

Rationale:
- `USE_SLOTn` is the **canonical** future-proof primitive (“use whatever module is equipped here”).
- `FIRE_SLOTn` is kept as a readability/legacy spelling for weapon-heavy scripts and older examples.
- These are intended to be **compile-time aliases** (the parser can rewrite `FIRE_SLOTn` to `USE_SLOTn`). They are deterministic because they do not introduce new runtime behavior.

Current v1 module behavior when used via `USE_SLOTn` / `FIRE_SLOTn`:
- If slot contains **BULLET**: fires only at bot targets (`<BOT_TARGET>`). If the provided `<TARGET>` is not a bot target, it is a deterministic no-op (`INVALID_TARGET_KIND`).
- If slot contains **SAW**: same as `SAW ON` (target ignored).
- If slot contains **SHIELD**: same as `SHIELD ON` (target ignored).
- If slot contains **ARMOR**: no-op (passive).

Optional convenience:
- `FIRE_TARGET <SLOT>`
  - Uses the given slot against the current `targetBotId`.
  - If no valid bot target is set/alive, does nothing.
  - If the current target is a powerup, this does nothing (we do not "shoot powerups" in v1).

---

## 6) Expressions (for `IF ...`)

`IF` conditions use a small, deterministic, **C-like** expression language.

### 6.1 Syntax

Operators:
- comparisons: `== != < <= > >=`
- boolean: `&& || !`
- grouping: `(` `)`

Rules:
- All numeric values are **integers**.
- `&&` and `||` are **short-circuiting** and evaluated left-to-right.
- All functions listed below are **pure** (no side effects).

### 6.2 Built-in values (identifiers)

Self resources:
- `HEALTH` (0..100)
- `AMMO` (0..100)
- `ENERGY` (0..100)

Target convenience:
- `TARGET_HEALTH`
  - If there is **no valid target bot**, this evaluates to `0`.
  - Use `HAS_TARGET_BOT()` when you need to ensure the target exists.

### 6.3 Built-in functions

Bot / target state:
- `HAS_TARGET_BOT()` → bool
  - true iff `targetBotId` is set and the target bot is alive
- `BOT_ALIVE(<BOT>)` → bool

Location (derived from continuous position):
- `SECTOR()` → int
  - current sector id (1..9), derived from the bot’s current `(x, y)`
  - sector regions are defined in `ArenaPlan.md`
  - if the bot lies exactly on a boundary, ties must be broken deterministically (recommended: lowest sector id)
- `ZONE()` → int
  - current zone id (1..4), derived from the bot’s current `(x, y)` within its current sector
  - zone regions are defined in `ArenaPlan.md` (each sector is a 2×2 partition into zones)
  - if the bot lies exactly on a boundary, ties must be broken deterministically (recommended: lowest zone id)
- `IN_ZONE(<ZONE>)` → bool
  - Alias of: `ZONE() == <ZONE>`

Sector proximity:
- `BOT_IN_SAME_SECTOR(<BOT>)` → bool
- `BOT_IN_ADJ_SECTOR(<BOT>)` → bool

Distances (world units; Manhattan)

All `DIST_TO_*` functions return an integer Manhattan distance in world units:
- `MANHATTAN(a, b) = abs(ax - bx) + abs(ay - by)`

Unless otherwise stated, distances are measured between entity **centers** (bots/powerups) or between the bot center and a named target point (sector/zone centers).

- `DIST_TO_BOT(<BOT>)` → int
- `DIST_TO_TARGET_BOT()` → int
  - if no valid target bot exists, returns `999`
- `DIST_TO_CLOSEST_BOT()` → int
  - distance to the closest alive bot (ties: lowest bot id); returns `999` if none

Location distances:
- `DIST_TO_SECTOR(<SECTOR>)` → int
  - Manhattan distance to the sector center point
- `DIST_TO_SECTOR_ZONE(<SECTOR>, <ZONE>)` → int
  - Manhattan distance to the zone center point

Powerups (global knowledge):
- `POWERUP_EXISTS(<TYPE>)` → bool
- `DIST_TO_CLOSEST_POWERUP(<TYPE>)` → int
  - if no powerup of that type exists, returns `999`
- `HAS_TARGET_POWERUP()` → bool
  - true iff `targetPowerupType` is set and at least one powerup of that type currently exists

Powerups (by location):
- `POWERUP_IN_SECTOR(<TYPE>, <SECTOR>)` → bool
  - true if a powerup of that type exists anywhere in that sector (center or any zone)
- `POWERUP_IN_SECTOR_CENTER(<TYPE>, <SECTOR>)` → bool
  - true if a powerup of that type exists at the sector center
- `POWERUP_IN_ZONE(<TYPE>, <SECTOR>, <ZONE>)` → bool
  - true if a powerup of that type exists in that sector+zone

Powerups (local convenience):
- `POWERUP_IN_SAME_SECTOR(<TYPE>)` → bool
- `POWERUP_IN_SAME_ZONE(<TYPE>)` → bool

Bullets/projectiles:
- `BULLET_IN_SAME_SECTOR()` → bool
- `BULLET_IN_ADJ_SECTOR()` → bool

Arena edges / walls (outer boundary in v1):
- `DIST_TO_ARENA_EDGE(UP|DOWN|LEFT|RIGHT)` → int
  - returns the distance in **world units** from the bot’s collision box to the outer wall in that direction
  - `0` means you are currently touching the edge
- `DIST_TO_WALL(UP|DOWN|LEFT|RIGHT)` → int (alias of `DIST_TO_ARENA_EDGE`)

Bumps (read last tick result):
- `BUMPED_WALL()` → bool
- `BUMPED_WALL_DIR(UP|DOWN|LEFT|RIGHT)` → bool

- `BUMPED_BOT()` → bool
- `BUMPED_BOT_IS(<BOT>)` → bool
- `BUMPED_BOT_DIR(UP|DOWN|LEFT|RIGHT)` → bool

Bump semantics:
- Bump flags represent the bot’s **most recent bump event**.
- Bump flags are readable as a **"last tick" result**:
  - collisions are detected/resolved during tick `t`
  - bump flags are readable by the bot when it executes tick `t+1`
- Bump state resets after it is exposed to the bot (and/or written into the replay).
- Bot-to-bot collision bumps should apply to **both** bots involved:
  - mover sees the direction it moved
  - the other bot sees the opposite direction

Timers (bot-local, non-blocking):
- `TIMER_REMAINING(<TIMER>)` → int
  - returns remaining ticks (0 means done)
- `TIMER_ACTIVE(<TIMER>)` → bool
  - true iff remaining ticks > 0
- `TIMER_DONE(<TIMER>)` → bool
  - true iff remaining ticks == 0

Slot/module state:
- `HAS_MODULE(<SLOT>)` → bool
  - true iff that slot has a module equipped
- `COOLDOWN_REMAINING(<SLOT>)` → int
  - remaining ticks of cooldown (`0` means ready)
- `SLOT_READY(<SLOT>)` → bool
  - true iff:
    - the slot has a module
    - cooldown is `0`
    - the bot has enough ammo/energy to pay the module’s activation cost (vector)
- `SLOT_ACTIVE(<SLOT>)` → bool
  - true iff the module in that slot is currently active (toggle modules)

### 6.4 Common patterns

"Powerup close" should be expressed using distance:
- close = within some small number of **world units** (pick a threshold based on `speedUnitsPerTick`)

```text
; example threshold assuming speedUnitsPerTick = 16
IF (POWERUP_EXISTS(HEALTH) && DIST_TO_CLOSEST_POWERUP(HEALTH) <= 16) GOTO GET_HP
```

"If a specific zone has a specific powerup, go there":

```text
IF (POWERUP_IN_ZONE(HEALTH, 1, 2)) DO MOVE_TO_SECTOR 1 ZONE 2
```

"React to collisions" should use bump sensors from the previous tick:

```text
IF (BUMPED_BOT()) DO SAW ON
IF (BUMPED_WALL()) DO MOVE RIGHT
```

---

## 7) Example scripts

For longer, "real bot" scripts (used as built-in examples / Workshop defaults), see:
- `examples/bot0.md` — Powerup Seeker (starter)
- `examples/bot1.md` — Zone Patrol Shooter (BULLET)
- `examples/bot2.md` — Chaser Shooter (BULLET)
- `examples/bot3.md` — Corner Bunker (BULLET+ARMOR)
- `examples/bot4.md` — Saw Rusher (SAW+SHIELD)

These example scripts intentionally use only the v1 instructions and expression functions defined in this document.

### Example A — If low health, go to health powerup

```text
LABEL LOOP
IF (HEALTH < 10 && POWERUP_EXISTS(HEALTH)) GOTO HEAL
GOTO LOOP

LABEL HEAL
TARGET_POWERUP HEALTH
MOVE_TO_TARGET
GOTO LOOP
```

### Example B — If health powerup is close, move to it

```text
LABEL LOOP
; example threshold assuming speedUnitsPerTick = 16
IF (POWERUP_EXISTS(HEALTH) && DIST_TO_CLOSEST_POWERUP(HEALTH) <= 16) DO MOVE_TO_POWERUP HEALTH
GOTO LOOP
```

### Example C — If enemy is close, chase it

```text
LABEL LOOP
; example threshold assuming speedUnitsPerTick = 16
IF (DIST_TO_CLOSEST_BOT() <= 16) DO MOVE_TO_CLOSEST_BOT
GOTO LOOP
```

### Example D — If bumped another bot, turn SAW on for 5 ticks (non-blocking timer)

```text
LABEL LOOP

; when we bump a bot, start a 5-tick saw window
IF (BUMPED_BOT()) DO SAW ON
IF (BUMPED_BOT()) DO SET_TIMER T1 5

; keep doing other logic here (move, shoot, etc.)
MOVE_TO_CLOSEST_BOT

; when timer expires, turn saw off
IF (TIMER_DONE(T1)) DO SAW OFF

GOTO LOOP
```

### Example E — If bumped another bot, turn SAW on for 5 ticks (blocking WAIT)

```text
LABEL LOOP
IF (BUMPED_BOT()) GOTO SAW_BURST
GOTO LOOP

LABEL SAW_BURST
SAW ON
WAIT 5
SAW OFF
GOTO LOOP
```

### Example F — If too close to a wall, move away

```text
LABEL LOOP
IF (DIST_TO_WALL(LEFT) == 0) DO MOVE RIGHT
IF (DIST_TO_WALL(RIGHT) == 0) DO MOVE LEFT
IF (DIST_TO_WALL(UP) == 0) DO MOVE DOWN
IF (DIST_TO_WALL(DOWN) == 0) DO MOVE UP
GOTO LOOP
```

### Example G — Set a move goal once, keep shooting while moving

```text
; start navigating to sector 1 center
SET_MOVE_TO_SECTOR 1

LABEL LOOP

; keep firing when ready, even while auto-moving
IF (SLOT_READY(SLOT1)) DO USE_SLOT1 NEAREST_BOT

; if we bumped a bot last tick, turn saw on
IF (BUMPED_BOT()) DO SAW ON

GOTO LOOP
```

### Example H — Zone-to-zone movement inside the current sector

Because movement is cardinal-only in v1, diagonal zone-to-zone moves (e.g. 2→3) will pass through another zone.
The simplest reliable "patrol" pattern is an axis-aligned loop:

```text
LABEL LOOP

; patrol zones 1→2→4→3→1 inside the current sector
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 1

GOTO LOOP
```

### Example I — If low HP and a health powerup exists, move toward it

```text
LABEL LOOP
IF (HEALTH < 10 && POWERUP_EXISTS(HEALTH)) DO MOVE_TO_POWERUP HEALTH
GOTO LOOP
```

### Example J — Fire at the nearest bot (no explicit targeting register)

```text
LABEL LOOP
IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 NEAREST_BOT
GOTO LOOP
```

### Example K — Fire at the weakest bot (lowest health)

```text
LABEL LOOP
IF (SLOT_READY(SLOT1)) DO USE_SLOT1 WEAKEST_BOT
GOTO LOOP
```
