import { generateSampleReplay } from '@coding-game/replay'
import { isRunLocalMessage } from './messages'
import { mixSeed } from './seed'

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isRunLocalMessage(event.data)) return

  const { requestId, seed, tickCap, bots } = event.data
  const mixedSeed = mixSeed(seed, bots)

  // Pass bot sources into the sample generator so features like SAW are enabled
  // when the user bot source contains those instructions.
  const replay = generateSampleReplay(mixedSeed, {
    tickCap,
    bots: bots.map((b) => ({ slotId: b.slotId, sourceText: b.sourceText })),
  })

  self.postMessage({
    type: 'RUN_RESULT',
    requestId,
    replay,
  })
})
