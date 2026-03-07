import type { Replay, SlotId } from '@coding-game/replay'

export type BotSourceSpec = {
  slotId: SlotId
  sourceText: string
}

export type RunMatchParams = {
  /** Match seed (deterministic). */
  seed: number | string

  /** Maximum number of simulation ticks to produce in the replay. */
  tickCap: number

  /** Bot sources for the 4 match slots. */
  bots: BotSourceSpec[]
}

/**
 * Phase 1 scaffold.
 *
 * This preserves current Workshop behavior by delegating to the deterministic
 * sample replay generator in `@coding-game/replay`.
 */
export declare function runMatchToReplay(params: RunMatchParams): Replay
