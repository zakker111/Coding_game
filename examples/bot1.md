# Built-in bot: Zone Patrol Shooter (BULLET)

**Suggested v1 loadout**
- `SLOT1 = BULLET`
- `SLOT2 = (empty)`
- `SLOT3 = (empty)`

**Intended behavior**
- Demonstrates a **zone patrol loop** inside the bot’s current sector that reliably cycles through all 4 zones.
  - To keep the script simple (no extra state), this bot patrols in an axis-aligned loop: **1 → 2 → 4 → 3 → 1**.
- Uses a **persistent movement goal** (`SET_MOVE_TO_ZONE`) so the bot keeps walking while it does other work.
- Opportunistically fires at the nearest bot using an **inline selector** (no target register).

## Script

```text
; bot1 — Zone Patrol Shooter
; Loadout: SLOT1=BULLET
; Summary: patrol zones 1→2→4→3→1 (current sector) and fire at NEAREST_BOT.

LABEL LOOP
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 1

IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 NEAREST_BOT

GOTO LOOP
```
