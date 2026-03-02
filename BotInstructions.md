# Bot Instruction List (v1)

This is a **single-line-per-tick** language:
- Each bot executes **exactly 1 instruction per tick** at its current `pc` (program counter).
- If an instruction is invalid or malformed at runtime, it is treated as `NOP`, and `pc` resets to `1` next tick (per-bot; does not crash the match).
- If a bot’s `HEALTH` reaches `0`, the bot is **dead** and stops being considered by targeting/movement helpers (details in `Ruleset.md`).

> Notation:
> - `<BOT>`: `BOT1|BOT2|BOT3|BOT4`
> - `<TYPE>`: `HEALTH|AMMO|ENERGY`
> - `<BOT_TARGET>`: `<BOT>|CLOSEST_BOT|TARGET`
> - `<DIR>`: `UP|DOWN|LEFT|RIGHT`
> - `<SECTOR>`: `1..9`
> - `<ZONE>`: `1..9` (alias of sectors in v1)
> - `<SLOT>`: `SLOT1|SLOT2|SLOT3`
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
  - `<INSTR>` must be a **single non-control instruction** (movement / module action / target selection).

Timing:
- `WAIT <TICKS>`
  - Pauses execution for `<TICKS>` ticks.
  - While waiting, the bot does not execute other instructions (equivalent to repeated `NOP`).
  - Deterministic semantics (recommended):
    - on first execution, store `waitRemaining = <TICKS>` and do **not** advance `pc`
    - each subsequent tick, decrement `waitRemaining`
    - when `waitRemaining == 0`, advance `pc` to the next line and continue next tick

- `NOP`

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
- If no powerup of that type exists, the powerup target remains set but `MOVE_TO_TARGET` / `MOVE_TO_POWERUP` will no-op until one exists.
- If both a bot target and powerup target are set, `MOVE_TO_TARGET` uses the bot target first unless you clear it.

### 2.3 Clearing targets

- `CLEAR_TARGET_BOT`
- `CLEAR_TARGET_POWERUP`
- `CLEAR_TARGET` (clears both)

---

## 3) Movement

- `MOVE <DIR>`
- `MOVE_TO_SECTOR <SECTOR>`
- `MOVE_TO_ZONE <ZONE>` (alias of `MOVE_TO_SECTOR` in v1)

Bot chasing:
- `MOVE_TO_BOT <BOT>`
  - Moves one step toward that bot.
  - If the bot is dead, this is a no-op.

Powerups:
- `MOVE_TO_POWERUP <TYPE>`
  - Moves one step toward the **closest** powerup of that type.
  - Deterministic ties: smallest sector id.
- `MOVE_TO_CLOSEST_POWERUP <TYPE>` (alias of `MOVE_TO_POWERUP <TYPE>`)

Enemy convenience (single-instruction):
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

These are optional but intended to be supported.

- `FIRE_SLOT1 <BOT_TARGET>`
- `FIRE_SLOT2 <BOT_TARGET>`
- `FIRE_SLOT3 <BOT_TARGET>`

Semantics:
- If slot contains **BULLET**: fires at `<BOT_TARGET>`.
- If slot contains **SAW**: same as `SAW ON` (target ignored).
- If slot contains **SHIELD**: same as `SHIELD ON` (target ignored).
- If slot contains **ARMOR**: no-op (passive).

To turn off toggles via slot:
- `STOP_SLOT1`
- `STOP_SLOT2`
- `STOP_SLOT3`

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
- `DIST_TO_ZONE(<ZONE>)` → int (alias of `DIST_TO_SECTOR` in v1)

Powerups (global knowledge):
- `POWERUP_EXISTS(<TYPE>)` → bool
- `DIST_TO_CLOSEST_POWERUP(<TYPE>)` → int
  - if no powerup of that type exists, returns `999`

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

### Example D — If bumped another bot, turn SAW on for 5 ticks

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

### Example E — If too close to a wall, move away

```text
LABEL LOOP
IF (DIST_TO_WALL(LEFT) == 0) DO MOVE RIGHT
IF (DIST_TO_WALL(RIGHT) == 0) DO MOVE LEFT
IF (DIST_TO_WALL(UP) == 0) DO MOVE DOWN
IF (DIST_TO_WALL(DOWN) == 0) DO MOVE UP
GOTO LOOP
```
