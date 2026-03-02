### 6.6 Target registers

Bot target:
- `HAS_TARGET_BOT()`
- `TARGET_ALIVE()`
- `TARGET_IN_SAME_SECTOR()`
- `TARGET_IN_ADJ_SECTOR()`

Powerup target:
- `HAS_TARGET_POWERUP()`
- `TARGET_POWERUP_TYPE_IS(<TYPE>)`

### 6.7 Collision / bump sensors

Bots can react to bump/collision outcomes (for example: "if I bumped a wall on the left, turn shield on").</old_code><new_code>### 6.7 Collision / bump sensors

Bots can react to bump/collision outcomes (for example: "if I bumped a wall on the left, turn shield on").

These sensors refer to the bot’s **most recent bump event** (typically caused by its own movement attempt).

Because the bot executes only one line per tick, bump information is most useful as a **"last tick" result**:
- collisions are detected/resolved during tick `t`
- bump flags are readable by the bot when it executes tick `t+1`

The engine should reset bump state each tick after it is exposed to the bot and/or written into the replay.

Walls:
- `BUMPED_WALL()`
- `BUMPED_WALL_DIR(UP|DOWN|LEFT|RIGHT)`

Bots:
- `BUMPED_BOT()`
- `BUMPED_BOT_IS(<BOT>)`
- `BUMPED_BOT_DIR(UP|DOWN|LEFT|RIGHT)`

Notes / open rules (to finalize in the ruleset):
- Define exactly when a “bump into another bot” occurs (attempted move into occupied sector vs collision inside a sector).
- If multiple bumps could occur in one tick, define which one is recorded (recommended: only record the bump caused by the bot’s own movement instruction; otherwise pick a deterministic priority order).
</old_code><new_code># Bot Instruction List (v1)

This is a **single-line-per-tick** language:
- Each bot executes **exactly 1 instruction per tick** at its current `pc` (program counter).
- If an instruction is invalid or malformed at runtime, it is treated as `NOP`, and `pc` resets to `1` next tick (per-bot; does not crash the match).

> Notation:
> - `<BOT>`: `BOT1|BOT2|BOT3|BOT4`
> - `<TYPE>`: `HEALTH|AMMO|ENERGY`
> - `<BOT_TARGET>`: `<BOT>|CLOSEST_BOT|TARGET`
> - `<DIR>`: `UP|DOWN|LEFT|RIGHT`
> - `<SECTOR>`: `1..9`
> - `<SLOT>`: `SLOT1|SLOT2|SLOT3`
>
> Where:
> - `TARGET` refers to the bot’s current `targetBotId`.
> - No duplicate modules in slots in v1.

---

## 1) Control flow

- `LABEL <name>`
- `GOTO <name>`
- `IF <PREDICATE> GOTO <name>`
- `NOP`

---

## 2) Target selection

The bot maintains:
- `targetBotId` (optional)
- `targetPowerupType` (optional)

### 2.1 Target a bot

- `SET_TARGET <BOT>`
- `TARGET_CLOSEST` (alias: `TARGET_CLOSEST_BOT`)
- `TARGET_LOWEST_HEALTH` (sets `targetBotId` to the alive bot with lowest health; ties -> lowest bot id)
- `TARGET_NEXT`
- `TARGET_NEXT_IF_DEAD`

### 2.2 Target a powerup

Bots know where powerups are (global knowledge).

- `TARGET_POWERUP <TYPE>`
  - Sets `targetPowerupType = <TYPE>`
- `TARGET_CLOSEST_POWERUP <TYPE>` (optional alias)
  - Same outcome as `TARGET_POWERUP` in v1 (kept for readability).

Notes:
- If no powerup of that type exists, the powerup target remains set but `MOVE_TO_TARGET` will no-op until one exists.
- If both a bot target and powerup target are set, `MOVE_TO_TARGET` uses the bot target first unless you clear it.

# Bot Instruction List (v1 draft)

This is a **single-line-per-tick** language:
- Each bot executes **exactly 1 instruction per tick** at its current `pc` (program counter).
- If an instruction is invalid or malformed at runtime, it is treated as `NOP`, and `pc` resets to `1` next tick (per-bot; does not crash the match).

> Notation:
> - `<BOT>`: `BOT1|BOT2|BOT3|BOT4`
> - `<TYPE>`: `HEALTH|AMMO|ENERGY`
> - `<BOT_TARGET>`: `<BOT>|CLOSEST_BOT|TARGET`
> - `<DIR>`: `UP|DOWN|LEFT|RIGHT`
> - `<SECTOR>`: `1..9`
> - `<SLOT>`: `SLOT1|SLOT2|SLOT3` (used only in `FIRE_TARGET` form)
>
> Where:
> - `TARGET` refers to the bot’s current `targetBotId`.
> - No duplicate modules in slots in v1.

---

## 1) Control flow

- `LABEL <name>`
- `GOTO <name>`
- `IF <PREDICATE> GOTO <name>`
- `NOP`

---

## 2) Target selection (updates bot target registers)

Bots can write generic scripts by selecting a target first, then using `MOVE_TO_TARGET` and/or `FIRE_TARGET`.

The bot maintains:
- `targetBotId` (optional)
- `targetPowerupType` (optional)

### 2.1 Target a bot
- `SET_TARGET <BOT>`
- `TARGET_CLOSEST` (alias: `TARGET_CLOSEST_BOT`)
- `TARGET_LOWEST_HEALTH`
  - Sets `targetBotId` to the alive bot with the lowest health.
  - Ties: lowest bot id.
- `TARGET_NEXT`
- `TARGET_NEXT_IF_DEAD`

### 2.2 Target a powerup
Bots know where powerups are (global knowledge). Targeting powerups enables scripts like:
"if health < 10 then target health powerup and move to it".

- `TARGET_POWERUP <TYPE>`
  - sets `targetPowerupType = <TYPE>`
- `TARGET_CLOSEST_POWERUP <TYPE>`
  - chooses the closest powerup of that type (deterministic ties) and sets `targetPowerupType`

Notes:
- If the requested powerup type does not exist on the map, targeting is a no-op.
- If both a bot target and powerup target are set, `MOVE_TO_TARGET` uses bot target first unless you explicitly clear it.

### 2.3 Clearing targets (optional but recommended)
- `CLEAR_TARGET_BOT`
- `CLEAR_TARGET_POWERUP`
- `CLEAR_TARGET` (clears both)

---

## 3) Movement

- `MOVE <DIR>`
- `MOVE_TO_SECTOR <SECTOR>`
- `MOVE_TO_BOT <BOT>`
- `MOVE_TO_POWERUP <TYPE>`

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

## 5) Module actions (future-proof slot-addressed)

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

## 6) Predicates (for `IF ... GOTO ...`)

### 6.1 Enemy/bot proximity

- `BOT_ALIVE(<BOT>)`
- `BOT_IN_SAME_SECTOR(<BOT>)`
- `BOT_IN_ADJ_SECTOR(<BOT>)`
- `DIST_TO_BOT(<BOT>) <op> <number>`  
  (`<op>` is one of `== != < <= > >=`; distance is Manhattan distance over sectors)

Vague/generic:
- `ANY_BOT_IN_SAME_SECTOR()`
- `ANY_BOT_IN_ADJ_SECTOR()`

Nearest:
- `NEAREST_BOT_IS(<BOT>)` (ties -> lowest bot id)

Close-range (named concept; exact radius can be tuned in ruleset):
- `ANY_BOT_IN_CLOSE_RANGE()`
- `TARGET_IN_CLOSE_RANGE()`

### 6.2 Resources (self)

- `AMMO <op> <number>`
- `ENERGY <op> <number>`
- `HEALTH <op> <number>`

### 6.3 Resources (other bots)

- `BOT_HEALTH(<BOT>) <op> <number>`
- `BOT_AMMO(<BOT>) <op> <number>`
- `BOT_ENERGY(<BOT>) <op> <number>`

Vague/generic:
- `ANY_BOT_HEALTH <op> <number>` (true if any alive enemy bot matches)

Convenience for your current target:
- `TARGET_HEALTH <op> <number>`
  - Uses the current `targetBotId`; false if there is no valid target bot.

### 6.4 Powerups (global knowledge)

- `POWERUP_EXISTS(<TYPE>)`
- `DIST_TO_CLOSEST_POWERUP(<TYPE>) <op> <number>`

Near-by checks (optional convenience):
- `POWERUP_IN_SAME_SECTOR(<TYPE>)`
- `POWERUP_IN_ADJ_SECTOR(<TYPE>)`

### 6.5 Bullets/projectiles

- `BULLET_IN_SAME_SECTOR()`
- `BULLET_IN_ADJ_SECTOR()`

### 6.6 Target registers

Bot target:
- `TARGET_IS_SET()`
- `TARGET_ALIVE()`
- `TARGET_IN_SAME_SECTOR()`
- `TARGET_IN_ADJ_SECTOR()`

Powerup target:
- `HAS_TARGET_POWERUP()`
- `TARGET_POWERUP_IS(<TYPE>)`

### 6.7 Collision / bump sensors

Bots can react to bump/collision outcomes.

These sensors refer to the bot’s **most recent bump event** (typically caused by its own movement attempt).

Because the bot executes only one line per tick, bump information is most useful as a **"last tick" result**:
- collisions are detected/resolved during tick `t`
- bump flags are readable by the bot when it executes tick `t+1`

The engine should reset bump state each tick after it is exposed to the bot and/or written into the replay.

Walls:
- `BUMPED_WALL()`
- `BUMPED_WALL_DIR(UP|DOWN|LEFT|RIGHT)`

Bots:
- `BUMPED_BOT()`
- `BUMPED_BOT_IS(<BOT>)`
- `BUMPED_BOT_DIR(UP|DOWN|LEFT|RIGHT)`

Notes / open rules (to finalize in the ruleset):
- Define exactly when a “bump into another bot” occurs (attempted move into occupied sector vs collision inside a sector).
- If multiple bumps could occur in one tick, define which one is recorded (recommended: only record the bump caused by the bot’s own movement instruction; otherwise pick a deterministic priority order).
