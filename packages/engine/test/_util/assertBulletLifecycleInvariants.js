import assert from 'node:assert/strict'

function isNonEmptyString(s) {
  return typeof s === 'string' && s.length > 0
}

/**
 * Assert bullet lifecycle invariants based on replay state+events.
 *
 * This is a test-only checker that ensures bullets:
 * - spawn once
 * - move exactly once per tick while alive
 * - despawn at most once with an allowed reason
 * - never "teleport" into/out of state without matching spawn/despawn events
 *
 * Notes on tick semantics:
 * - `replay.state[t]` is the end-of-tick snapshot for tick `t`.
 * - `replay.events[t]` contains all events that happened during tick `t`.
 *
 * @param {any} replay
 */
export function assertBulletLifecycleInvariants(replay) {
  assert.ok(replay && typeof replay === 'object', 'replay: expected object')
  assert.ok(Array.isArray(replay.state), 'replay.state: expected array')
  assert.ok(Array.isArray(replay.events), 'replay.events: expected array')
  assert.equal(replay.state.length, replay.events.length, 'expected state/events same length')

  const tickCap = replay.state.length - 1

  /** @type {Array<Set<string>>} */
  const bulletsInState = []
  for (let t = 0; t <= tickCap; t++) {
    const s = replay.state[t]
    assert.ok(s && typeof s === 'object', `state[${t}]: expected object`)
    assert.ok(Array.isArray(s.bullets), `state[${t}].bullets: expected array`)

    const set = new Set()
    for (const b of s.bullets) {
      assert.ok(b && typeof b === 'object', `state[${t}].bullets[*]: expected object`)
      assert.ok(isNonEmptyString(b.bulletId), `state[${t}].bullets[*].bulletId: expected non-empty string`)
      set.add(b.bulletId)
    }
    bulletsInState[t] = set
  }

  /** @type {Map<string, number>} */
  const spawnTickById = new Map()

  /** @type {Map<string, { tick: number, reason: string }>} */
  const despawnById = new Map()

  /** @type {Array<Set<string>>} */
  const spawnsByTick = Array.from({ length: tickCap + 1 }, () => new Set())

  /** @type {Array<Map<string, number>>} */
  const moveCountByTick = Array.from({ length: tickCap + 1 }, () => new Map())

  /** @type {Array<Set<string>>} */
  const despawnsByTick = Array.from({ length: tickCap + 1 }, () => new Set())

  for (let t = 0; t <= tickCap; t++) {
    const tickEvents = replay.events[t]
    assert.ok(Array.isArray(tickEvents), `events[${t}]: expected array`)

    for (const e of tickEvents) {
      if (!e || typeof e !== 'object') continue

      if (e.type === 'BULLET_SPAWN') {
        assert.ok(isNonEmptyString(e.bulletId), `events[${t}].BULLET_SPAWN.bulletId: expected non-empty string`)
        assert.ok(!spawnTickById.has(e.bulletId), `bullet ${e.bulletId} spawned more than once`)
        spawnTickById.set(e.bulletId, t)
        spawnsByTick[t].add(e.bulletId)
      }

      if (e.type === 'BULLET_MOVE') {
        assert.ok(isNonEmptyString(e.bulletId), `events[${t}].BULLET_MOVE.bulletId: expected non-empty string`)
        const m = moveCountByTick[t]
        m.set(e.bulletId, (m.get(e.bulletId) ?? 0) + 1)
      }

      if (e.type === 'BULLET_DESPAWN') {
        assert.ok(isNonEmptyString(e.bulletId), `events[${t}].BULLET_DESPAWN.bulletId: expected non-empty string`)
        assert.ok(!despawnById.has(e.bulletId), `bullet ${e.bulletId} despawned more than once`)
        assert.ok(['HIT', 'WALL', 'TTL'].includes(e.reason), `bullet ${e.bulletId} despawn reason must be HIT/WALL/TTL`)
        despawnById.set(e.bulletId, { tick: t, reason: e.reason })
        despawnsByTick[t].add(e.bulletId)
      }
    }
  }

  // Every bullet that appears in state must have exactly one spawn tick and it must be <= that tick.
  for (let t = 0; t <= tickCap; t++) {
    for (const bulletId of bulletsInState[t]) {
      const st = spawnTickById.get(bulletId)
      assert.ok(st !== undefined, `bullet ${bulletId} appears in state but has no BULLET_SPAWN event`)
      assert.ok(st <= t, `bullet ${bulletId} appears in state at tick ${t} but spawned at tick ${st}`)

      const d = despawnById.get(bulletId)
      if (d) {
        assert.ok(d.tick > t, `bullet ${bulletId} appears in state at tick ${t} but despawned at tick ${d.tick}`)
      }
    }
  }

  // Bullet must not appear in state before its spawn tick.
  for (const [bulletId, spawnTick] of spawnTickById) {
    for (let t = 0; t < spawnTick; t++) {
      assert.ok(!bulletsInState[t].has(bulletId), `bullet ${bulletId} present in state at tick ${t} before spawn tick ${spawnTick}`)
    }
  }

  // Bullet must not appear in state at/after despawn tick.
  for (const [bulletId, d] of despawnById) {
    const spawnTick = spawnTickById.get(bulletId)
    assert.ok(spawnTick !== undefined, `bullet ${bulletId} despawned but has no spawn tick`)
    assert.ok(d.tick >= spawnTick, `bullet ${bulletId} despawned at tick ${d.tick} before spawning at ${spawnTick}`)

    for (let t = d.tick; t <= tickCap; t++) {
      assert.ok(!bulletsInState[t].has(bulletId), `bullet ${bulletId} present in state at/after despawn tick ${d.tick} (tick ${t})`)
    }
  }

  // Tick-local lifecycle + coverage.
  for (let t = 1; t <= tickCap; t++) {
    const startSet = new Set(bulletsInState[t - 1])
    for (const id of spawnsByTick[t]) startSet.add(id)

    const moveCounts = moveCountByTick[t]

    // Each bullet alive at start-of-tick (plus spawns) must have exactly one move.
    for (const id of startSet) {
      assert.equal(moveCounts.get(id) ?? 0, 1, `tick ${t}: expected exactly 1 BULLET_MOVE for ${id}`)
    }

    // No extra moves for bullets that aren't alive/spawned this tick.
    for (const [id, n] of moveCounts) {
      assert.ok(startSet.has(id), `tick ${t}: BULLET_MOVE for ${id} but bullet not alive/spawned this tick`)
      assert.equal(n, 1, `tick ${t}: expected BULLET_MOVE count 1 for ${id}, got ${n}`)
    }

    // Any despawn must be paired with a move in the same tick.
    for (const id of despawnsByTick[t]) {
      assert.equal(moveCounts.get(id) ?? 0, 1, `tick ${t}: expected BULLET_MOVE for despawned bullet ${id}`)
    }

    // Bullets must not disappear from state without a despawn event.
    for (const id of bulletsInState[t - 1]) {
      if (bulletsInState[t].has(id)) continue
      assert.ok(despawnsByTick[t].has(id), `tick ${t}: bullet ${id} disappeared from state without BULLET_DESPAWN`)
    }

    // Bullets must not appear in state without a spawn event that tick.
    for (const id of bulletsInState[t]) {
      if (bulletsInState[t - 1].has(id)) continue
      assert.ok(spawnsByTick[t].has(id), `tick ${t}: bullet ${id} appeared in state without BULLET_SPAWN`)
    }

    // Bullets that both spawn and despawn in the same tick must not appear in end-of-tick state.
    for (const id of spawnsByTick[t]) {
      if (!despawnsByTick[t].has(id)) continue
      assert.ok(!bulletsInState[t].has(id), `tick ${t}: bullet ${id} spawned+despawned but still present in end-of-tick state`)
    }
  }
}
