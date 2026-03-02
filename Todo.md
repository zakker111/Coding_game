# Todo

This file is the **single source of truth** for near-term engineering tasks and open design work.

## Decisions to make (pick one per section)

### Runtime target
- **A)** Browser-first (Web UI, runs locally in browser; optional server later)
- **B)** Node-first (CLI + headless simulation; optional web viewer later)
- **C)** Client/server from day 1 (authoritative server + web client)

### Bot language + execution model
- **A)** JavaScript bots (function-based API; sandbox via Worker/VM)
- **B)** Lua bots (embed Lua VM; strict sandbox)
- **C)** WASM bots (compile-to-wasm languages; strict resource caps)

### Match determinism + networking
- **A)** Deterministic lockstep (seeded RNG; replays are seeds + inputs)
- **B)** Server-authoritative with replay logging

## Engineering tasks (ordered roughly by dependency, not by dates)

- Define the **core game loop** (tick rate, turn-based vs real-time, max ticks).
- Define the **arena model** (grid vs continuous, line-of-sight, collision rules).
- Define the **bot API**:
  - Observation format (what the bot can see)
  - Action format (what the bot can do)
  - Memory/state persistence between ticks
- Choose and implement a **seeded RNG** and enforce determinism.
- Implement a minimal **simulation engine**:
  - Entities (bots, projectiles, pickups)
  - Physics/movement rules
  - Combat/damage rules
  - Win conditions
- Add a **replay format** (seed + initial state + per-tick actions; JSON).
- Add a **sandbox/limits** layer for untrusted bot code:
  - CPU budget per tick
  - Memory cap
  - No filesystem / network access
- Build a minimal **test harness**:
  - Golden replays
  - Determinism tests (same seed => same outcome)
  - Property tests/fuzz (optional)
- Build a minimal **runner UI** (optional initially):
  - Load bots
  - Run match
  - Visualize outcome

## Nice-to-haves

- Bot debugging tools (step-through, trace, overlays).
- Ranking/ladder system.
- Map editor / arena presets.
