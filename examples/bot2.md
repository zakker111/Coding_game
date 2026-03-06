# Built-in bot: Chaser Shooter (BULLET)

**Suggested v1 loadout**
- `SLOT1 = BULLET`
- `SLOT2 = (empty)`
- `SLOT3 = (empty)`

**Intended behavior**
- Demonstrates **explicit target selection** using `BOT_ALIVE(...)` + `SET_TARGET`:
  - target BOT1 if alive; else BOT3; else BOT4
- Chases the selected target using a **persistent movement goal** (`SET_MOVE_TO_TARGET`).
- Shoots the target via `USE_SLOT1 TARGET`.

## Script

```text
; bot2 — Chaser Shooter
; Loadout: SLOT1=BULLET
; Summary: choose first alive target (BOT1→BOT3→BOT4), chase it, shoot it.

LABEL LOOP

; Target the first alive enemy in priority order.
; (This script is intended to run in the BOT2 slot, so we intentionally skip BOT2.)
IF (BOT_ALIVE(BOT1)) DO SET_TARGET BOT1
IF (!BOT_ALIVE(BOT1) && BOT_ALIVE(BOT3)) DO SET_TARGET BOT3
IF (!BOT_ALIVE(BOT1) && !BOT_ALIVE(BOT3) && BOT_ALIVE(BOT4)) DO SET_TARGET BOT4

SET_MOVE_TO_TARGET

IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO USE_SLOT1 TARGET

GOTO LOOP
```
