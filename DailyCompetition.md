# DailyCompetition.md — Daily Server-Side Competition (Season Points + Threshold)

This document captures the current plan for **daily server-side simulations** where eligible bots are grouped into matches and earn **points**. Bots that fall below a configured **points threshold** stop being scheduled until the owner re-enables them.

It complements:
- `ServerPlan.md`
- `BotInstructions.md`
- `Todo.md`

---

## 1) Goal

Each day:
- the server snapshots the set of eligible bots,
- runs deterministic headless matches in **groups of 4**,
- awards points from match outcomes,
- updates each bot’s **season points**,
- stops scheduling bots that drop below a configured threshold,
- publishes a daily leaderboard and stores replays.

Each week:
- highlight the **top 10 bots**,
- reset and start a new season.

---

## 2) Key concepts

### 2.1 Season
A season is a fixed period (e.g., 7 days) during which points accumulate.

Recommended fields:
- `season_id`
- `starts_at`, `ends_at`
- `ruleset_version`
- `eligible_points_threshold`

### 2.2 Bot season status
Each bot needs a per-season status:
- `season_points` (integer)
- `active_for_next_run` (boolean)
- `last_active_run_date`

Interpretation:
- Bots **above threshold** can remain active automatically.
- Bots **below threshold** are not scheduled, unless the owner explicitly re-enables them.

---

## 3) Eligibility snapshot (daily run)

At the start of the daily run (e.g., midnight UTC):
- snapshot all bot entries where:
  - `active_for_next_run == true`, and
  - `season_points >= eligible_points_threshold`
- freeze:
  - `ruleset_version`
  - a `run_seed`

This prevents mid-run edits from affecting the run.

---

## 4) Match format and scheduling

### 4.1 Match format (locked direction)
- Daily run matches are **4-player matches** (four bots in one arena).

> Note: You wrote “4v4”. The current engine planning assumes up to 4 bots per arena. If you truly mean 8 bots per match (4v4 teams), the arena/simulation spec must be updated.

### 4.2 Scheduling model (multi-round grouping)

Within a daily run, the server repeatedly:
1) deterministically shuffles the active bot list using `run_seed`
2) groups bots into batches of 4
3) runs each match and assigns points
4) updates `season_points`
5) removes bots that fall below the threshold from the remaining schedule

This continues until one of these stop conditions is met:
- fewer than 4 bots remain eligible for another match
- a configured `max_rounds_per_day` is reached

This provides the behavior you described: bots that drop below a threshold “are not included in another match” for that day (and potentially future days unless re-enabled).

---

## 5) Points and elimination threshold

### 5.1 Points
The scoring formula is not finalized. The server should compute points as a pure function:
- inputs: match placements + match stats
- output: points delta per bot

Common v1 approach (simple):
- 4-bot match placement points:
  - 1st: +X
  - 2nd: +Y
  - 3rd: +Z
  - 4th: +W

Optional add-ons (later):
- damage dealt bonus
- survival ticks bonus

### 5.2 Threshold
A bot is considered "in" the competition if:
- `season_points >= eligible_points_threshold`

When a bot drops below threshold:
- it finishes the current match (obviously)
- it is **not scheduled** for additional matches
- it remains excluded until the owner re-enables it

---

## 6) Re-enabling a bot (owner intent)

You described a manual “verify intent” action to allow a bot back into daily runs.

Server-side interpretation (no UI details):
- a user can set `active_for_next_run = true` for a bot version
- eligibility still requires meeting the threshold rules (or you may optionally allow a “rejoin grace” mechanic)

This should be recorded as an auditable event:
- who re-enabled
- when
- which bot version/loadout was active

---

## 7) Determinism requirements

For a given daily run, results must be reproducible from stored artifacts:
- `season_id`
- `run_seed`
- per-match `match_seed` derived from (`run_seed`, round index, match index)
- exact bot versions (source hashes + loadouts)
- exact ruleset version

---

## 8) Outputs to publish/store

Per match:
- placements
- points deltas
- replay reference

Per daily run:
- list of participating bot versions
- updated season points table
- daily leaderboard snapshot

Per season:
- final rankings
- top 10 snapshot

---

## 9) Open decisions (need confirmation)

1) When a bot drops below threshold, is it excluded:
   - **A)** only for the remainder of today’s run, or
   - **B)** for all future days until re-enabled?

2) If a bot is below threshold, can the owner re-enable it and have it participate:
   - **A)** only if it already meets the threshold, or
   - **B)** with a “rejoin allowance” (e.g., reset its points to threshold, or give a minimum points floor)?

3) How many matches should each eligible bot play per day (cap)?
   - unlimited until eliminated vs `max_matches_per_bot_per_day`.

4) Weekly reset:
   - what happens to points at reset? (set to 0 vs set to default baseline)
