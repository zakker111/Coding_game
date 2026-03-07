import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

import mockReplay from '../public/replays/mock-replay.json'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// jsdom doesn’t provide ResizeObserver.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any
}

Object.defineProperty(window, 'devicePixelRatio', {
  value: 1,
  writable: true,
})

// Make replay loading deterministic and avoid real network calls in tests.
// Node's `fetch` works in Vitest, but would attempt an HTTP request for our static asset.
if (!('fetch' in globalThis)) {
  ;(globalThis as any).fetch = vi.fn()
}

const originalFetch = globalThis.fetch

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).fetch = vi.fn(async (input: any) => {
  const url = String(input)

  if (url.includes('mock-replay.json')) {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => mockReplay,
    }
  }

  if (typeof originalFetch === 'function') {
    return originalFetch(input)
  }

  throw new Error(`Unexpected fetch in tests: ${url}`)
})
