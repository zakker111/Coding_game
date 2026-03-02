# Built-in bot: Corner Bunker (BULLET + ARMOR)

**Intended behavior**
- Moves to a fixed “home” location and tends to stay there.
- If health is low and a health powerup exists, goes to get it, then returns home.
- If ammo is low and an ammo powerup exists, goes to get it, then returns home.
- Shoots only when an enemy is relatively close (to avoid wasting ammo).

**Suggested v1 loadout**
- `SLOT1 = BULLET`
- `SLOT2 = ARMOR`
- `SLOT3 = (empty)`

## Script

```text
SET_MOVE_TO_SECTOR 1 ZONE 1
LABEL LOOP
IF (HEALTH < 40 && POWERUP_EXISTS(HEALTH)) DO SET_MOVE_TO_POWERUP HEALTH
IF (AMMO < 20 && POWERUP_EXISTS(AMMO)) DO SET_MOVE_TO_POWERUP AMMO
IF (HEALTH >= 40 && AMMO >= 20) DO SET_MOVE_TO_SECTOR 1 ZONE 1
IF (SLOT_READY(SLOT1) && DIST_TO_CLOSEST_BOT() <= 3) DO USE_SLOT1 WEAKEST_BOT
GOTO LOOP
```
