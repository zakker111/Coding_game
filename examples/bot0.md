# bot0.md — Workshop starter template (beginner): Powerup Seeker

This is the **default BOT1 script** the Workshop should load when the user has **no saved bot draft** yet.

**Intended behavior**
- Repeatedly targets a specific powerup type.
- Moves toward the current target.

This intentionally demonstrates the two beginner-friendly v1 instructions:
- `TARGET_POWERUP <TYPE>`
- `MOVE_TO_TARGET`

> Tip: try changing `HEALTH` to `AMMO` or `ENERGY`.

## Script

```text
; bot0 — Powerup Seeker (starter)

LABEL LOOP
TARGET_POWERUP HEALTH
MOVE_TO_TARGET
GOTO LOOP
```
