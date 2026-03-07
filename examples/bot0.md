# bot0.md — Workshop starter template (beginner): Aggressive Skirmisher

This is the **default BOT1 script** the Workshop should load when the user has **no saved bot draft** yet.

**Suggested v1 loadout**
- `SLOT1 = BULLET`
- `SLOT2 = (empty)`
- `SLOT3 = (empty)`

**Intended behavior**
- If health is low and a HEALTH powerup exists, commit to a short healing run.
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
; Summary: chase+shoot the closest bot; when low HP, run to HEALTH for 6 ticks.

LABEL LOOP

; Heal when hurt (clear bot target so MOVE_TO_TARGET prefers the powerup).
IF (HEALTH < 45 && POWERUP_EXISTS(HEALTH)) GOTO HEAL

; Otherwise pick a fight.
TARGET_CLOSEST
SET_MOVE_TO_TARGET
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO FIRE_SLOT1 TARGET

GOTO LOOP

LABEL HEAL
CLEAR_TARGET_BOT
TARGET_POWERUP HEALTH
SET_MOVE_TO_TARGET
WAIT 6
CLEAR_MOVE
GOTO LOOP
```
