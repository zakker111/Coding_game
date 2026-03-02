# Built-in bot: Chaser Shooter (BULLET)

**Intended behavior**
- Always moves toward the closest living enemy.
- Fires at the nearest bot whenever `SLOT1` is ready.
- If low on health/ammo, temporarily goes to the nearest relevant powerup (if any exist).

**Suggested v1 loadout**
- `SLOT1 = BULLET`
- `SLOT2 = (empty)`
- `SLOT3 = (empty)`

## Script

```text
SET_MOVE_TO_BOT CLOSEST_BOT
LABEL LOOP
IF (HEALTH < 30 && POWERUP_EXISTS(HEALTH)) DO SET_MOVE_TO_POWERUP HEALTH
IF (AMMO < 15 && POWERUP_EXISTS(AMMO)) DO SET_MOVE_TO_POWERUP AMMO
IF (HEALTH >= 30 && AMMO >= 15) DO SET_MOVE_TO_BOT CLOSEST_BOT
IF (SLOT_READY(SLOT1)) DO USE_SLOT1 NEAREST_BOT
GOTO LOOP
```
