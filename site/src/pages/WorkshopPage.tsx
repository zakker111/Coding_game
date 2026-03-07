import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { loadMockReplay } from '../replay/loadMockReplay'
import type { Replay } from '../replay/replayTypes'
import { ArenaCanvas } from '../ui/arena/ArenaCanvas'

const SPEED_STORAGE_KEY = 'nowt.workshop.speed'
const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4] as const

type Speed = (typeof SPEED_OPTIONS)[number]

type Playhead = {
  /**
   * `ArenaCanvas` interprets `tick` as the "end-of-tick" snapshot index.
   * During playback we render tick `t` with `p∈[0,1]` interpolating from state[t-1] → state[t].
   */
  tick: number
  /** Intra-tick progress in [0,1]. */
  p: number
}

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(v)))
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function readSpeedFromStorage(): Speed {
  try {
    const raw = window.localStorage.getItem(SPEED_STORAGE_KEY)
    const v = raw ? Number(raw) : NaN
    if (SPEED_OPTIONS.includes(v as Speed)) return v as Speed
  } catch {
    // ignore
  }
  return 1
}

function writeSpeedToStorage(speed: Speed) {
  try {
    window.localStorage.setItem(SPEED_STORAGE_KEY, String(speed))
  } catch {
    // ignore
  }
}

function readTickFromSearch(search: string) {
  const sp = new URLSearchParams(search)
  const raw = sp.get('tick')
  const v = raw ? Number(raw) : NaN
  return Number.isFinite(v) ? Math.floor(v) : null
}

function replaceTickInSearch(search: string, tick: number) {
  const sp = new URLSearchParams(search)
  sp.set('tick', String(tick))
  const next = sp.toString()
  return next ? `?${next}` : ''
}

export function WorkshopPage() {
  const location = useLocation()
  const navigate = useNavigate()

  const [replay, setReplay] = React.useState<Replay | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const [speed, setSpeed] = React.useState<Speed>(() => {
    if (typeof window === 'undefined') return 1
    return readSpeedFromStorage()
  })

  const [playing, setPlaying] = React.useState(false)

  // When paused/scrubbing/stepping, we keep p=1 (exact tick snapshot).
  const [head, setHead] = React.useState<Playhead>({ tick: 0, p: 1 })

  React.useEffect(() => {
    let cancelled = false

    loadMockReplay()
      .then((r) => {
        if (cancelled) return
        setReplay(r)
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })

    return () => {
      cancelled = true
    }
  }, [])

  const maxTick = replay ? Math.max(0, replay.state.length - 1) : 0

  // Initialize tick from URL (only after replay loads so we can clamp).
  React.useEffect(() => {
    if (!replay) return

    const fromUrl = readTickFromSearch(location.search)
    if (fromUrl === null) return

    setHead((h) => {
      const nextTick = clampInt(fromUrl, 0, maxTick)
      if (h.tick === nextTick && h.p === 1) return h
      return { tick: nextTick, p: 1 }
    })
  }, [location.search, maxTick, replay])

  // Keep URL query param in sync.
  React.useEffect(() => {
    if (!replay) return

    const cur = readTickFromSearch(location.search)
    if (cur === head.tick) return

    navigate({ pathname: location.pathname, search: replaceTickInSearch(location.search, head.tick) }, { replace: true })
  }, [head.tick, location.pathname, location.search, navigate, replay])

  React.useEffect(() => {
    writeSpeedToStorage(speed)
  }, [speed])

  // Playback loop.
  React.useEffect(() => {
    if (!replay) return
    if (!playing) return

    const tps = replay.ticksPerSecond || 1

    let raf = 0
    let last = performance.now()

    const step = (now: number) => {
      const dt = Math.max(0, (now - last) / 1000)
      last = now

      const dp = dt * tps * speed

      setHead((h) => {
        let tick = h.tick
        let p = h.p + dp

        while (p >= 1 && tick < maxTick) {
          p -= 1
          tick += 1
        }

        if (tick >= maxTick) {
          return { tick: maxTick, p: 1 }
        }

        return { tick, p: clamp(p, 0, 1) }
      })

      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [maxTick, playing, replay, speed])

  // Auto-stop at the end.
  React.useEffect(() => {
    if (!playing) return
    if (!replay) return

    if (head.tick >= maxTick && head.p >= 1) {
      setPlaying(false)
      setHead((h) => ({ tick: h.tick, p: 1 }))
    }
  }, [head.p, head.tick, maxTick, playing, replay])

  const tickLabel = replay ? `Tick ${head.tick} / ${maxTick}` : 'Loading replay…'

  const onPlayPause = () => {
    if (!replay) return

    setPlaying((v) => {
      const next = !v

      // If we are starting playback, shift to the next tick with p=0 to animate state[t] -> state[t+1].
      if (next) {
        setHead((h) => {
          if (h.tick >= maxTick) return { tick: maxTick, p: 1 }

          const nextTick = clampInt(h.tick + 1, 0, maxTick)
          // tick=0 has no prior tick; ArenaCanvas forces p=1 anyway.
          return nextTick === 0 ? { tick: 0, p: 1 } : { tick: nextTick, p: 0 }
        })
      } else {
        // Pausing snaps to exact tick.
        setHead((h) => ({ tick: h.tick, p: 1 }))
      }

      return next
    })
  }

  const onSeekTick = (t: number) => {
    if (!replay) return
    setPlaying(false)
    setHead({ tick: clampInt(t, 0, maxTick), p: 1 })
  }

  const stepBy = (delta: number) => {
    if (!replay) return
    setPlaying(false)
    setHead((h) => ({ tick: clampInt(h.tick + delta, 0, maxTick), p: 1 }))
  }

  return (
    <div className="page workshop">
      <header className="ws-header">
        <div className="ws-brand">
          <h1 className="ws-brand-title">Workshop</h1>
          <div className="ws-brand-subtitle">Replay viewer prototype (client-only)</div>
        </div>

        <div className="ws-header-controls" aria-label="Workshop controls">
          <button className="btn btn-secondary" type="button" onClick={onPlayPause} disabled={!replay}>
            {playing ? 'Pause' : 'Play'}
          </button>

          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => stepBy(-1)}
            disabled={!replay || playing}
            title="Step back one tick"
          >
            Step -1
          </button>

          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => stepBy(1)}
            disabled={!replay || playing}
            title="Step forward one tick"
          >
            Step +1
          </button>

          <div>
            <label htmlFor="speed" style={{ marginRight: 6 }}>
              Speed
            </label>
            <select
              id="speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value) as Speed)}
              disabled={!replay}
            >
              {SPEED_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </div>

          <div className="ws-status" role="status" aria-live="polite">
            {tickLabel}
          </div>
        </div>
      </header>

      <div className="ws-body">
        {!replay && !error && <div className="card" style={{ padding: 16 }}>Loading replay…</div>}
        {error && (
          <div className="card" style={{ padding: 16, borderColor: 'rgba(255, 107, 107, 0.4)' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Failed to load replay</div>
            <div style={{ color: 'rgba(233, 239, 255, 0.72)' }}>{error}</div>
          </div>
        )}

        {replay && (
          <section className="panel" aria-label="Arena">
            <div className="panel-header">
              <h2 className="panel-title">Arena</h2>
              <div className="panel-meta">
                seed <span style={{ color: 'rgba(233, 239, 255, 0.9)' }}>{String(replay.matchSeed)}</span>
              </div>
            </div>
            <div className="panel-body">
              <div className="arena-viewport" aria-label="Arena viewport">
                <ArenaCanvas replay={replay} tick={head.tick} p={playing ? head.p : 1} />
              </div>

              <div style={{ marginTop: 12 }}>
                <input
                  type="range"
                  min={0}
                  max={maxTick}
                  step={1}
                  value={playing ? Math.max(0, head.tick - 1) : head.tick}
                  onChange={(e) => onSeekTick(Number(e.target.value))}
                  aria-label="Replay tick"
                  disabled={!replay || playing}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
