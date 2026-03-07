// Copied from /examples/*.md (scripts only) for the buildless deploy workshop.

export const EXAMPLE_BOTS = {
  bot0: {
    id: 'bot0',
    displayName: 'Powerup Seeker (starter)',
    sourceText: `; bot0 — Powerup Seeker (starter)

LABEL LOOP
TARGET_POWERUP HEALTH
MOVE_TO_TARGET
GOTO LOOP
`,
  },

  bot1: {
    id: 'bot1',
    displayName: 'Zone Patrol Shooter',
    sourceText: `; bot1 — Zone Patrol Shooter
; Loadout: SLOT1=BULLET
; Summary: patrol zones 1→2→4→3→1 (current sector) and fire at NEAREST_BOT.

LABEL LOOP
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 1

IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 NEAREST_BOT

GOTO LOOP
`,
  },

  bot2: {
    id: 'bot2',
    displayName: 'Chaser Shooter',
    sourceText: `; bot2 — Chaser Shooter
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
`,
  },

  bot3: {
    id: 'bot3',
    displayName: 'Corner Bunker',
    sourceText: `; bot3 — Corner Bunker
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
`,
  },

  bot4: {
    id: 'bot4',
    displayName: 'Saw Rusher',
    sourceText: `; bot4 — Saw Rusher
; Loadout: SLOT1=SAW, SLOT2=SHIELD
; Summary: chase CLOSEST_BOT; bump→saw burst; bullets nearby→shield burst.

SET_MOVE_TO_BOT CLOSEST_BOT

LABEL LOOP

; Saw burst window after a bump.
IF (BUMPED_BOT() && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SAW ON
IF (BUMPED_BOT() && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SET_TIMER T1 4
IF (TIMER_DONE(T1) && SLOT_ACTIVE(SLOT1)) DO SAW OFF

; Shield when bullets are around (keep it on for at least 3 ticks).
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SHIELD ON
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SET_TIMER T2 3
IF (TIMER_DONE(T2) && SLOT_ACTIVE(SLOT2) && !BULLET_IN_SAME_SECTOR() && !BULLET_IN_ADJ_SECTOR()) DO SHIELD OFF

GOTO LOOP
`,
  },

  bot5: {
    id: 'bot5',
    displayName: 'Burst Hunter',
    sourceText: `; bot5 — Burst Hunter
; Loadout: SLOT1=BULLET, SLOT2=ARMOR
; Summary: center control + burst windows; detours for HEALTH/AMMO via TARGET_POWERUP.

; Default posture: drift toward the center.
SET_MOVE_TO_SECTOR 5

LABEL LOOP

; --- Emergency powerup logic (commit for 3 ticks) ---
; Low health → go to HEALTH.
IF (HEALTH < 45 && POWERUP_EXISTS(HEALTH) && TIMER_DONE(T1)) DO TARGET_POWERUP HEALTH
IF (HEALTH < 45 && POWERUP_EXISTS(HEALTH) && TIMER_DONE(T1)) DO SET_TIMER T1 3
IF (TIMER_ACTIVE(T1)) DO MOVE_TO_TARGET

; Low ammo (but not in the middle of a health run) → go to AMMO.
IF (!TIMER_ACTIVE(T1) && AMMO < 10 && POWERUP_EXISTS(AMMO) && TIMER_DONE(T2)) DO TARGET_POWERUP AMMO
IF (!TIMER_ACTIVE(T1) && AMMO < 10 && POWERUP_EXISTS(AMMO) && TIMER_DONE(T2)) DO SET_TIMER T2 3
IF (TIMER_ACTIVE(T2)) DO MOVE_TO_TARGET

; --- Combat logic ---
; If an enemy is within 40 world units, open a 4-tick burst window.
IF (!TIMER_ACTIVE(T1) && !TIMER_ACTIVE(T2) && DIST_TO_CLOSEST_BOT() <= 40 && TIMER_DONE(T3)) DO SET_TIMER T3 4

; During the burst, lock the closest target and fire at it.
IF (TIMER_ACTIVE(T3)) DO TARGET_CLOSEST
IF (TIMER_ACTIVE(T3) && HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO USE_SLOT1 TARGET

; Otherwise take opportunistic pot-shots when something is very close.
IF (!TIMER_ACTIVE(T3) && SLOT_READY(SLOT1) && DIST_TO_CLOSEST_BOT() <= 20) DO FIRE_SLOT1 NEAREST_BOT

GOTO LOOP
`,
  },

  bot6: {
    id: 'bot6',
    displayName: 'Energy Saw Skirmisher',
    sourceText: `; bot6 — Energy Saw Skirmisher
; Loadout: SLOT1=SAW, SLOT2=SHIELD
; Summary: chase CLOSEST_BOT; bump→SAW burst; bullets→SHIELD burst; low ENERGY→TARGET_POWERUP ENERGY + MOVE_TO_TARGET.

; Always try to pressure the closest bot (goal is re-evaluated each tick).
SET_MOVE_TO_BOT CLOSEST_BOT

LABEL LOOP

; --- Energy management (commit 4 ticks to refuel) ---
IF (ENERGY < 25 && POWERUP_EXISTS(ENERGY) && TIMER_DONE(T3)) DO TARGET_POWERUP ENERGY
IF (ENERGY < 25 && POWERUP_EXISTS(ENERGY) && TIMER_DONE(T3)) DO SET_TIMER T3 4
IF (TIMER_ACTIVE(T3)) GOTO REFUEL

; --- SAW burst (after bump) ---
IF (BUMPED_BOT() && TIMER_DONE(T1) && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SAW ON
IF (BUMPED_BOT() && TIMER_DONE(T1)) DO SET_TIMER T1 5
IF (TIMER_DONE(T1) && SLOT_ACTIVE(SLOT1)) DO SAW OFF

; --- SHIELD burst (when bullets are around) ---
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) && TIMER_DONE(T2) && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SHIELD ON
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) && TIMER_DONE(T2)) DO SET_TIMER T2 3
IF (TIMER_DONE(T2) && SLOT_ACTIVE(SLOT2) && !BULLET_IN_SAME_SECTOR() && !BULLET_IN_ADJ_SECTOR()) DO SHIELD OFF

GOTO LOOP

LABEL REFUEL
; When refueling, conserve energy by turning toggles off, then walk the target.
IF (SLOT_ACTIVE(SLOT1)) DO SAW OFF
IF (SLOT_ACTIVE(SLOT2)) DO SHIELD OFF
MOVE_TO_TARGET

; If we refilled or the powerup disappeared, go back to chasing.
IF (ENERGY >= 60 || !POWERUP_EXISTS(ENERGY) || TIMER_DONE(T3)) DO CLEAR_TIMER T3
IF (ENERGY >= 60 || !POWERUP_EXISTS(ENERGY) || TIMER_DONE(T3)) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
`,
  },
}

export const OPPONENT_EXAMPLE_POOL_IDS = ['bot1', 'bot2', 'bot3', 'bot4', 'bot5', 'bot6']
export const DEFAULT_OPPONENT_EXAMPLE_IDS = ['bot2', 'bot3', 'bot4']
