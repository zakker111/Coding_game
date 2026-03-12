import { runMatchToReplay } from '@coding-game/engine'

import { isRunLocalMessage } from './messages'
import { mixSeed } from './seed'

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isRunLocalMessage(event.data)) return

  const { requestId, seed, tickCap, bots } = event.data
  const mixedSeed = mixSeed(seed, bots)

  const replay = runMatchToReplay({
    seed: mixedSeed,
    tickCap,
    bots: bots.map((b) => ({ slotId: b.slotId, sourceText: b.sourceText })),
  })

  self.postMessage({
    type: 'RUN_RESULT',
    requestId,
    replay,
  })
})
