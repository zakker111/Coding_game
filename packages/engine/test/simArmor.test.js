import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'
import { BULLET_DAMAGE } from '../src/sim/constants.js'

test('runMatchToReplay: ARMOR reduces bullet damage (events + state)', () => {
  const bots = [
    {
      slotId: 'BOT1',
      loadout: ['BULLET', null, null],
      sourceText: ['LABEL LOOP', 'IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 BOT2', 'GOTO LOOP', ''].join('\n'),
    },
    {
      slotId: 'BOT2',
      loadout: [null, 'ARMOR', null],
      sourceText: ['WAIT 1', ''].join('\n'),
    },
    { slotId: 'BOT3', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
    { slotId: 'BOT4', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
  ]

  const replay = runMatchToReplay({ seed: 123, tickCap: 60, bots })

  const allEvents = replay.events.flat()

  const expectedDamage = BULLET_DAMAGE - Math.floor(BULLET_DAMAGE / 3)

  const bulletHits = allEvents.filter((e) => e && e.type === 'BULLET_HIT' && e.victimBotId === 'BOT2')
  assert.ok(bulletHits.length > 0, 'expected at least one bullet hit on BOT2')
  assert.equal(BULLET_DAMAGE, 10)
  assert.ok(
    bulletHits.every((e) => e.damage === expectedDamage),
    `expected BULLET_HIT damage to be reduced from ${BULLET_DAMAGE} to ${expectedDamage} when ARMOR is equipped`
  )

  const bulletDamageEvents = allEvents.filter(
    (e) => e && e.type === 'DAMAGE' && e.victimBotId === 'BOT2' && e.source === 'BULLET'
  )
  assert.ok(bulletDamageEvents.length > 0, 'expected at least one DAMAGE event from BULLET on BOT2')
  assert.ok(
    bulletDamageEvents.every((e) => e.amount === expectedDamage),
    `expected DAMAGE.amount to be reduced from ${BULLET_DAMAGE} to ${expectedDamage} when ARMOR is equipped`
  )
})
