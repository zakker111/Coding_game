// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { mixSeed } from '../seed'

describe('mixSeed', () => {
  it('is deterministic and sensitive to bot source changes', () => {
    const bots = [
      { slotId: 'BOT1', sourceText: 'WAIT 1' },
      { slotId: 'BOT2', sourceText: 'WAIT 1' },
      { slotId: 'BOT3', sourceText: 'WAIT 1' },
      { slotId: 'BOT4', sourceText: 'WAIT 1' },
    ] as const

    const a = mixSeed(12345, [...bots])
    const b = mixSeed(12345, [...bots])
    expect(a).toBe(b)

    const c = mixSeed(12345, [...bots.slice(0, 3), { slotId: 'BOT4', sourceText: 'WAIT 2' }])
    expect(c).not.toBe(a)
  })
})
