import type { Replay } from './replayTypes'

export async function loadMockReplay(): Promise<Replay> {
  const res = await fetch('/replays/mock-replay.json')

  if (!res.ok) {
    throw new Error(`Failed to load mock replay: ${res.status} ${res.statusText}`)
  }

  return (await res.json()) as Replay
}
