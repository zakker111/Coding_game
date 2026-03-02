# Prompt.md — AI Coding Guidelines and Project Prompt

This document is a **persistent prompt** for AI-assisted development on this project.
Any time the AI edits code here, it must follow these rules.

The project goal (current): **a game where players write code bots that fight other bots**, with a focus on **deterministic simulation**, **fairness**, and **safe execution of untrusted code**.

---

## Table of Contents

- [1. Project North Star](#1-project-north-star)
- [2. High-Level Engineering Principles](#2-high-level-engineering-principles)
- [3. Repository Layout & Module Boundaries](#3-repository-layout--module-boundaries)
- [4. Determinism, RNG, and Replays](#4-determinism-rng-and-replays)
- [5. Bot API Contract](#5-bot-api-contract)
- [6. Sandboxing & Security (Untrusted Code)](#6-sandboxing--security-untrusted-code)
- [7. Data-First Design](#7-data-first-design)
- [8. Coding Style & Readability](#8-coding-style--readability)
- [9. Testing & Verification](#9-testing--verification)
- [10. Performance in Hot Paths](#10-performance-in-hot-paths)
- [11. Versioning, Bugs, and Housekeeping](#11-versioning-bugs-and-housekeeping)

---

## 1. Project North Star

The game should make these properties true:

- **Fair**: bots compete under the same constraints.
- **Deterministic**: a match can be reproduced from a seed + inputs.
- **Safe**: untrusted bot code cannot access filesystem/network or crash the host.
- **Observable**: we can inspect matches via logs/replays/debug tools.
- **Moddable**: arena presets, items, and rules should be data-driven when practical.

Non-goals (until explicitly requested):

- Real-money economy, anti-cheat beyond sandboxing, or global multiplayer at scale.

---

## 2. High-Level Engineering Principles

- **Match the project’s style and architecture.**
  - Follow existing module layout, naming, and directory structure.
  - Extend established patterns instead of inventing new ones.

- **Prefer modular, composable code.**
  - Keep modules focused; avoid “god modules”.
  - Extract helpers when logic is reused in 2+ places.
  - **Keep files small**: if a source file grows beyond ~**600 lines**, refactor by splitting into smaller modules (new files are encouraged when it improves clarity).
  - Keep the directory structure orderly: group by domain (simulation / bots / sandbox / UI / data) and name files by responsibility.

- **Be explicit, deterministic, and data-driven.**
  - Never use `Math.random()` in simulation/gameplay; always use a seeded RNG.
  - Avoid silent fallbacks in core gameplay—fail loudly in dev.

- **Security is a first-class feature.**
  - Treat all bot code as untrusted.
  - All bot execution must go through a sandbox + resource limits.

- **Document the “why”, not just the “what”.**
  - In PRs/changes: explain tradeoffs and how to test.

---

## 3. Repository Layout & Module Boundaries

The repo is currently minimal. As code is introduced, keep a clean separation by **domain**:

- **Simulation engine & rules**
  - Tick loop, state transitions, RNG wiring, collision/damage rules.
- **Bot interfaces and adapters**
  - Bot API types, loaders, examples, validation.
- **Untrusted execution (sandbox)**
  - Isolation boundary, CPU/memory limits, timeouts.
- **Content / balance data**
  - Arena presets, item definitions, rule knobs, balance numbers.
- **Visualization / UI**
  - Renderer, debug overlays, replay viewer.
- **Optional authoritative runner**
  - Match orchestration for tournaments/ladders, persistence.

Rule of thumb:

- If it’s **game rules / simulation** → keep it in the simulation domain.
- If it’s **untrusted code execution** → keep it in the sandbox domain.
- If it’s **user-facing rendering** → keep it in the UI domain.
- If it’s **content knobs** → keep it in data.

### 3.1 Adding New Files / Folders

- Add new modules only when they reduce coupling or clarify ownership.
- Avoid adding new top-level directories unless the domain will contain multiple modules.
- Prefer consistent naming (e.g. `lower_snake_case`) unless the repo establishes another convention.

---

## 4. Determinism, RNG, and Replays

Determinism is a core requirement.

- **One seeded RNG per match**, stored in match context/state.
- All randomness must be sourced from that RNG.
- No time-based behavior in simulation (`Date.now`, timers) except as external orchestration.

### 4.1 Replay invariants

A replay must be able to reproduce the outcome from:

- Match seed
- Initial arena preset + initial entity spawns
- Bot code versions or bot source hashes
- Per-tick bot actions (or per-tick bot inputs if lockstep)

If replay reproducibility breaks, treat it as a **severity-1 bug**.

---

## 5. Bot API Contract

Bots should be treated like pure decision functions:

- The simulation provides an **observation** (what the bot can sense).
- The bot returns an **action** (what it wants to do).
- The bot can have **private memory** but only through explicitly supported mechanisms.

### 5.1 Suggested bot function shape (example)

```js
// Bot code should not reach into engine internals.
export function act(observation, memory) {
  // return: { action, memory }
}
```

Bot API rules:

- Observations should be **explicit and bounded** (no leaking hidden opponent state).
- Actions should be **validated** before applying them to the simulation.
- Invalid actions should be handled consistently (e.g., “no-op” + penalty, or disqualify).

---

## 6. Sandboxing & Security (Untrusted Code)

Bot code is untrusted.

Minimum requirements before running user-provided bots:

- **Isolation**: execute bots in a sandbox (e.g., Web Worker, Node `vm`, WASM runtime).
- **Resource limits**:
  - CPU budget per tick (hard timeout)
  - Memory ceiling
  - Maximum message size (observation/action payload caps)
- **No ambient authority**:
  - no filesystem, no network, no process access
  - no access to engine objects outside the defined API

Security rules:

- Never `eval` bot code in the main simulation thread.
- Never pass engine objects by reference into bot code.
- Prefer structured cloning / serialization boundaries.

---

## 7. Data-First Design

Use data files to define content and balance knobs:

- Arena presets (size, walls, spawn points)
- Weapon/projectile stats
- Item drops
- Match rules (time limit, scoring)

Code implements mechanics; data defines *what exists* and *with what numbers*.

---

## 8. Coding Style & Readability

- Prefer clear names and simple control flow.
- Keep functions small; extract helpers for complex logic.
- Use early returns over deep nesting.
- **Keep files manageable**: prefer modules under ~**600 lines**; split large files by responsibility.
- When splitting code:
  - prefer creating new files over adding more nested conditionals in a single file
  - keep exports narrow and intentional (small public surface area)
  - keep related helpers colocated with the code they support
- Use comments when needed:
  - explain *why* (tradeoffs, invariants, determinism constraints)
  - avoid redundant comments that restate the code
- Add JSDoc on public modules and any tricky functions.

---

## 9. Testing & Verification

For any change that affects simulation correctness:

- Add tests that enforce determinism:
  - Same seed + same bot inputs → same outcome.
- Prefer “golden replay” tests:
  - Store a known seed + bot sources + expected winner / final score.
- Don’t claim something is fixed without describing the test path.

---

## 10. Performance in Hot Paths

The simulation tick loop is a hot path.

- Avoid heavy per-tick allocations in inner loops.
- Keep complexity roughly O(n) in entities per tick.
- Make debug features cheap when disabled.

---

## 11. Versioning, Bugs, and Housekeeping

- Update `Versions.md` for user-visible features and meaningful bug fixes.
- Track unfixed, reproducible issues in `Bugs.md` with repro steps.
- Track future work in `Todo.md` instead of leaving many inline TODOs.

---

## Working Agreement for AI Changes

When the AI edits this repository:

- It must **search and cite** relevant code locations (file path + identifier) before making non-trivial changes.
- It must keep patches small and reviewable.
- It must list:
  - files changed
  - what changed
  - why
  - how to test
