# Built-in bot: Zone Patrol Shooter (BULLET)

**Suggested v1 loadout**
- `SLOT1 = BULLET`
- `SLOT2 = (empty)`
- `SLOT3 = (empty)`

**Intended behavior**
- Demonstrates a **zone patrol loop** inside the bot’s current sector that reliably cycles through all 4 zones.
  - To keep the script simple (no extra state), this bot patrols in an axis-aligned loop: **1 → 2 → 4 → 3 → 1**.
- If a bot is **very close** (or we just bumped), briefly backs off toward the center before resuming patrol.
- If health is low and a HEALTH powerup exists, commits briefly to a healing run.
- If ammo is low and an AMMO powerup exists (and we’re not currently healing), commits briefly to an ammo run.
- Opportunistically fires at the nearest bot using an **inline selector** (no target register).

## Script

```text
; bot1 — Zone Patrol Shooter
; Loadout: SLOT1=BULLET
; Summary: patrol zones 1→2→4→3→1 (current sector); back off when too close; detour for HEALTH/AMMO when low; fire at NEAREST_BOT.

LABEL LOOP

; If we're about to collide, step away briefly.
IF (DIST_TO_CLOSEST_BOT() <= 20 || BUMPED_BOT()) GOTO BACKOFF

; Heal / resupply detours.
; (Thresholds are tuned so this behavior is visible in short Workshop runs.)
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH)) GOTO HEAL
IF (AMMO < 80 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; Patrol loop.
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 1

IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 NEAREST_BOT

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
