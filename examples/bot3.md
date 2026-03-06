# Built-in bot: Corner Bunker (BULLET + ARMOR)

**Suggested v1 loadout**
- `SLOT1 = BULLET`
- `SLOT2 = ARMOR`
- `SLOT3 = (empty)`

**Intended behavior**
- Defaults to a fixed “home” location.
- If resources are low, sets a **powerup move goal** to the nearest relevant powerup.
- Uses `WAIT` to briefly **commit** to a powerup run (keeps walking toward the goal while not re-planning).
- Opportunistically fires using an **inline selector** (no target register).

## Script

```text
; bot3 — Corner Bunker
; Loadout: SLOT1=BULLET, SLOT2=ARMOR
; Summary: hold a home corner, run to powerups when low (with a short WAIT), shoot NEAREST_BOT when close.

SET_MOVE_TO_SECTOR 1 ZONE 1

LABEL LOOP

; Pick a powerup goal (priority: health → ammo).
IF (HEALTH < 40 && POWERUP_EXISTS(HEALTH)) DO SET_MOVE_TO_POWERUP HEALTH
IF (AMMO < 20 && POWERUP_EXISTS(AMMO)) DO SET_MOVE_TO_POWERUP AMMO

; If we decided to go get a powerup, commit for 2 ticks while the goal keeps moving us.
IF ((HEALTH < 40 && POWERUP_EXISTS(HEALTH)) || (AMMO < 20 && POWERUP_EXISTS(AMMO))) DO WAIT 2

; Otherwise, go back home.
IF (HEALTH >= 40 && AMMO >= 20) DO SET_MOVE_TO_SECTOR 1 ZONE 1

; Only shoot when something is fairly close (helps conserve ammo).
IF (SLOT_READY(SLOT1) && DIST_TO_CLOSEST_BOT() <= 3) DO FIRE_SLOT1 NEAREST_BOT

GOTO LOOP
```
