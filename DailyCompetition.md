# DailyCompetition.md — Daily Server-Side Competition (All Bots Fight)

This document captures the current plan for **daily server-side simulations** where all eligible bots compete and receive points based on performance.

It complements:
- `ServerPlan.md`
- `BotInstructions.md`
- `Todo.md`

---

## 1) Goal

Each day:
- the server collects the set of eligible bot versions,
- runs deterministic headless matches,
- computes **daily points** per bot from match performance,
- publishes a daily leaderboard and stores replays.

---

## 2) Eligibility snapshot

At the start of a daily run (e.g., midnight UTC):
- Snapshot the set of participating **BotVersion** IDs.
- Freeze the ruleset reference (`ruleset_version`).

Typical eligibility policies (pick one later):
- “Latest submitted version per bot before cutoff”
- “User explicitly selects the version to enter today”
- “Only bots marked active”

---

## 3) Matchup model

You requested: **every bot that is entered fights each other**.

That is a **round-robin** schedule.

For N bots:
- number of matches = `N * (N-1) / 2` (for 1v1)

If matches can contain 3–4 bots:
- the schedule is not a simple pair list; you choose a grouping algorithm (still deterministic from `run_seed`).

### 3.1 Why this matters

- Round-robin is the most fair, but it becomes expensive as N grows.
- If N is large, you may need to cap matches per bot and use a Swiss-style schedule.

---

## 4) Determinism requirements

For a given day, results must be reproducible:
- daily run seed (`run_seed`)
- match seeds (`match_seed` derived from run_seed + matchup index)
- exact bot versions (source hashes + loadouts)
- exact ruleset version

---

## 5) Daily points (scoring)

The exact scoring formula is intentionally not locked yet. The server should be designed so that scoring is a pure function:

- inputs: match results + per-match stats
- output: per-bot daily points

### 5.1 Common scoring building blocks

- **Placement points**
  - 1v1: win/loss points
  - 4-bot: 1st/2nd/3rd/4th points

- **Performance stats** (optional)
  - damage dealt
  - damage taken
  - survival time (ticks alive)
  - powerups collected

### 5.2 Tie-break rules (deterministic)

If two bots have equal points:
- use deterministic tie-breakers, e.g.:
  1) head-to-head record
  2) total wins
  3) total damage dealt
  4) bot id ordering (last resort)

---

## 6) “Matchup tree” interpretation

If you truly mean a **tree/bracket** (single-elimination or double-elimination), that is different from “everyone fights everyone”.

The server can support either, but they produce different outcomes:
- **Round-robin**: maximum fairness; expensive at scale.
- **Bracket**: cheaper; more variance; seeding matters.

---

## 7) Outputs (what to store/publish)

Per daily run:
- per-bot daily points
- per-match outcomes
- replays (or replay references)
- daily leaderboard snapshot

---

## 8) Open decisions

- Match format used for the daily competition:
  - 1v1 only, or 2–4 bots per match?
- Scoring:
  - win/loss only vs win/loss + performance stats
- Scaling strategy:
  - full round-robin always vs cap matches per bot when N is large
- Cutoff rules for which bot version enters today
