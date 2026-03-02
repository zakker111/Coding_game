# Built-in bot: Saw Rusher (SAW + SHIELD)

**Intended behavior**
- Constantly chases the closest living enemy.
- Turns SAW on only when very close (distance ≤ 1), otherwise turns it off to save energy.
- Uses SHIELD when bullets are nearby; turns it off when bullets are no longer nearby.

**Suggested v1 loadout**
- `SLOT1 = SAW`
- `SLOT2 = SHIELD`
- `SLOT3 = (empty)`

## Script

```text
SET_MOVE_TO_BOT CLOSEST_BOT
LABEL LOOP
IF (DIST_TO_CLOSEST_BOT() <= 1 && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SAW ON
IF (DIST_TO_CLOSEST_BOT() > 1 && SLOT_ACTIVE(SLOT1)) DO SAW OFF
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SHIELD ON
IF (!(BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) && SLOT_ACTIVE(SLOT2)) DO SHIELD OFF
GOTO LOOP
```
