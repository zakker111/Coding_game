import test from 'node:test'
import assert from 'node:assert/strict'

import { generateSampleReplay } from '../src/index.js'

test('generateSampleReplay is deterministic for a given seed', () => {
  const a = generateSampleReplay(12345)
  const b = generateSampleReplay(12345)

  assert.deepStrictEqual(a, b)
})

test('generateSampleReplay changes output when seed changes', () => {
  const a = generateSampleReplay(12345)
  const b = generateSampleReplay(12346)

  assert.notDeepStrictEqual(a, b)
})
