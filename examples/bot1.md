# bot1.md — Sample combat bot (ranged + melee variants)

This doc contains two complete **BotInstructions v1** scripts that focus on **attacking other bots** while demonstrating:

- **BULLET** weapon usage (via `USE_SLOT1 ...`)
- **SAW** usage (via `SAW ON` / `SAW OFF`)
- **SHIELD** usage (via `SHIELD ON` / `SHIELD OFF`)
- A few slightly more advanced patterns:
  - non-blocking **timers** (`SET_TIMER`, `TIMER_DONE`)
  - persistent **movement goals** (`SET_MOVE_TO_TARGET`)
  - **slot-ready checks** (`SLOT_READY`, `SLOT_ACTIVE`)

> Important v1 loadout rule (from `BotInstructions.md`): you can equip **at most one weapon module**, so you’ll run **either** the BULLET script **or** the SAW script.

---

## Optional: equivalent alias names

Some instructions in `BotInstructions.md` have multiple accepted spellings (aliases). If you prefer different spellings (same behavior), you can swap in lines like these:

```text
; Targeting
TARGET_CLOSEST_BOT            ; or: TARGET_CLOSEST / TARGET_NEAREST
TARGET_LOWEST_HEALTH          ; or: TARGET_WEAKEST

; Shooting (slot-addressed)
USE_SLOT1 TARGET              ; or: FIRE_SLOT1 TARGET        ; alias of USE_SLOT1
                              ; or: FIRE_TARGET SLOT1        ; uses the current target bot
USE_SLOT1 NEAREST_BOT         ; fire at the closest bot without using the target register
USE_SLOT1 WEAKEST_BOT         ; fire at the lowest-health bot without using the target register

; Toggle modules via slots (useful if you later change what module is in a slot)
SAW ON                        ; or: USE_SLOT1 NONE
SAW OFF                       ; or: STOP_SLOT1
SHIELD ON                     ; or: USE_SLOT2 NONE
SHIELD OFF                    ; or: STOP_SLOT2
```

## Variant A — “Shielded Shooter” (BULLET + SHIELD)

### Intended behavior (plain English)

1. **Pick a target** (the closest enemy) and set a **movement goal** to chase them.
2. Every few ticks, **re-target** the closest bot (so we don’t tunnel on a dead/out-of-date target).
3. If bullets are nearby *or* our health is low, turn **SHIELD ON** for a short minimum duration.
4. When the target is within a small range, and the weapon slot is ready, **fire**.

### Suggested loadout

- `SLOT1 = BULLET`
- `SLOT2 = SHIELD`
- `SLOT3 = (empty or ARMOR)`

### Script

```text
; bot1 — Shielded Shooter
;
; Notes:
; - Each line executes once per tick.
; - The first two lines are “startup” work (targeting + movement goal).

TARGET_CLOSEST_BOT
SET_MOVE_TO_TARGET

LABEL LOOP

; Re-acquire the closest enemy every 8 ticks.
; (Timers start at 0, so this runs immediately on the first loop.)
IF (TIMER_DONE(T1)) DO TARGET_CLOSEST_BOT
IF (TIMER_DONE(T1)) DO SET_TIMER T1 8

; If bullets are near OR we’re low on health, turn shield on for at least 4 ticks.
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR() || HEALTH < 25) && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SHIELD ON
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR() || HEALTH < 25) && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SET_TIMER T2 4

; When the minimum shield time expires and it’s safe, turn it back off to save energy.
IF (TIMER_DONE(T2) && SLOT_ACTIVE(SLOT2) && !BULLET_IN_SAME_SECTOR() && !BULLET_IN_ADJ_SECTOR() && HEALTH >= 25) DO SHIELD OFF

; Fire when the target is reasonably close and the slot is ready.
; Using USE_SLOT1 keeps this script “future proof” if weapon cooldown rules evolve.
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1) && DIST_TO_TARGET_BOT() <= 2) DO USE_SLOT1 TARGET

GOTO LOOP
```

#### Small tweak ideas

- More aggressive shooting: increase range, e.g. `DIST_TO_TARGET_BOT() <= 3`.
- More defensive: keep shield on longer by setting `T2` to 6–8.

---

## Variant B — “Shielded Brawler” (SAW + SHIELD)

### Intended behavior (plain English)

1. **Pick a target** (closest enemy) and chase using a persistent movement goal.
2. If bullets are nearby *or* health is low, raise a **shield** briefly.
3. When we **bump** an enemy (collision from the previous tick), turn the **saw on** for a short burst window (then turn it back off).

### Suggested loadout

- `SLOT1 = SAW`
- `SLOT2 = SHIELD`
- `SLOT3 = (empty or ARMOR)`

### Script

```text
; bot1 — Shielded Brawler
;
; Notes:
; - SAW is a toggle. Leaving it on drains energy every tick.
; - BUMPED_BOT() is a “last tick” sensor, so the saw turns on *after* a bump happens.

TARGET_CLOSEST_BOT
SET_MOVE_TO_TARGET

LABEL LOOP

; Re-acquire the closest enemy every 6 ticks.
IF (TIMER_DONE(T1)) DO TARGET_CLOSEST_BOT
IF (TIMER_DONE(T1)) DO SET_TIMER T1 6

; Shield logic (same as the ranged bot).
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR() || HEALTH < 25) && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SHIELD ON
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR() || HEALTH < 25) && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SET_TIMER T2 4
IF (TIMER_DONE(T2) && SLOT_ACTIVE(SLOT2) && !BULLET_IN_SAME_SECTOR() && !BULLET_IN_ADJ_SECTOR() && HEALTH >= 25) DO SHIELD OFF

; If we bumped a bot last tick, start a 5-tick saw window.
IF (BUMPED_BOT() && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SAW ON
IF (BUMPED_BOT() && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SET_TIMER T3 5

; When the window expires, turn the saw off.
IF (TIMER_DONE(T3) && SLOT_ACTIVE(SLOT1)) DO SAW OFF

GOTO LOOP
```

---

## Optional: ideas for future instructions/features

These are *not* part of v1 (`BotInstructions.md`)—just ideas that would make the language more fun later:

- A first-class `ELSE` (or priority `IF`) to reduce “multi-tick” decision latency.
- A way to aim by direction (e.g. `DIR UP`) for beam/cone weapons.
- Module/slot introspection like `SLOT_KIND(SLOT1)` so one script can adapt to multiple loadouts.
- Simple “memory” registers (e.g. `SET I1 3`, `I1 == 3`) for small state machines without using up timer slots.
