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
> - `<BOT_TARGET>`: `<BOT>|CLOSEST_BOT|TARGET` (subset of `<TARGET>`)
> - `<TARGET>`: `<BOT_TARGET>|SECTOR <SECTOR>|SELF|NONE`
> - `<DIR>`: `UP|DOWN|LEFT|RIGHT`
> - `<SECTOR>`: `1..9`
> - Zones: each sector contains **zones `1..4`** (2×2). Zones are used for deterministic placement/collision but are **not addressable** by bot instructions in v1.
> - `<SLOT>`: `SLOT1|SLOT2|SLOT3`
> - `<TIMER>`: `T1|T2|T3` (bot-local non-blocking timers)
>
> Where:
> - `BOT1..BOT4` are **match slot identifiers** (deterministic engine ids).
> - Bots may also have a **display name** in UI/server contexts, but scripts still refer to match slots as `BOT1..BOT4`.
> - `TARGET` refers to the bot’s current `targetBotId`.
> - All numeric values are integers.
> - No duplicate modules in slots in v1.

---

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

### 2.1 Target a bot

- `SET_TARGET <BOT>`
- `TARGET_CLOSEST` (alias: `TARGET_CLOSEST_BOT`)
- `TARGET_LOWEST_HEALTH`
  - sets `targetBotId` to the alive bot with the lowest health (ties: lowest bot id)
- `TARGET_NEXT`
- `TARGET_NEXT_IF_DEAD`

### 2.2 Target a powerup

Bots know where powerups are (global knowledge).

- `TARGET_POWERUP <TYPE>`
  - sets `targetPowerupType = <TYPE>`
- `TARGET_CLOSEST_POWERUP <TYPE>`
  - alias of `TARGET_POWERUP <TYPE>` in v1 (kept for readability)

Notes:
- If no powerup of that type exists, the target is treated as **invalid**:
  - `MOVE_TO_TARGET` / `MOVE_TO_POWERUP` will no-op
  - at the end of the tick, `targetPowerupType` is automatically **cleared** (so "target is false" next tick)
- If both a bot target and powerup target are set, `MOVE_TO_TARGET` uses the bot target first unless you clear it.

### 2.3 Clearing targets

- `CLEAR_TARGET_BOT`
- `CLEAR_TARGET_POWERUP`
- `CLEAR_TARGET` (clears both)

---

## 3) Movement

### 3.0 One-step movement (immediate)

These instructions attempt **exactly one** sector step during the movement phase of the current tick.

- `MOVE <DIR>`
- `MOVE_TO_SECTOR <SECTOR>`

Bot chasing:
- `MOVE_TO_BOT <BOT>`
  - Moves one step toward that bot.
  - If the bot is dead, this is a no-op.

Powerups:
- `MOVE_TO_POWERUP <TYPE>`
  - Moves one step toward the **closest** powerup of that type.
  - Deterministic ties: smallest sector id.
- `MOVE_TO_CLOSEST_POWERUP <TYPE>` (alias of `MOVE_TO_POWERUP <TYPE>`)

Enemy convenience:
- `MOVE_TO_CLOSEST_BOT`
  - Moves one step toward the closest **alive** bot.
  - Ties: lowest bot id.
- `MOVE_TO_LOWEST_HEALTH_BOT`
  - Moves one step toward the alive bot with the lowest health.
  - Ties: lowest bot id.

Walls / arena edge (v1 = outer boundary only):
- `MOVE_TO_ARENA_EDGE <DIR>`
  - Moves one step toward the outer boundary in that direction.
- `MOVE_TO_WALL <DIR>` (alias of `MOVE_TO_ARENA_EDGE <DIR>`)

Target-driven movement:
- `MOVE_TO_TARGET`
  - If `targetBotId` is set and alive: behaves like `MOVE_TO_BOT <targetBotId>`
  - Else if `targetPowerupType` is set and such a powerup exists: behaves like `MOVE_TO_POWERUP <targetPowerupType>`
  - Else: no-op

### 3.1 Persistent navigation goals (move while doing other actions)

These instructions set a **movement goal** in bot state. When a goal is set, the bot will attempt to move **1 step per tick** toward that goal **even on ticks where its instruction is something else** (shooting, targeting, timers, etc.).

This is the mechanism that enables: “move to sector 1 until I say otherwise, and keep shooting while moving”.

Instructions:
- `SET_MOVE_TO_SECTOR <SECTOR>`
- `SET_MOVE_TO_BOT <BOT_TARGET>`
- `SET_MOVE_TO_POWERUP <TYPE>`
- `SET_MOVE_TO_TARGET`
- `CLEAR_MOVE`

Resolution rules (recommended):
- Each tick, the engine determines one `moveRequest` per bot:
  - if the bot executed an **immediate movement** instruction this tick (§3.0), use that movement.
  - else if the bot has a **movement goal** active, derive a movement step from the goal.
  - else: no movement.
- Movement goals are evaluated deterministically (same path tie-break rules as `MOVE_TO_*`).

Goal completion:
- `SET_MOVE_TO_SECTOR`: clears automatically when the bot reaches that sector.
- `SET_MOVE_TO_POWERUP`:
  - each tick, the goal re-resolves to the **closest currently-existing** powerup of that type
  - clears when the bot picks up a powerup of that type
  - clears if no such powerup exists (the goal becomes invalid)
- `SET_MOVE_TO_BOT` / `SET_MOVE_TO_TARGET`: clears when the resolved target bot is dead/missing.

Notes:
- `CLEAR_MOVE` stops automatic movement.
- Bump events (`BUMPED_WALL*`, `BUMPED_BOT*`) apply regardless of whether movement came from an immediate move or a movement goal.

---

## 4) Module actions (module-type)

> If the required module is not equipped, the instruction does nothing.

- `FIRE_BULLET <BOT_TARGET>`
  - Ammo-based. If `ammo == 0`, does nothing.
  - Bullets are slow projectiles; bullets can hit **any bot** in the sector they enter (not only the chosen target).

- `SAW ON`
- `SAW OFF`
  - Energy-based. When ON, drains energy per tick; auto-OFF at `energy == 0`.

- `SHIELD ON`
- `SHIELD OFF`
  - Energy-based. When ON, drains energy per tick; auto-OFF at `energy == 0`.
  - Exact mitigation/reflect behavior is intentionally deferred.

> Armor is passive (no instruction). If equipped, it reduces incoming damage (exact math deferred).

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
  - bot targets: `BOT1..BOT4`, `TARGET`, `CLOSEST_BOT`
  - location targets: `SECTOR <SECTOR>`
  - `SELF` / `NONE`
- Modules may ignore targets that are not relevant.
- If a module requires a different target kind, using the wrong target kind is a no-op.

To turn off toggles via slot:
- `STOP_SLOT1`
- `STOP_SLOT2`
- `STOP_SLOT3`

### 5.2 Compatibility aliases (v1)

- `FIRE_SLOT1 <TARGET>` (alias of `USE_SLOT1 <TARGET>`)
- `FIRE_SLOT2 <TARGET>` (alias of `USE_SLOT2 <TARGET>`)
- `FIRE_SLOT3 <TARGET>` (alias of `USE_SLOT3 <TARGET>`)

Current v1 module behavior when used via `USE_SLOTn` / `FIRE_SLOTn`:
- If slot contains **BULLET**: fires at `<BOT_TARGET>` (location targets are ignored in v1).
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

Sector proximity:
- `BOT_IN_SAME_SECTOR(<BOT>)` → bool
- `BOT_IN_ADJ_SECTOR(<BOT>)` → bool

Distances (Manhattan distance over sectors):
- `DIST_TO_BOT(<BOT>)` → int
- `DIST_TO_TARGET_BOT()` → int
  - if no valid target bot exists, returns `999`
- `DIST_TO_CLOSEST_BOT()` → int
  - distance to the closest alive bot (ties: lowest bot id); returns `999` if none
- `DIST_TO_SECTOR(<SECTOR>)` → int

Powerups (global knowledge):
- `POWERUP_EXISTS(<TYPE>)` → bool
- `DIST_TO_CLOSEST_POWERUP(<TYPE>)` → int
  - if no powerup of that type exists, returns `999`
- `HAS_TARGET_POWERUP()` → bool
  - true iff `targetPowerupType` is set and at least one powerup of that type currently exists

Powerups (local convenience):
- `POWERUP_IN_SAME_SECTOR(<TYPE>)` → bool
- `POWERUP_IN_ADJ_SECTOR(<TYPE>)` → bool

Bullets/projectiles:
- `BULLET_IN_SAME_SECTOR()` → bool
- `BULLET_IN_ADJ_SECTOR()` → bool

Arena edges / walls (outer boundary in v1):
- `DIST_TO_ARENA_EDGE(UP|DOWN|LEFT|RIGHT)` → int
  - returns how many sector-steps to the outer wall in that direction
  - `0` means you are currently at the edge
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
- close = **same or adjacent sector**

```text
IF (POWERUP_EXISTS(HEALTH) && DIST_TO_CLOSEST_POWERUP(HEALTH) <= 1) GOTO GET_HP
```

"React to collisions" should use bump sensors from the previous tick:

```text
IF (BUMPED_BOT()) DO SAW ON
IF (BUMPED_WALL()) DO MOVE RIGHT
```

---

## 7) Example scripts

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

### Example B — One-line form: if health powerup is close, move to it

```text
LABEL LOOP
IF (POWERUP_EXISTS(HEALTH) && DIST_TO_CLOSEST_POWERUP(HEALTH) <= 1) DO MOVE_TO_POWERUP HEALTH
GOTO LOOP
```

### Example C — If enemy is close, chase it

```text
LABEL LOOP
IF (DIST_TO_CLOSEST_BOT() <= 1) DO MOVE_TO_CLOSEST_BOT
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

This demonstrates the “move to a sector until told otherwise” style.

```text
; start navigating to sector 1
SET_MOVE_TO_SECTOR 1

LABEL LOOP

; keep firing when ready, even while auto-moving
IF (SLOT_READY(SLOT1)) DO USE_SLOT1 CLOSEST_BOT

; if we bumped a bot last tick, turn saw on
IF (BUMPED_BOT()) DO SAW ON

GOTO LOOP
```
