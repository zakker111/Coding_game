import { EXAMPLE_OPPONENT_IDS, type ExampleBotId } from './exampleBots'

export type ExampleOpponentId = Exclude<ExampleBotId, 'bot0'>

function createRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    // xorshift32
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

/**
 * Deterministically selects `count` distinct opponent ids from the example pool (bot1..bot4).
 */
export function selectOpponents(seed: number, count = 3): ExampleOpponentId[] {
  if (count <= 0) return []
  if (EXAMPLE_OPPONENT_IDS.length < count) {
    throw new Error(`Not enough example opponents (${EXAMPLE_OPPONENT_IDS.length}) for count=${count}`)
  }

  const rng = createRng(seed)
  const arr = [...EXAMPLE_OPPONENT_IDS]

  // Deterministic Fisher–Yates shuffle.
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }

  return arr.slice(0, count)
}
