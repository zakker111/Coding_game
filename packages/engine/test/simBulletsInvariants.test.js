import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'
import { ARENA_MAX, ARENA_MIN, BULLET_SPEED_UNITS_PER_TICK } from '../src/sim/constants.js'

function assertFiniteInBoundsPos(pos, label) {
  assert.ok(pos && Number.isFinite(pos.x) && Number.isFinite(pos.y), `expected finite ${label}`)
  assert.ok(pos.x >= ARENA_MIN && pos.x <= ARENA_MAX, `expected ${label}.x in bounds, got ${pos.x}`)
  assert.ok(pos.y >= ARENA_MIN && pos.y <= ARENA_MAX, `expected ${label}.y in bounds, got ${pos.y}`)
}

test('runMatchToReplay: bullets despawn and ammo only decreases via SHOOT', () => {
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

  for (const seed of [1, 7, 42, 123, 4242]) {
    const replay = runMatchToReplay({ seed, tickCap: 120, bots })

    /** @type {Map<string, number>} */
    const spawnTickByBulletId = new Map()

    /** @type {Map<string, number[]>} */
    const moveTicksByBulletId = new Map()

    /** @type {Map<string, number[]>} */
    const hitTicksByBulletId = new Map()

    /** @type {Map<string, {tick: number, reason: string, pos: {x:number,y:number}}>} */
    const despawnByBulletId = new Map()

    /** @type {Map<number, Set<string>>} */
    const bulletIdsInStateByTick = new Map()

    for (const s of replay.state) {
      bulletIdsInStateByTick.set(s.t, new Set(s.bullets.map((b) => b.bulletId)))
      for (const b of s.bullets) {
        assertFiniteInBoundsPos(b.pos, `state bullet.pos at seed=${seed} t=${s.t} (${b.bulletId})`)
      }
    }

    for (let t = 1; t < replay.events.length; t++) {
      const tickEvents = replay.events[t]

      for (const e of tickEvents) {
        if (e.type === 'BULLET_SPAWN') {
          spawnTickByBulletId.set(e.bulletId, t)
          assertFiniteInBoundsPos(e.pos, `BULLET_SPAWN.pos at seed=${seed} t=${t} (${e.bulletId})`)

          // Regression guard: bullet velocity must not overspeed diagonally.
          const v2 = e.vel.x * e.vel.x + e.vel.y * e.vel.y
          assert.ok(
            v2 <= BULLET_SPEED_UNITS_PER_TICK * BULLET_SPEED_UNITS_PER_TICK,
            `expected bullet speed^2 <= ${BULLET_SPEED_UNITS_PER_TICK ** 2}, got ${v2} (vel=${e.vel.x},${e.vel.y}) at seed=${seed} t=${t}`
          )
        }

        if (e.type === 'BULLET_MOVE') {
          moveTicksByBulletId.set(e.bulletId, [...(moveTicksByBulletId.get(e.bulletId) ?? []), t])
          assertFiniteInBoundsPos(e.fromPos, `BULLET_MOVE.fromPos at seed=${seed} t=${t} (${e.bulletId})`)
          assertFiniteInBoundsPos(e.toPos, `BULLET_MOVE.toPos at seed=${seed} t=${t} (${e.bulletId})`)
        }

        if (e.type === 'BULLET_HIT') {
          hitTicksByBulletId.set(e.bulletId, [...(hitTicksByBulletId.get(e.bulletId) ?? []), t])
          assertFiniteInBoundsPos(e.hitPos, `BULLET_HIT.hitPos at seed=${seed} t=${t} (${e.bulletId})`)

          assert.ok(
            tickEvents.some(
              (other) =>
                other.type === 'DAMAGE' &&
                other.source === 'BULLET' &&
                other.victimBotId === e.victimBotId &&
                other.sourceRef?.type === 'BULLET' &&
                other.sourceRef?.id === e.bulletId
            ),
            `expected same-tick bullet DAMAGE for ${e.bulletId} at seed=${seed} t=${t}`
          )

          assert.ok(
            tickEvents.some(
              (other) => other.type === 'BULLET_DESPAWN' && other.bulletId === e.bulletId && other.reason === 'HIT'
            ),
            `expected same-tick HIT despawn for ${e.bulletId} at seed=${seed} t=${t}`
          )
        }

        if (e.type === 'BULLET_DESPAWN') {
          assert.ok(!despawnByBulletId.has(e.bulletId), `expected at most one despawn for ${e.bulletId} at seed=${seed}`)
          assert.ok(['WALL', 'TTL', 'HIT'].includes(e.reason), `unexpected despawn reason for ${e.bulletId} at seed=${seed}`)
          assertFiniteInBoundsPos(e.pos, `BULLET_DESPAWN.pos at seed=${seed} t=${t} (${e.bulletId})`)

          despawnByBulletId.set(e.bulletId, { tick: t, reason: e.reason, pos: e.pos })

          const bulletIdsInState = bulletIdsInStateByTick.get(t)
          assert.ok(
            bulletIdsInState && !bulletIdsInState.has(e.bulletId),
            `expected despawned bullet ${e.bulletId} to be absent in end-of-tick state at seed=${seed} t=${t}`
          )
        }

        if (e.type === 'RESOURCE_DELTA' && e.ammoDelta < 0) {
          assert.equal(e.cause, 'SHOOT', 'expected ammo decreases to be caused by SHOOT')
          assert.equal(e.ammoDelta, -1, 'expected shoot ammo delta to be -1')
        }
      }
    }

    assert.ok(spawnTickByBulletId.size > 0, `expected at least one bullet to be spawned at seed=${seed}`)

    const lifetimes = []

    for (const [bulletId, spawnTick] of spawnTickByBulletId) {
      const hitTicks = hitTicksByBulletId.get(bulletId) ?? []
      const moveTicks = moveTicksByBulletId.get(bulletId) ?? []
      const despawn = despawnByBulletId.get(bulletId)

      assert.ok(hitTicks.length <= 1, `expected at most one BULLET_HIT for ${bulletId} at seed=${seed}`)
      assert.ok(moveTicks.length > 0, `expected at least one BULLET_MOVE for ${bulletId} at seed=${seed}`)

      if (!despawn) continue

      assert.ok(despawn.tick >= spawnTick, `expected despawn tick to be at/after spawn tick for ${bulletId} at seed=${seed}`)
      lifetimes.push(despawn.tick - spawnTick)
    }

    assert.ok(lifetimes.length > 0, `expected at least one bullet despawn to be observed at seed=${seed}`)

    const maxObservedLifetime = Math.max(...lifetimes)

    for (const [bulletId, spawnTick] of spawnTickByBulletId) {
      const despawn = despawnByBulletId.get(bulletId)

      if (!despawn) {
        const endTickBullets = bulletIdsInStateByTick.get(replay.tickCap)
        assert.ok(endTickBullets && endTickBullets.has(bulletId), `expected live bullet ${bulletId} in final state at seed=${seed}`)
        assert.ok(
          replay.tickCap - spawnTick <= maxObservedLifetime + 2,
          `expected bullet ${bulletId} spawned at t=${spawnTick} to despawn within replay window at seed=${seed}`
        )
        continue
      }

      for (let t = despawn.tick; t <= replay.tickCap; t++) {
        const bulletIdsInState = bulletIdsInStateByTick.get(t)
        assert.ok(
          bulletIdsInState && !bulletIdsInState.has(bulletId),
          `expected bullet ${bulletId} to be absent from state at seed=${seed} tick ${t}`
        )
      }
    }

    // Stronger ammo invariant: any observed ammo decrease for BOT2 must coincide with a BULLET_SPAWN.
    for (let t = 1; t < replay.state.length; t++) {
      const prevAmmo = replay.state[t - 1].bots.find((b) => b.botId === 'BOT2')?.ammo
      const nextAmmo = replay.state[t].bots.find((b) => b.botId === 'BOT2')?.ammo
      assert.ok(typeof prevAmmo === 'number' && typeof nextAmmo === 'number')

      if (nextAmmo < prevAmmo) {
        const tickEvents = replay.events[t]
        assert.ok(tickEvents.some((e) => e.type === 'BULLET_SPAWN' && e.ownerBotId === 'BOT2'))
        assert.ok(
          tickEvents.some((e) => e.type === 'RESOURCE_DELTA' && e.botId === 'BOT2' && e.ammoDelta === nextAmmo - prevAmmo && e.cause === 'SHOOT')
        )
      }
    }
  }
})
