import test from 'node:test'
import assert from 'node:assert/strict'

import { supercoverPoints } from '../src/sim/bresenham.js'

test('supercoverPoints: includes start and end for trivial segment', () => {
  assert.deepStrictEqual(supercoverPoints({ x: 5, y: 7 }, { x: 5, y: 7 }), [{ x: 5, y: 7 }])
})

test('supercoverPoints: covers all integer points on axis-aligned segment', () => {
  assert.deepStrictEqual(supercoverPoints({ x: 0, y: 0 }, { x: 3, y: 0 }), [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
  ])

  assert.deepStrictEqual(supercoverPoints({ x: 3, y: 0 }, { x: 0, y: 0 }), [
    { x: 3, y: 0 },
    { x: 2, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 0 },
  ])
})

test('supercoverPoints: diagonal corner-crossing emits orthogonal neighbors deterministically', () => {
  // This segment causes a diagonal step. The supercover should include both
  // orthogonal neighbors touched at the corner-crossing.
  assert.deepStrictEqual(supercoverPoints({ x: 0, y: 0 }, { x: 2, y: 1 }), [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    // diagonal corner-crossing at the second step:
    { x: 2, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
  ])
})
