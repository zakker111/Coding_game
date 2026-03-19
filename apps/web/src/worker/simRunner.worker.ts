import { isRunLocalMessage } from './messages'
import { runMatchLocal } from './runMatchLocal'

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isRunLocalMessage(event.data)) return

  const { requestId, seed, tickCap, bots } = event.data

  const replay = runMatchLocal(seed, tickCap, bots)

  self.postMessage({
    type: 'RUN_RESULT',
    requestId,
    replay,
  })
})
