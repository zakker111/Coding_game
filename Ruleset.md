# Ruleset.md — Core Gameplay Rules (Draft)

This document is the **rules of the simulation** (not bot language syntax).

It complements:
- `BotInstructions.md` (what bots can write)
- `ArenaPlan.md` (arena topology and wall behavior)
- `DailyCompetition.md` (server-side competition)

---

## 1) Bot life + death

- Each bot has `health` as an integer in **0..100**.
- When a bot’s `health` reaches **0** (or below) at any point during tick resolution:
  - the bot becomes **dead** immediately for the remainder of the match
  - the bot is **removed from the arena** (no longer occupies a sector / no longer collidable)
  - dead bots are ignored by:
    - targeting (`TARGET_CLOSEST`, `TARGET_NEXT`, etc.)
    - movement helpers (`MOVE_TO_CLOSEST_BOT`, etc.)
    - hit resolution (bullets cannot “hit” a dead bot)

A dead bot still exists as a record in match stats / replay events.

---

## 2) Damage events and attribution

All health reduction happens via **damage events**. Each damage event must include:
- `victimBotId`
- `amount` (positive integer)
- `source` (one of):
  - `BOT` (another bot caused the damage)
  - `ENV` (environment; e.g., wall)
- `sourceBotId` (only present when `source == BOT`)
- `kind` (optional; helps replays/UI): `BULLET|SAW|BUMP_BOT|BUMP_WALL|EXPLOSION|MINE|OTHER`

### 2.1 Last-damage dealer (kill credit rule)

Each bot tracks:
- `lastDamageByBotId` (nullable)

Update rule:
- When `victim` takes damage from `source == BOT`, set:
  - `victim.lastDamageByBotId = sourceBotId`
  - examples of `source == BOT` damage kinds:
    - bullet hits
    - saw damage
    - bot bump / ramming damage (if/when implemented)
- When `victim` takes damage from `source == ENV` (example: wall bump damage):
  - **do not change** `lastDamageByBotId`

Persistence:
- `lastDamageByBotId` persists until the victim takes another `source == BOT` damage event.
- There is **no timeout** in v1 (so a later wall death still credits the last attacker).

This matches the desired semantics:
- if a bot dies to wall damage after being attacked/bumped previously, the **last bot that damaged it** receives the kill credit
- even if the final damage looks like “self-destruct” / environment, kill credit still goes to the last attacker

### 2.2 Death event + kill credit

When a bot dies (health becomes 0):
- emit a deterministic replay event:
  - `BOT_DIED { victimBotId, creditedBotId? }`
- compute `creditedBotId` as:
  - if `victim.lastDamageByBotId` is set: credit that bot
  - else: no credit (environment kill)

The credited bot receives:
- `kills += 1` in match stats

The victim receives:
- `deaths += 1` in match stats

---

## 3) Walls and wall damage

Walls are gameplay:
- if a bot bumps a wall it takes a small amount of damage (`BUMP_WALL`)
- wall damage is `source == ENV`
- wall damage **can cause death**
- if wall damage causes death, kill credit still goes to `lastDamageByBotId` (if present)

---

## 4) Bot-to-bot collisions (bump events)

Bots can collide with each other. The simulation should emit/track **bump events** so bot code can react (see `BUMPED_BOT*` predicates in `BotInstructions.md`).

Event requirements:
- A bot-to-bot collision produces a bump event for **both** bots.
- The bump event should include:
  - which bot it collided with (`otherBotId`)
  - direction of impact relative to the bot (`dir`)

Direction rule (recommended for v1):
- If the collision was caused by a bot’s movement attempt in direction `<DIR>`, then:
  - mover records `dir = <DIR>`
  - the other bot records `dir = OPPOSITE(<DIR>)`

Damage (to finalize):
- If you decide that bot-to-bot bumps cause damage, it should be recorded as `source == BOT` with `kind == BUMP_BOT`, so it participates in kill credit via `lastDamageByBotId`.

---

## 5) Simultaneous damage and deterministic ordering

Multiple damage events may apply in one tick.

Determinism requirement:
- the engine must apply damage events in a stable, documented order.

Recommendation (v1):
- resolve damage in a fixed phase order (example):
  1) movement/bump resolution damage
  2) saw damage
  3) bullet hits
- within each phase:
  - process bots in `BOT1..BOT4` order
  - process entities in stable creation order (e.g., bullet id ascending)

Kill credit in multi-hit ticks:
- because `lastDamageByBotId` is updated as damage is applied, the credited killer is whichever bot delivered the **final BOT-sourced damage event** that occurred before death (in the deterministic order above).

---

## 6) Match stats vs season points

Match stats should include (at minimum):
- placement (1st–4th)
- survival ticks
- kills / deaths
- damage dealt / damage taken
- wall bump count / wall bump damage taken

Season points are computed from match stats by a configurable formula (see `DailyCompetition.md`).

