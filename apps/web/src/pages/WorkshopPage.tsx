import React from 'react'

import type { Replay, SlotId } from '@coding-game/replay'

import { initialPlaybackState, playbackReducer } from '../replay/playbackReducer'
import { getAppearanceColorMap, getBotsForPlayback, SLOT_IDS } from '../replay/interpolate'
import { ArenaCanvas, type ArenaRenderState } from '../ui/arena'
import { runLocalInWorker } from '../worker/runLocalInWorker'

const STORAGE_KEY = 'nowt:workshop:drafts:v1'

const DEFAULT_SOURCES: Record<SlotId, string> = {
  BOT1: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n',
  BOT2: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n',
  BOT3: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n',
  BOT4: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n',
}

export function WorkshopPage() {
  const [seed, setSeed] = React.useState<number>(12345)
  const [tickCap, setTickCap] = React.useState<number>(200)

  const [sources, setSources] = React.useState<Record<SlotId, string>>(DEFAULT_SOURCES)
  const [editingBotId, setEditingBotId] = React.useState<SlotId>('BOT1')
  const [selectedBotId, setSelectedBotId] = React.useState<SlotId>('BOT1')

  const [running, setRunning] = React.useState(false)
  const [runError, setRunError] = React.useState<string | null>(null)

  const [playback, dispatch] = React.useReducer(playbackReducer, initialPlaybackState)
  const [alpha, setAlpha] = React.useState(1)

  // Load local draft.
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<Record<SlotId, string>>

      setSources((prev) => ({
        BOT1: typeof parsed.BOT1 === 'string' ? parsed.BOT1 : prev.BOT1,
        BOT2: typeof parsed.BOT2 === 'string' ? parsed.BOT2 : prev.BOT2,
        BOT3: typeof parsed.BOT3 === 'string' ? parsed.BOT3 : prev.BOT3,
        BOT4: typeof parsed.BOT4 === 'string' ? parsed.BOT4 : prev.BOT4,
      }))
    } catch {
      // ignore malformed localStorage
    }
  }, [])

  // Persist draft.
  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sources))
    } catch {
      // ignore quota/unavailable
    }
  }, [sources])

  // Playback clock (requestAnimationFrame).
  React.useEffect(() => {
    const replay = playback.replay
    if (!replay) return

    if (!playback.playing) {
      setAlpha(1)
      return
    }

    let rafId = 0
    let lastNow = performance.now()
    let accMs = 0

    const tickMs = 1000 / replay.ticksPerSecond

    const frame = (now: number) => {
      const dt = now - lastNow
      lastNow = now

      // speed is a multiplier on real time
      accMs += dt * playback.speed

      const steps = Math.floor(accMs / tickMs)
      if (steps > 0) {
        accMs -= steps * tickMs
        dispatch({ type: 'STEP', delta: steps })
      }

      setAlpha(accMs / tickMs)
      rafId = window.requestAnimationFrame(frame)
    }

    rafId = window.requestAnimationFrame(frame)
    return () => window.cancelAnimationFrame(rafId)
  }, [playback.playing, playback.speed, playback.replay])

  const replay = playback.replay

  const appearanceMap = React.useMemo(() => {
    return replay ? getAppearanceColorMap(replay) : ({} as Record<SlotId, string>)
  }, [replay])

  const botsForRender = React.useMemo(() => {
    if (!replay) return []
    return getBotsForPlayback(replay, playback.tick, playback.playing ? alpha : 1)
  }, [alpha, playback.playing, playback.tick, replay])

  const bulletsForRender = React.useMemo(() => {
    if (!replay) return []

    const t = clamp(playback.tick, 0, replay.tickCap)
    const a = playback.playing ? alpha : 1

    const next = replay.state[t]
    const prev = t > 0 ? replay.state[t - 1] : next

    if (!next || !prev) return []

    const prevById = new Map(prev.bullets.map((b) => [b.bulletId, b]))

    return next.bullets.map((b) => {
      const p = prevById.get(b.bulletId) ?? b
      return {
        bulletId: b.bulletId,
        ownerBotId: b.ownerBotId,
        pos: {
          x: p.pos.x + (b.pos.x - p.pos.x) * a,
          y: p.pos.y + (b.pos.y - p.pos.y) * a,
        },
        vel: b.vel,
      }
    })
  }, [alpha, playback.playing, playback.tick, replay])

  const renderState: ArenaRenderState = React.useMemo(() => {
    return {
      bots: botsForRender.map((b) => ({
        slotId: b.botId,
        pos: b.pos,
        hp: b.hp,
        ammo: b.ammo,
        energy: b.energy,
        alive: b.alive,
        appearanceColor: appearanceMap[b.botId],
      })),
      bullets: bulletsForRender,
    }
  }, [appearanceMap, botsForRender, bulletsForRender])

  const selectedBotSnapshot = botsForRender.find((b) => b.botId === selectedBotId)

  async function handleRun() {
    setRunning(true)
    setRunError(null)

    try {
      const bots = SLOT_IDS.map((slotId) => ({ slotId, sourceText: sources[slotId] }))
      const nextReplay: Replay = await runLocalInWorker({ seed, tickCap, bots })
      dispatch({ type: 'LOAD_REPLAY', replay: nextReplay })
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  const speedButtons = [0.5, 1, 2, 6] as const
  const effectiveTickCap = replay?.tickCap ?? tickCap

  return (
    <>
      <div className="workshop-header">
        <div>
          <h1 className="workshop-title">Workshop</h1>
          <div className="subtitle">Edit bots, run a deterministic local match, and inspect the replay.</div>
        </div>

        <div className="workshop-header-actions">
          <label className="mini-field">
            <div className="mini-label">Seed</div>
            <input
              className="mini-input"
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
            />
          </label>

          <label className="mini-field">
            <div className="mini-label">Tick cap</div>
            <input
              className="mini-input"
              type="number"
              value={tickCap}
              onChange={(e) => setTickCap(Math.max(1, Number(e.target.value)))}
            />
          </label>

          <button className="ui-button" onClick={handleRun} disabled={running}>
            {running ? 'Running…' : 'Run / Preview'}
          </button>
          <button className="ui-button ui-button-secondary" disabled>
            Save
          </button>
        </div>
      </div>

      {runError ? (
        <div className="panel" style={{ marginTop: 16, borderColor: 'rgba(239, 68, 68, 0.4)' }}>
          <strong style={{ color: '#fecaca' }}>Run failed</strong>
          <div className="muted" style={{ marginTop: 8 }}>
            {runError}
          </div>
        </div>
      ) : null}

      <div className="workshop-grid" style={{ marginTop: 16 }}>
        {/* Left: bot editor */}
        <section className="panel">
          <div className="panel-title">Bot editor</div>

          <div className="tab-row" style={{ marginTop: 10 }}>
            {SLOT_IDS.map((id) => (
              <button
                key={id}
                className={['tab', id === editingBotId ? 'active' : ''].join(' ')}
                onClick={() => setEditingBotId(id)}
              >
                {id}
              </button>
            ))}
          </div>

          <textarea
            className="code-editor"
            value={sources[editingBotId]}
            onChange={(e) => setSources((prev) => ({ ...prev, [editingBotId]: e.target.value }))}
            spellCheck={false}
          />

          <div className="muted" style={{ marginTop: 10 }}>
            DSL compilation isn’t wired yet. For now, bot source affects the replay seed.
          </div>
        </section>

        {/* Center: arena + playback */}
        <section className="panel">
          <div className="panel-title">Arena</div>

          <div className="arena-wrap" style={{ marginTop: 10 }}>
            <ArenaCanvas renderState={renderState} selectedBotId={selectedBotId} />
          </div>

          <div className="controls" style={{ marginTop: 12 }}>
            <button
              className="ui-button ui-button-secondary"
              onClick={() => dispatch({ type: 'TOGGLE_PLAY' })}
              disabled={!replay}
            >
              {playback.playing ? 'Pause' : 'Play'}
            </button>

            <button
              className="ui-button ui-button-secondary"
              onClick={() => dispatch({ type: 'STEP', delta: 1 })}
              disabled={!replay || playback.playing}
            >
              Step
            </button>

            <button
              className="ui-button ui-button-secondary"
              onClick={() => dispatch({ type: 'RESTART' })}
              disabled={!replay}
            >
              Restart
            </button>

            <span className="muted" style={{ marginLeft: 8 }}>
              tick {playback.tick} / {effectiveTickCap}
            </span>
          </div>

          <div className="controls" style={{ marginTop: 10 }}>
            <div className="muted">Speed</div>
            {speedButtons.map((s) => (
              <button
                key={s}
                className={['chip', playback.speed === s ? 'active' : ''].join(' ')}
                onClick={() => dispatch({ type: 'SET_SPEED', speed: s })}
                disabled={!replay}
              >
                {s}×
              </button>
            ))}
          </div>

          <div style={{ marginTop: 10 }}>
            <input
              type="range"
              min={0}
              max={effectiveTickCap}
              value={clamp(playback.tick, 0, effectiveTickCap)}
              onChange={(e) => dispatch({ type: 'SET_TICK', tick: Number(e.target.value) })}
              disabled={!replay || playback.playing}
            />
          </div>
        </section>

        {/* Right: reference + inspector */}
        <section className="panel">
          <div className="panel-title">Inspector</div>

          <div className="tab-row" style={{ marginTop: 10 }}>
            {SLOT_IDS.map((id) => (
              <button
                key={id}
                className={['tab', id === selectedBotId ? 'active' : ''].join(' ')}
                onClick={() => setSelectedBotId(id)}
              >
                {id}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 12 }} className="muted">
            {selectedBotSnapshot ? (
              <>
                <div>
                  <strong style={{ color: 'var(--text)' }}>{selectedBotId}</strong>
                </div>
                <div style={{ marginTop: 8 }}>HP: {selectedBotSnapshot.hp}</div>
                <div>Ammo: {selectedBotSnapshot.ammo}</div>
                <div>Energy: {selectedBotSnapshot.energy}</div>
                <div>Alive: {selectedBotSnapshot.alive ? 'yes' : 'no'}</div>
              </>
            ) : (
              'Run a replay to inspect bots.'
            )}
          </div>

          <div style={{ marginTop: 18 }}>
            <div className="panel-title">Loadout (local-only)</div>
            <div className="muted" style={{ marginTop: 8 }}>
              Slot 1 / Slot 2 / Slot 3 (coming soon)
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div className="panel-title">Instruction reference</div>
            <div className="muted" style={{ marginTop: 8 }}>
              See <code>BotInstructions.md</code> for the full DSL.
            </div>
          </div>
        </section>
      </div>
    </>
  )
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
