import React from 'react'
import { useNavigate } from 'react-router-dom'

export function LandingPage() {
  const nav = useNavigate()
  const startRef = React.useRef<HTMLButtonElement | null>(null)

  React.useEffect(() => {
    startRef.current?.focus()
  }, [])

  return (
    <div className="landing">
      <div className="landing-card panel">
        <h1 className="title">Nowt</h1>
        <p className="subtitle">
          A deterministic bot-fighting coding game. Write bots, run matches, and inspect replays tick-by-tick.
        </p>

        <div className="actions">
          <button
            ref={startRef}
            className="ui-button"
            onClick={() => nav('/workshop')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') nav('/workshop')
            }}
          >
            Start Game
          </button>
        </div>

        <div style={{ marginTop: 28 }} className="panel landing-features">
          <div className="row">
            <div style={{ flex: '1 1 240px' }}>
              <strong>Deterministic</strong>
              <div className="muted" style={{ marginTop: 6 }}>
                Same seed + same inputs → identical outcome.
              </div>
            </div>
            <div style={{ flex: '1 1 240px' }}>
              <strong>Replayable</strong>
              <div className="muted" style={{ marginTop: 6 }}>
                Inspect matches with per-tick state and events.
              </div>
            </div>
            <div style={{ flex: '1 1 240px' }}>
              <strong>Safe</strong>
              <div className="muted" style={{ marginTop: 6 }}>
                Bots will run in a constrained DSL sandbox.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
