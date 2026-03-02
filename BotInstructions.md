# Bot Instruction List (v1 draft)

This is a **single-line-per-tick** language:
- Each bot executes **exactly 1 instruction per tick** at its current `pc` (program counter).
- If an instruction is invalid or malformed at runtime, it is treated as `NOP`, and `pc` resets to `1` next tick (per-bot; does not crash the match).

> Notation:
> - `<TARGET>`: `BOT1|BOT2|BOT3|BOT4|CLOSEST_BOT`
> - `<TYPE>`: `HEALTH|AMMO|ENERGY`
> - `<DIR>`: `UP|DOWN|LEFT|RIGHT`
> - `<SECTOR>`: `1..9`
> - `<SLOT>`: `SLOT1|SLOT2|SLOT3` (used only in `FIRE_TARGET` form)
> - No duplicate modules in slots in v1.

---

## 1) Control flow

- `LABEL <name>`
- `GOTO <name>`
- `IF <PREDICATE> GOTO <name>`
- `NOP`

---

## 2) Target selection (updates bot’s `targetBotId` register)

- `SET_TARGET BOT1|BOT2|BOT3|BOT4`
- `TARGET_CLOSEST`
- `TARGET_NEXT`
- `TARGET_NEXT_IF_DEAD`

---

## 3) Movement

- `MOVE <DIR>`
- `MOVE_TO_SECTOR <SECTOR>`
- `MOVE_TO_BOT BOT1|BOT2|BOT3|BOT4`
- `MOVE_TO_POWERUP <TYPE>`

---

## 4) Module actions (module-type)

> If the required module is not equipped, the instruction does nothing.

- `FIRE_BULLET <TARGET>`
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

- `FIRE_SLOT1 <TARGET>`
- `FIRE_SLOT2 <TARGET>`
- `FIRE_SLOT3 <TARGET>`

Semantics:
- If slot contains **BULLET**: fires at `<TARGET>`.
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
  - If target is none/dead, does nothing.

---

## 6) Predicates (for `IF ... GOTO ...`)

### 6.1 Enemy/bot proximity

- `BOT_ALIVE(BOTn)`
- `BOT_IN_SAME_SECTOR(BOTn)`
- `BOT_IN_ADJ_SECTOR(BOTn)`
- `DIST_TO_BOT(BOTn) <op> <number>`  
  (`<op>` is one of `== != < <= > >=`; distance is Manhattan distance over sectors)

Vague/generic:
- `ANY_BOT_IN_SAME_SECTOR()`
- `ANY_BOT_IN_ADJ_SECTOR()`

Nearest:
- `NEAREST_BOT_IS(BOTn)` (ties -> lowest bot id)

Close-range (named concept; exact radius can be tuned in ruleset):
- `ANY_BOT_IN_CLOSE_RANGE()`
- `TARGET_IN_CLOSE_RANGE()`

### 6.2 Resources

- `AMMO == 0` / `AMMO > 0`
- `ENERGY == 0` / `ENERGY > 0`
- `HEALTH <op> <number>`

### 6.3 Powerups

- `POWERUP_IN_SAME_SECTOR(<TYPE>)`
- `POWERUP_IN_ADJ_SECTOR(<TYPE>)`

### 6.4 Bullets/projectiles

- `BULLET_IN_SAME_SECTOR()`
- `BULLET_IN_ADJ_SECTOR()`

### 6.5 Target register

- `TARGET_IS_SET()`
- `TARGET_ALIVE()`
- `TARGET_IN_SAME_SECTOR()`
- `TARGET_IN_ADJ_SECTOR()`

### 6.6 Collision / bump sensors (new)

Bots can react to bump/collision outcomes (for example: "if I bumped a wall on the left, turn shield on").

These sensors refer to the bot’s **most recent bump event** (typically caused by its own movement attempt). The engine should reset bump state each tick after it is observed/logged.

Walls:
- `BUMPED_WALL()`
- `BUMPED_WALL_DIR(UP|DOWN|LEFT|RIGHT)`

Bots:
- `BUMPED_BOT()`
- `BUMPED_BOT_IS(BOT1|BOT2|BOT3|BOT4)`
- `BUMPED_BOT_DIR(UP|DOWN|LEFT|RIGHT)`

Notes / open rules (to finalize in the ruleset):
- Define exactly when a “bump into another bot” occurs (e.g., attempted move into an occupied sector vs collision inside a sector).
- If multiple bumps could occur in one tick, define which one is recorded (recommended: only record the bump caused by the bot’s own movement instruction; otherwise pick a deterministic priority order).
