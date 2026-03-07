import { generateSampleReplay } from '@coding-game/replay'

/**
 * Phase 1 scaffold.
 *
 * This preserves current Workshop behavior by delegating to the deterministic
 * sample replay generator in `@coding-game/replay`.
 *
 * Later phases will replace this with a ruleset-accurate engine + DSL VM.
 */
export function runMatchToReplay(params) {
  return generateSampleReplay(params.seed, {
    tickCap: params.tickCap,
    bots: params.bots,
  })
}
