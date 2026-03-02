# BotModelPlan.md — Future-proof Bot Identity, Versions, and Reproducibility (Planning)

This document defines a **future-proof bot model** that works for:
- **v1 client-only**: built-in opponent bots + local draft (no server)
- **future server**: user-submitted bots, immutable versions, matchmaking, ladders

It complements:
- `BotInstructions.md` (the DSL)
- `Ruleset.md` (simulation rules)
- `ReplayViewerPlan.md` (replay schema and viewer UX)
- `ServerPlan.md` (server entities)
- `UIPlan.md` (workshop flow)

---

## 1) Two different “IDs”: match slots vs bot identity

### 1.1 Match slot IDs (always `BOT1..BOT4`)
- **Match slot IDs** are deterministic engine identifiers: `BOT1|BOT2|BOT3|BOT4`.
- They are used inside:
  - the DSL (e.g. `SET_TARGET BOT3`)
  - replay events (e.g. `BOT_EXEC botId=BOT2`)

These are *not* user bot identities. They only identify a participant **within a single match**.

### 1.2 Bot identity (stable across matches)
We will eventually have real user-created bots. Those need a stable identity:
- `botId`: stable identifier for a “bot project” (lineage)
  - examples: `alice/greedy`, `community/sniper-101`, `builtin/chaser-shooter`

In v1 client-only mode, built-in bots should already use **stable botIds** (namespaced under `builtin/…`) so we don’t have to migrate later.

### 1.3 Bot appearance (avatars / pictures / gifs)
Avatar/appearance is **presentation-only** (it must not affect determinism or match results), but it still needs a stable home in the model.

**Plan (future-proof, v1-simple):**
- Store avatar metadata on **Bot** (identity-level), not on BotVersion.
  - Rationale: the avatar is part of the bot’s “persona” and should persist across code iterations.
  - BotVersion stays focused on reproducibility: source + hashes + pinned ruleset/DSL + loadout.
- Allow (optional, post-v1) overrides in BotVersion only if we later want “skins per version”. If we add this, it should be explicit (e.g. `appearanceOverride` / `skinRef`) and not required.

**Bot (identity) fields (planning-level):**
- `displayName`
- `appearance` (aka avatar), e.g.
  - v1: `{ kind: "COLOR", color: "#RRGGBB" }`
  - future: `{ kind: "IMAGE", fallbackColor: "#RRGGBB", avatarRef: { assetId?, contentHash?, url? } }`

**Replay rule:** because replays must be viewable offline and long after assets move, each replay must include a small per-slot **appearance snapshot** in its header (at least a fallback color; optionally an immutable reference like `contentHash`). See `ReplayViewerPlan.md`.

---

## 2) Bot versions (immutable snapshots)

A bot identity can have many immutable versions.

### 2.1 BotVersion (server concept; still useful on client)
Each bot version is an immutable snapshot containing:
- `botId`
- `botVersion` (monotonic integer, or semver-style string)
- `sourceText` (the DSL script)
- `sourceHash` (hash of the exact source bytes after canonicalization)
- `compiledIrHash` (hash of canonical compiled form / opcodes)
- `rulesetVersion` (pinned)
- `dslVersion` (pinned)
- `loadout` (3 slots; may contain null; validated by rules)

**Reproducibility rule:** a match must reference bot versions by hash (at least `sourceHash`, ideally also `compiledIrHash`).

### 2.2 Canonicalization (important for hash stability)
Before hashing bot source:
- normalize newlines (LF)
- trim trailing whitespace
- ignore blank lines
- ignore comment lines starting with `;` (per `BotInstructions.md` preprocessing)

Then compute `sourceHash` over the canonical form.

---

## 3) Bot contract pinning (ruleset + DSL)

To avoid “bot runs differently after an update”, each bot version should pin:
- `rulesetVersion` (SemVer)
- `dslVersion` (SemVer)

Policy recommendation:
- For ranked ladders/seasons: **exact pinning** (same major+minor+patch) for fairness.
- For casual/sandbox: optional compatibility ranges can be allowed, but must be explicit.

---

## 4) Replay manifest must separate slot IDs from bot identity

A replay should always include:
- match metadata: `schemaVersion`, `rulesetVersion`, `matchSeed`, `tickCap`, `ticksPerSecond`
- per-slot participant info:
  - `slotId`: `BOT1..BOT4`
  - `displayName`
  - `appearance` (presentation snapshot; see §1.3)
  - `loadout`
  - `sourceHash` (and optionally `compiledIrHash`)
  - **future fields:** `botId`, `botVersion` (or a server `botVersionId`)

This lets the viewer/debugger answer both:
- “What did BOT3 do on tick 87?” (slot)
- “Which published bot/version was BOT3 running?” (identity/version)

---

## 5) v1 client-only representation (what we should do now)

Even without a server, we should structure the workshop’s opponents as if they were “real” bots:

### 5.1 Built-in bots
- Each built-in bot ships with:
  - `botId` like `builtin/chaser-shooter`
  - `displayName`
  - `appearance` (v1: `{ kind: "COLOR", color: "#RRGGBB" }`; future: image/GIF refs)
  - `sourceText`
  - `loadout`
  - `rulesetVersion` + `dslVersion`
  - `sourceHash`

### 5.2 Local drafts
- Your editable bot is a **draft** (mutable), but when you run a match locally, the run should snapshot:
  - the exact draft `sourceText` at run time
  - `sourceHash`
  - `loadout`
  - pinned `rulesetVersion` + `dslVersion`

This ensures local replays are stable and forward-compatible with future server replays.

---

## 6) Future server model (planning only)

Server entities (high level):
- Bot (`botId`, owner, metadata)
- BotVersion (immutable: `sourceHash`, `compiledIrHash`, pins)

Server responsibilities:
- validate submissions
- compile to canonical internal IR (deterministically)
- store bot versions immutably
- execute headless matches with pinned `{rulesetVersion, dslVersion}`

Deprecation strategy (recommended):
- old ruleset/DSL majors become **replay-only** after sunset (no new matches, but replays remain viewable).

---

## 7) Open decisions to plan next (before implementing cloud bots)

1) Exact hashing rules (what canonicalization steps are part of the hash contract?)
2) Do we store `compiledIr` in replays, or only `compiledIrHash`?
3) Versioning model:
   - A) **single version**: DSL changes are part of `rulesetVersion`
   - B) **two versions**: `rulesetVersion` + `dslVersion` pinned separately (what this document currently assumes)
4) How do we handle running an old bot version when the client has a newer ruleset? (block vs compatibility adapter vs multi-ruleset support)
