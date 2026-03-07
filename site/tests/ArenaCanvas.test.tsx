import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import mockReplay from '../public/replays/mock-replay.json'
import { ArenaCanvas, type ArenaBotId, type ArenaFrame } from '../../ui/arena/ArenaCanvas'

describe('ArenaCanvas', () => {
  it('renders a canvas for the mock replay tick 0', () => {
    const ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      closePath: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 10 })),
      arc: vi.fn(),
      fill: vi.fn(),
      quadraticCurveTo: vi.fn(),
    } as any

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((type) => {
      return type === '2d' ? (ctx as any) : null
    })

    const tick0 = mockReplay.state[0]
    const frame: ArenaFrame = {
      bots: tick0.bots.map((b) => ({
        id: Number(b.botId.replace('BOT', '')) as ArenaBotId,
        pos: b.pos,
        hp: b.hp,
      })),
    }

    const { container } = render(
      <div style={{ width: 400, height: 400 }}>
        <ArenaCanvas frame={frame} />
      </div>,
    )

    expect(container.querySelector('canvas')).toBeInTheDocument()
  })
})
