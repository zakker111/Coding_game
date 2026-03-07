import React from 'react'
import { generateSampleReplay } from '@coding-game/replay'

import { ArenaCanvas, type ArenaFrame } from '../ui/arena/ArenaCanvas'

type SlotId = 'BOT1' | 'BOT2' | 'BOT3' | 'BOT4'

function slotIdToBotId(slotId: SlotId): 1 | 2 | 3 | 4 {
  switch (slotId) {
    case 'BOT1':
      return 1
    case 'BOT2':
      return 2
    case 'BOT3':
      return 3
    case 'BOT4':
      return 4
  }
}

export function WorkshopPage() {
  const replay = React.useMemo(() => generateSampleReplay(12345), [])

  const [t, setT] = React.useState(0)
  const [playing, setPlaying] = React.useState(false)

  const tickCap = replay.tickCap

  React.useEffect(() => {
    if (!playing) return

    const tickEveryMs = 120
    const id = window.setInterval(() => {
      setT((prev) => (prev >= tickCap ? 0 : prev + 1))
    }, tickEveryMs)

    return () => window.clearInterval(id)
  }, [playing, tickCap])

  const tick = replay.state[t] ?? replay.state[0]

  const frame: ArenaFrame = React.useMemo(() => {
    return {
      bots: tick.bots.map((b) => ({
        id: slotIdToBotId(b.botId as SlotId),
        pos: { x: b.pos.x, y: b.pos.y },
        hp: b.hp,
      })),
      bullets: tick.bullets?.map((b) => ({
        id: b.bulletId,
        ownerBotId: slotIdToBotId(b.ownerBotId as SlotId),
        pos: { x: b.pos.x, y: b.pos.y },
        vel: { x: b.vel.x, y: b.vel.y },
      })),
      powerups: [],
    }
  }, [tick])

  return (
    <>
      <h1 style={{ fontSize: 34, margin: 0 }}>Workshop</h1>
      <p className="subtitle">
        MVP: scrub a deterministic sample replay and render the arena. Next: bot editor, local runner, and a full replay
        viewer.
      </p>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="controls">
          <button
            className="ui-button"
            style={{ padding: '10px 14px' }}
            onClick={() => setPlaying((v) => !v)}
          >
            {playing ? 'Pause' : 'Play'}
          </button>

          <button
            className="ui-button"
            style={{ padding: '10px 14px' }}
            onClick={() => setT((v) => Math.max(0, v - 1))}
            disabled={playing}
          >
            Step -1
          </button>

          <button
            className="ui-button"
            style={{ padding: '10px 14px' }}
            onClick={() => setT((v) => Math.min(tickCap, v + 1))}
            disabled={playing}
          >
            Step +1
          </button>

          <span className="muted" style={{ marginLeft: 8 }}>
            tick {t} / {tickCap}
          </span>
        </div>

        <div style={{ marginTop: 12 }}>
          <input
            type="range"
            min={0}
            max={tickCap}
            value={t}
            onChange={(e) => setT(Number(e.target.value))}
            disabled={playing}
          />
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div style={{ width: '100%', height: 560 }}>
          <ArenaCanvas frame={frame} />
        </div>
      </div>
    </>
  )
}
