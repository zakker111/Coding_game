import test from 'node:test'

import { runMatchToReplay } from '@coding-game/engine'

import { assertReplayInvariants } from './_util/assertReplayInvariants.js'

test('runMatchToReplay: basic replay invariants hold across many seeds', () => {
  const bots = [
    { slotId: 'BOT1', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
    {
      slotId: 'BOT2',
      loadout: ['BULLET', null, null],
      sourceText: [
        '; fire repeatedly (subject to cooldown)',
        'LABEL LOOP',
        'IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 BOT1',
        'GOTO LOOP',
        '',
      ].join('\n'),
    },
    { slotId: 'BOT3', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
    { slotId: 'BOT4', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
  ]

  // Keep this moderate so local runs stay fast, but large enough to catch
  // weird corner cases.
  const tickCap = 80

  for (let seed = 100; seed < 120; seed++) {
    const replay = runMatchToReplay({ seed, tickCap, bots })
    assertReplayInvariants(replay)
  }
})
