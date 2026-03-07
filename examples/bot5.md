# Built-in bot: Burst Hunter (BULLET + ARMOR)

**Suggested v1 loadout**
- `SLOT1 = BULLET`
- `SLOT2 = ARMOR`
- `SLOT3 = (empty)`

**Intended behavior**
- Defaults to holding around the center (`SECTOR 5`).
- When an enemy gets close, starts a short **burst window** (timer) where it locks a target and fires repeatedly.
- When low on health/ammo, targets that powerup type and **commits** for a few ticks using `MOVE_TO_TARGET`.

## Script

```text
; bot5 — Burst Hunter
; Loadout: SLOT1=BULLET, SLOT2=ARMOR
; Summary: center control + burst windows; detours for HEALTH/AMMO via TARGET_POWERUP.

; Default posture: drift toward the center.
SET_MOVE_TO_SECTOR 5

LABEL LOOP

; --- Emergency powerup logic (commit for 3 ticks) ---
; Low health → go to HEALTH.
IF (HEALTH < 45 && POWERUP_EXISTS(HEALTH) && TIMER_DONE(T1)) DO TARGET_POWERUP HEALTH
IF (HEALTH < 45 && POWERUP_EXISTS(HEALTH) && TIMER_DONE(T1)) DO SET_TIMER T1 3
IF (TIMER_ACTIVE(T1)) DO MOVE_TO_TARGET

; Low ammo (but not in the middle of a health run) → go to AMMO.
IF (!TIMER_ACTIVE(T1) && AMMO < 10 && POWERUP_EXISTS(AMMO) && TIMER_DONE(T2)) DO TARGET_POWERUP AMMO
IF (!TIMER_ACTIVE(T1) && AMMO < 10 && POWERUP_EXISTS(AMMO) && TIMER_DONE(T2)) DO SET_TIMER T2 3
IF (TIMER_ACTIVE(T2)) DO MOVE_TO_TARGET

; --- Combat logic ---
; If an enemy is within 40 world units, open a 4-tick burst window.
IF (!TIMER_ACTIVE(T1) && !TIMER_ACTIVE(T2) && DIST_TO_CLOSEST_BOT() <= 40 && TIMER_DONE(T3)) DO SET_TIMER T3 4

; During the burst, lock the closest target and fire at it.
IF (TIMER_ACTIVE(T3)) DO TARGET_CLOSEST
IF (TIMER_ACTIVE(T3) && HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO USE_SLOT1 TARGET

; Otherwise take opportunistic pot-shots when something is very close.
IF (!TIMER_ACTIVE(T3) && SLOT_READY(SLOT1) && DIST_TO_CLOSEST_BOT() <= 20) DO FIRE_SLOT1 NEAREST_BOT

GOTO LOOP
```
