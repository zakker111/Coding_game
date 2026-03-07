import { generateSampleReplay } from '@coding-game/replay'
import { isRunLocalMessage } from './messages'
import { mixSeed } from './seed'

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isRunLocalMessage(event.data)) return

  const { requestId, seed, tickCap, bots } = event.data
  const mixedSeed = mixSeed(seed, bots)

  const replay = generateSampleReplay(mixedSeed, { tickCap })

  self.postMessage({
    type: 'RUN_RESULT',
    requestId,
    replay,
  })
})
