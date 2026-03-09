import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

test('runMatchToReplay: TARGET_CLOSEST is resolved at set time (does not change as bots move)', () => {
  const bots = [
    {
      slotId: 'BOT1',
      // Tick1: pick target; Tick2: shoot stored TARGET.
      sourceText: ['TARGET_CLOSEST', 'FIRE_SLOT1 TARGET', ''].join('\n'),
    },
    { slotId: 'BOT2', sourceText: 'WAIT 1\n' },
    // BOT3 moves closer to BOT1 after tick1, so if TARGET were re-resolved at
    // shoot-time, the shot would incorrectly go to BOT3.
    { slotId: 'BOT3', sourceText: 'MOVE UP\n' },
    { slotId: 'BOT4', sourceText: 'WAIT 1\n' },
  ]

  const replay = runMatchToReplay({ seed: 1, tickCap: 3, bots })

  const spawnsT2 = replay.events[2].filter((e) => e.type === 'BULLET_SPAWN' && e.ownerBotId === 'BOT1')
  assert.equal(spawnsT2.length, 1, 'expected exactly one BOT1 bullet spawn at tick 2')
  assert.equal(spawnsT2[0].targetBotId, 'BOT2', 'expected BOT1 to shoot the BOT2 chosen on tick 1')
})
