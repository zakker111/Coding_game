import * as React from 'react'
import { generateSampleReplay, type Replay } from '@coding-game/replay'
import { ArenaCanvas, type ArenaFrame } from '../../../ui/arena/ArenaCanvas'

type BotName = 'me/bot1' | 'me/bot2' | 'me/bot3'
type SlotId = 'BOT1' | 'BOT2' | 'BOT3' | 'BOT4'

type LoadoutSlot = '' | 'BULLET' | 'SAW' | 'SHIELD' | 'BOOST'

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

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function tickToFrame(replay: Replay, tFloat: number): ArenaFrame {
  const tickCap = replay.tickCap
  const t0 = Math.max(0, Math.min(tickCap, Math.floor(tFloat)))
  const t1 = Math.max(0, Math.min(tickCap, t0 + 1))
  const alpha = t0 === t1 ? 0 : Math.min(1, Math.max(0, tFloat - t0))

  const s0 = replay.state[t0] ?? replay.state[0]
  const s1 = replay.state[t1] ?? s0

  const botColorBySlot: Partial<Record<SlotId, string>> = Object.fromEntries(
    replay.bots.map((b) => [b.slotId, b.appearance?.color] as const),
  )

  const bots1ById = new Map<SlotId, (typeof s1.bots)[number]>()
  for (const b of s1.bots) bots1ById.set(b.botId as SlotId, b)

  const bots: ArenaFrame['bots'] = s0.bots.map((b0) => {
    const botId = b0.botId as SlotId
    const b1 = bots1ById.get(botId)

    const x = b1 ? lerp(b0.pos.x, b1.pos.x, alpha) : b0.pos.x
    const y = b1 ? lerp(b0.pos.y, b1.pos.y, alpha) : b0.pos.y

    return {
      id: slotIdToBotId(botId),
      pos: { x, y },
      hp: b0.hp,
      color: botColorBySlot[botId],
    }
  })

  const bullets: ArenaFrame['bullets'] = s0.bullets?.map((b) => ({
    id: b.bulletId,
    pos: { x: b.pos.x, y: b.pos.y },
    vel: b.vel ? { x: b.vel.x, y: b.vel.y } : undefined,
  }))

  return { bots, bullets, powerups: [] }
}

export function WorkshopPage() {
  const [seed, setSeed] = React.useState(12345)
  const replay = React.useMemo(() => generateSampleReplay(seed, { tickCap: 200 }), [seed])

  const [myBot, setMyBot] = React.useState<BotName>('me/bot1')
  const [editorText, setEditorText] = React.useState(
    'LABEL LOOP\nTARGET_CLOSEST\nMOVE_DIR\nGOTO LOOP\n',
  )

  const [inspectBot, setInspectBot] = React.useState<SlotId>('BOT1')

  const [slot1, setSlot1] = React.useState<LoadoutSlot>('BULLET')
  const [slot2, setSlot2] = React.useState<LoadoutSlot>('')
  const [slot3, setSlot3] = React.useState<LoadoutSlot>('')

  const tickCap = replay.tickCap
  const tps = replay.ticksPerSecond || 1

  const [speed, setSpeed] = React.useState(1)
  const [playing, setPlaying] = React.useState(false)
  const [playhead, setPlayhead] = React.useState(0)

  React.useEffect(() => {
    if (!playing) return

    let raf = 0
    let last = performance.now()

    const step = (now: number) => {
      const dt = Math.max(0, (now - last) / 1000)
      last = now

      setPlayhead((prev) => {
        const next = prev + dt * speed * tps
        return next > tickCap ? 0 : next
      })

      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, tickCap, tps])

  const playheadForRender = playing ? playhead : Math.round(playhead)
  const t0 = Math.floor(playheadForRender)

  const frame = React.useMemo(
    () => tickToFrame(replay, playheadForRender),
    [replay, playheadForRender],
  )

  const wsStatus = playing ? 'Playing' : 'Idle'

  const runPreview = () => {
    // Placeholder for the real local simulation runner.
    // For now we generate a deterministic sample replay from a new seed.
    setPlaying(false)
    setPlayhead(0)
    setSeed((s) => s + 1)
  }

  return (
    <div className="page workshop">
      <header className="ws-header">
        <div className="ws-brand">
          <h1 className="ws-brand-title">Workshop</h1>
          <div className="ws-brand-subtitle">Edit BOT1 → Run / Preview → Replay</div>
        </div>

        <div className="ws-header-controls" aria-label="Workshop header controls">
          <div>
            <label htmlFor="myBotSelect">BOT1</label>
            <select
              id="myBotSelect"
              className="ws-select"
              value={myBot}
              onChange={(e) => setMyBot(e.target.value as BotName)}
            >
              <option value="me/bot1">me/bot1</option>
              <option value="me/bot2">me/bot2</option>
              <option value="me/bot3">me/bot3</option>
            </select>
          </div>

          <button className="btn btn-secondary" type="button" disabled>
            Save (placeholder)
          </button>
          <button className="btn btn-primary" type="button" onClick={runPreview}>
            Run / Preview
          </button>

          <div className="ws-status" role="status" aria-live="polite">
            {wsStatus}
          </div>
        </div>
      </header>

      <div className="ws-body">
        <div className="ws-grid" role="main">
          <section className="panel" aria-label="Editor">
            <div className="panel-header">
              <h2 className="panel-title">Editor</h2>
              <div className="panel-meta">
                Editing: <span>{myBot}</span>
              </div>
            </div>
            <div className="panel-body">
              <textarea
                className="ws-editor-textarea"
                spellCheck={false}
                aria-label="BOT1 code editor"
                value={editorText}
                onChange={(e) => setEditorText(e.target.value)}
              />
            </div>
          </section>

          <section className="panel" aria-label="Arena and replay controls">
            <div className="panel-header">
              <h2 className="panel-title">Arena</h2>
              <div className="panel-meta">Tick {t0} / {tickCap}</div>
            </div>
            <div className="panel-body">
              <div className="arena-viewport" aria-label="Arena viewport">
                <ArenaCanvas frame={frame} />
              </div>

              <div className="replay-controls" aria-label="Replay controls">
                <div className="replay-controls-left">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => {
                      if (playing) {
                        setPlaying(false)
                        setPlayhead((p) => Math.round(p))
                      } else {
                        setPlaying(true)
                      }
                    }}
                  >
                    {playing ? 'Pause' : 'Play'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setPlayhead((v) => Math.min(tickCap, Math.floor(v) + 1))}
                    disabled={playing}
                  >
                    Step +1
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setPlayhead(0)}
                    disabled={playing}
                  >
                    Restart
                  </button>
                </div>

                <div className="replay-controls-right">
                  <button
                    className="chip"
                    type="button"
                    onClick={() => setSpeed((s) => (s >= 4 ? 0.25 : s * 2))}
                    title="Click to change speed"
                  >
                    Speed: {speed}×
                  </button>
                  <span className="chip">Seed: {seed}</span>
                  <span className="chip">Inspecting: {inspectBot}</span>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <input
                  type="range"
                  min={0}
                  max={tickCap}
                  value={Math.min(tickCap, Math.max(0, playheadForRender))}
                  step={1}
                  onChange={(e) => setPlayhead(Number(e.target.value))}
                  aria-label="Replay playhead"
                  disabled={playing}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </section>

          <section className="panel" aria-label="Help and inspector">
            <div className="panel-header">
              <h2 className="panel-title">Inspector</h2>
              <div className="panel-meta">Reference + bot stats (prototype)</div>
            </div>
            <div className="panel-body">
              <div className="inspector-grid">
                <div className="subcard">
                  <div className="subcard-title">Instruction cheatsheet</div>
                  <ul className="help-list">
                    <li>
                      <code>LABEL X</code> / <code>GOTO X</code>
                    </li>
                    <li>
                      <code>TARGET_POWERUP HEALTH|AMMO|ENERGY</code>
                    </li>
                    <li>
                      <code>MOVE_TO_TARGET</code>
                    </li>
                    <li>
                      <code>USE_SLOT1 TARGET</code>
                    </li>
                  </ul>
                  <div className="code-sample" aria-label="Cheatsheet example">
                    ; example
                    {'\n'}TARGET_POWERUP HEALTH
                    {'\n'}MOVE_TO_TARGET
                  </div>
                </div>

                <div className="subcard">
                  <div className="subcard-title">Bot list</div>
                  <div>
                    <label htmlFor="inspectBotSelect">Inspect</label>
                    <select
                      id="inspectBotSelect"
                      value={inspectBot}
                      onChange={(e) => setInspectBot(e.target.value as SlotId)}
                    >
                      <option value="BOT1">BOT1 (you)</option>
                      <option value="BOT2">BOT2 (builtin)</option>
                      <option value="BOT3">BOT3 (builtin)</option>
                      <option value="BOT4">BOT4 (builtin)</option>
                    </select>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <span style={{ color: 'rgba(233, 239, 255, 0.72)', fontSize: 12 }}>
                      Stats at playhead tick:
                    </span>{' '}
                    <span style={{ color: 'rgba(233, 239, 255, 0.9)', fontSize: 12 }}>
                      (not wired)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="ws-loadout" aria-label="Loadout">
          <div className="panel-header ws-loadout-header">
            <h2 className="panel-title">Loadout (BOT1)</h2>
            <div className="panel-meta">3 slots (local-only in v1)</div>
          </div>

          <div className="ws-loadout-row">
            <div className="loadout-field">
              <label htmlFor="slot1">Slot 1</label>
              <select id="slot1" value={slot1} onChange={(e) => setSlot1(e.target.value as LoadoutSlot)}>
                <option value="">(empty)</option>
                <option value="BULLET">BULLET (weapon)</option>
                <option value="SAW">SAW (weapon)</option>
                <option value="SHIELD">SHIELD</option>
                <option value="BOOST">BOOST</option>
              </select>
            </div>

            <div className="loadout-field">
              <label htmlFor="slot2">Slot 2</label>
              <select id="slot2" value={slot2} onChange={(e) => setSlot2(e.target.value as LoadoutSlot)}>
                <option value="">(empty)</option>
                <option value="BULLET">BULLET (weapon)</option>
                <option value="SAW">SAW (weapon)</option>
                <option value="SHIELD">SHIELD</option>
                <option value="BOOST">BOOST</option>
              </select>
            </div>

            <div className="loadout-field">
              <label htmlFor="slot3">Slot 3</label>
              <select id="slot3" value={slot3} onChange={(e) => setSlot3(e.target.value as LoadoutSlot)}>
                <option value="">(empty)</option>
                <option value="BULLET">BULLET (weapon)</option>
                <option value="SAW">SAW (weapon)</option>
                <option value="SHIELD">SHIELD</option>
                <option value="BOOST">BOOST</option>
              </select>
            </div>
          </div>

          <p className="ws-loadout-note">
            Reminder: loadout affects movement speed (see Ruleset). (Not wired in prototype.)
          </p>
        </footer>
      </div>
    </div>
  )
}
