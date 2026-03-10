# bot0.md — Workshop starter template (beginner): Aggressive Skirmisher

This is the **default BOT1 script** the Workshop should load when the user has **no saved bot draft** yet.

**Suggested v1 loadout**
- `SLOT1 = BULLET`
- `SLOT2 = (empty)`
- `SLOT3 = (empty)`

**Intended behavior**
- If a bot is **very close**, briefly back off toward the center before re-engaging.
- If health is low and a HEALTH powerup exists, commit briefly to a healing run.
- If ammo is low and an AMMO powerup exists (and we’re not currently healing), commit briefly to an ammo run.
- Otherwise: target the closest bot, chase it (persistent move goal), and shoot when ready.

This starter intentionally uses a few core v1 patterns:
- `IF ... GOTO ...` (simple branching)
- `TARGET_CLOSEST` / `TARGET_POWERUP HEALTH`
- `SET_MOVE_TO_TARGET` (keep moving while doing other work)
- `FIRE_SLOT1 TARGET` (shoot your current target)
- `WAIT` (brief commitment to a plan)

## Script

```text
; bot0 — Aggressive Skirmisher (starter)
; Loadout: SLOT1=BULLET
; Summary: chase+shoot the closest bot; back off when too close; detour for HEALTH/AMMO when low.

LABEL LOOP

; If we're about to collide, step away briefly.
IF (DIST_TO_CLOSEST_BOT() <= 20 || BUMPED_BOT()) GOTO BACKOFF

; Heal when hurt (clear bot target so MOVE_TO_TARGET prefers the powerup).
IF (HEALTH < 45 && POWERUP_EXISTS(HEALTH)) GOTO HEAL

; Resupply when low (and we aren't currently healing).
IF (AMMO < 10 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; Otherwise pick a fight.
TARGET_CLOSEST
SET_MOVE_TO_TARGET
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO FIRE_SLOT1 TARGET

GOTO LOOP

LABEL BACKOFF
SET_MOVE_TO_SECTOR 5
WAIT 2
CLEAR_MOVE
GOTO LOOP

LABEL HEAL
CLEAR_TARGET_BOT
TARGET_POWERUP HEALTH
SET_MOVE_TO_TARGET
WAIT 3
CLEAR_MOVE
GOTO LOOP

LABEL RESUPPLY
CLEAR_TARGET_BOT
TARGET_POWERUP AMMO
SET_MOVE_TO_TARGET
WAIT 3
CLEAR_MOVE
GOTO LOOP
```
