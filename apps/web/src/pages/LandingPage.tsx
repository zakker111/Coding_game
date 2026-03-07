import React from 'react'
import { Link } from 'react-router-dom'

export function LandingPage() {
  return (
    <>
      <h1 className="title">Nowt</h1>
      <p className="subtitle">
        A deterministic bot-fighting coding game. Write bots, run matches, and inspect replays tick-by-tick.
      </p>

      <div className="actions">
        <Link className="ui-button" to="/workshop">
          Start
        </Link>
      </div>

      <div style={{ marginTop: 28 }} className="panel">
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
    </>
  )
}
