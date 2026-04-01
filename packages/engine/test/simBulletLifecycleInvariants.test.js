import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

import { assertReplayInvariants } from './_util/assertReplayInvariants.js'
import { assertBulletLifecycleInvariants } from './_util/assertBulletLifecycleInvariants.js'

test('runMatchToReplay: bullet lifecycle invariants (multi-seed)', () => {
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

  // Use a higher cap than the basic bullet invariant test to cover TTL and wall interactions.
  const requestedTickCap = 140

  let sawAnyBullet = false

  for (let seed = 200; seed < 220; seed++) {
    const replay = runMatchToReplay({ seed, tickCap: requestedTickCap, bots })

    // The engine may end early due to match end rules; the actual replay.tickCap is authoritative.
    assert.ok(replay.tickCap <= requestedTickCap)

    assertReplayInvariants(replay)
    assertBulletLifecycleInvariants(replay)

    for (const s of replay.state) {
      if (s.bullets.length) {
        sawAnyBullet = true
        break
      }
    }
  }

  assert.ok(sawAnyBullet, 'expected at least one bullet to appear in state across seeds')
})
