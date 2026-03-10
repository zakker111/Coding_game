# Built-in bot: Corner Bunker (BULLET + ARMOR)

**Suggested v1 loadout**
- `SLOT1 = BULLET`
- `SLOT2 = ARMOR`
- `SLOT3 = (empty)`

**Intended behavior**
- Defaults to a fixed “home” location.
- If a bot is **very close** (or we just bumped), briefly sidesteps within its current sector.
- If resources are low, sets a **powerup move goal** to the nearest relevant powerup.
- Uses `WAIT` to briefly **commit** to a powerup run (keeps walking toward the goal while not re-planning).
- Opportunistically fires using an **inline selector** (no target register).

## Script

```text
; bot3 — Corner Bunker
; Loadout: SLOT1=BULLET, SLOT2=ARMOR
; Summary: hold a home corner; sidestep when too close; run to powerups when low (with a short WAIT); shoot NEAREST_BOT when close.

SET_MOVE_TO_SECTOR 1 ZONE 1

LABEL LOOP

; If we're about to collide, sidestep within our current sector.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; Pick a powerup goal (priority: health → ammo).
; (Thresholds are tuned so this behavior is visible in short Workshop runs.)
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH)) DO SET_MOVE_TO_POWERUP HEALTH
IF (AMMO < 80 && POWERUP_EXISTS(AMMO)) DO SET_MOVE_TO_POWERUP AMMO

; If we decided to go get a powerup, commit for 2 ticks while the goal keeps moving us.
IF ((HEALTH < 70 && POWERUP_EXISTS(HEALTH)) || (AMMO < 80 && POWERUP_EXISTS(AMMO))) DO WAIT 2

; Otherwise, go back home.
IF (HEALTH >= 70 && AMMO >= 80) DO SET_MOVE_TO_SECTOR 1 ZONE 1

; Only shoot when something is fairly close (helps conserve ammo).
IF (SLOT_READY(SLOT1) && DIST_TO_CLOSEST_BOT() <= 120) DO FIRE_SLOT1 NEAREST_BOT

GOTO LOOP

LABEL BACKOFF
; Step to the opposite zone in our current sector, then resume normal logic.
CLEAR_MOVE
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 1
WAIT 2
CLEAR_MOVE
GOTO LOOP
```
