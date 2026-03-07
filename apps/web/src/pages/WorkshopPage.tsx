import React from 'react'

import type { Replay, ReplayEvent, SlotId } from '@coding-game/replay'

import { EXAMPLE_BOTS, EXAMPLE_OPPONENT_IDS } from '../exampleBots'
import { createNewLocalBotId, createDefaultLocalBotLibrary, loadLocalBotLibrary, saveLocalBotLibrary, type LocalBotLibraryV1 } from '../localBots'
import { selectDistinctFromPool } from '../opponents'
import { fnv1a32 } from '../worker/seed'

import { initialPlaybackState, playbackReducer } from '../replay/playbackReducer'
import { getAppearanceColorMap, getBotsForPlayback, SLOT_IDS } from '../replay/interpolate'
import { ArenaCanvas, type ArenaRenderState } from '../ui/arena'
import { runLocalInWorker } from '../worker/runLocalInWorker'

const OPPONENT_NONCE_KEY = 'nowt:workshop:opponentNonce:v1'
const OPPONENT_ASSIGNMENTS_KEY = 'nowt:workshop:opponents:v1'

type OpponentAssignments = {
  BOT2: string
  BOT3: string
  BOT4: string
}

type StoredOpponentAssignmentsV1 = {
  version: 1
} & OpponentAssignments

const DEFAULT_OPPONENT_ASSIGNMENTS: StoredOpponentAssignmentsV1 = {
  version: 1,
  BOT2: 'bot2',
  BOT3: 'bot3',
  BOT4: 'bot4',
}

const OPPONENT_SLOTS = ['BOT2', 'BOT3', 'BOT4'] as const

function readOpponentNonce(): number {
  try {
    const raw = localStorage.getItem(OPPONENT_NONCE_KEY)
    const n = raw == null ? 0 : Number(raw)
    return Number.isFinite(n) ? (n >>> 0) : 0
  } catch {
    return 0
  }
}

function writeOpponentNonce(n: number) {
  try {
    localStorage.setItem(OPPONENT_NONCE_KEY, String(n >>> 0))
  } catch {
    // ignore
  }
}

function readOpponentAssignments(): OpponentAssignments {
  try {
    const raw = localStorage.getItem(OPPONENT_ASSIGNMENTS_KEY)
    if (!raw) return { BOT2: DEFAULT_OPPONENT_ASSIGNMENTS.BOT2, BOT3: DEFAULT_OPPONENT_ASSIGNMENTS.BOT3, BOT4: DEFAULT_OPPONENT_ASSIGNMENTS.BOT4 }

    const parsed = JSON.parse(raw) as Partial<StoredOpponentAssignmentsV1>
    if (parsed.version !== 1) return { BOT2: DEFAULT_OPPONENT_ASSIGNMENTS.BOT2, BOT3: DEFAULT_OPPONENT_ASSIGNMENTS.BOT3, BOT4: DEFAULT_OPPONENT_ASSIGNMENTS.BOT4 }

    return {
      BOT2: typeof parsed.BOT2 === 'string' ? parsed.BOT2 : DEFAULT_OPPONENT_ASSIGNMENTS.BOT2,
      BOT3: typeof parsed.BOT3 === 'string' ? parsed.BOT3 : DEFAULT_OPPONENT_ASSIGNMENTS.BOT3,
      BOT4: typeof parsed.BOT4 === 'string' ? parsed.BOT4 : DEFAULT_OPPONENT_ASSIGNMENTS.BOT4,
    }
  } catch {
    return { BOT2: DEFAULT_OPPONENT_ASSIGNMENTS.BOT2, BOT3: DEFAULT_OPPONENT_ASSIGNMENTS.BOT3, BOT4: DEFAULT_OPPONENT_ASSIGNMENTS.BOT4 }
  }
}

function normalizeOpponentAssignments(prev: OpponentAssignments, poolIds: string[]): OpponentAssignments {
  if (poolIds.length < 3) {
    throw new Error(`Not enough opponent choices (${poolIds.length})`)
  }

  const used = new Set<string>()
  const next: OpponentAssignments = { ...prev }

  for (const slot of OPPONENT_SLOTS) {
    const current = prev[slot]

    if (poolIds.includes(current) && !used.has(current)) {
      next[slot] = current
      used.add(current)
      continue
    }

    const replacement = poolIds.find((id) => !used.has(id))
    if (!replacement) break

    next[slot] = replacement
    used.add(replacement)
  }

  if (next.BOT2 === prev.BOT2 && next.BOT3 === prev.BOT3 && next.BOT4 === prev.BOT4) return prev
  return next
}

function isRelevantEvent(e: ReplayEvent, botId: SlotId): boolean {
  switch (e.type) {
    case 'BOT_EXEC':
    case 'BOT_MOVED':
    case 'RESOURCE_DELTA':
    case 'BUMP_WALL':
      return e.botId === botId
    case 'BUMP_BOT':
      return e.botId === botId || e.otherBotId === botId
    case 'BULLET_SPAWN':
      return e.ownerBotId === botId || e.targetBotId === botId
    case 'BULLET_HIT':
      return e.victimBotId === botId
    case 'DAMAGE':
      return e.victimBotId === botId || e.sourceBotId === botId
    case 'BOT_DIED':
      return e.victimBotId === botId || e.creditedBotId === botId
    default:
      return false
  }
}

type OpponentOption = {
  id: string
  displayName: string
  sourceText: string
}

export function WorkshopPage() {
  const [seed, setSeed] = React.useState<number>(12345)
  const [tickCap, setTickCap] = React.useState<number>(200)

  const starterSourceText = EXAMPLE_BOTS.bot0.sourceText

  const [myBots, setMyBots] = React.useState<LocalBotLibraryV1>(() => createDefaultLocalBotLibrary(starterSourceText))
  const [opponents, setOpponents] = React.useState<OpponentAssignments>({
    BOT2: DEFAULT_OPPONENT_ASSIGNMENTS.BOT2,
    BOT3: DEFAULT_OPPONENT_ASSIGNMENTS.BOT3,
    BOT4: DEFAULT_OPPONENT_ASSIGNMENTS.BOT4,
  })
  const [loaded, setLoaded] = React.useState(false)

  const [editingBotId, setEditingBotId] = React.useState<SlotId>('BOT1')
  const [selectedBotId, setSelectedBotId] = React.useState<SlotId>('BOT1')

  const [running, setRunning] = React.useState(false)
  const [runError, setRunError] = React.useState<string | null>(null)

  const [playback, dispatch] = React.useReducer(playbackReducer, initialPlaybackState)
  const [alpha, setAlpha] = React.useState(1)

  // Load local bot library + opponent selections.
  React.useEffect(() => {
    setMyBots(loadLocalBotLibrary(starterSourceText))
    setOpponents(readOpponentAssignments())
    setLoaded(true)
  }, [starterSourceText])

  // Persist my bots.
  React.useEffect(() => {
    if (!loaded) return
    saveLocalBotLibrary(myBots)
  }, [loaded, myBots])

  // Persist opponent selections.
  React.useEffect(() => {
    if (!loaded) return

    try {
      const stored: StoredOpponentAssignmentsV1 = { version: 1, ...opponents }
      localStorage.setItem(OPPONENT_ASSIGNMENTS_KEY, JSON.stringify(stored))
    } catch {
      // ignore quota/unavailable
    }
  }, [loaded, opponents])

  const selectedMyBot = React.useMemo(() => {
    return myBots.bots.find((b) => b.id === myBots.selectedBotId) ?? myBots.bots[0]
  }, [myBots])

  const opponentPool: OpponentOption[] = React.useMemo(() => {
    const exampleOpponents: OpponentOption[] = EXAMPLE_OPPONENT_IDS.map((id) => ({
      id,
      displayName: EXAMPLE_BOTS[id].displayName,
      sourceText: EXAMPLE_BOTS[id].sourceText,
    }))

    const localOpponents: OpponentOption[] = myBots.bots
      .filter((b) => b.id !== selectedMyBot.id)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((b) => ({
        id: b.id,
        displayName: `${b.name} (my bot)`,
        sourceText: b.sourceText,
      }))

    return [...exampleOpponents, ...localOpponents]
  }, [myBots.bots, selectedMyBot.id])

  const opponentPoolById = React.useMemo(() => {
    return new Map(opponentPool.map((o) => [o.id, o]))
  }, [opponentPool])

  const opponentPoolIds = React.useMemo(() => opponentPool.map((o) => o.id), [opponentPool])

  // Ensure BOT2..BOT4 are always valid + distinct for the current pool.
  React.useEffect(() => {
    setOpponents((prev) => normalizeOpponentAssignments(prev, opponentPoolIds))
  }, [opponentPoolIds])

  const sourcesBySlot: Record<SlotId, string> = React.useMemo(() => {
    return {
      BOT1: selectedMyBot.sourceText,
      BOT2: opponentPoolById.get(opponents.BOT2)?.sourceText ?? '',
      BOT3: opponentPoolById.get(opponents.BOT3)?.sourceText ?? '',
      BOT4: opponentPoolById.get(opponents.BOT4)?.sourceText ?? '',
    }
  }, [opponents.BOT2, opponents.BOT3, opponents.BOT4, opponentPoolById, selectedMyBot.sourceText])

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

  const selectedTickEvents = React.useMemo(() => {
    if (!replay) return []
    const t = clamp(playback.tick, 0, replay.tickCap)
    return (replay.events[t] ?? []).filter((e) => isRelevantEvent(e, selectedBotId))
  }, [playback.tick, replay, selectedBotId])

  function createNewBot() {
    setMyBots((prev) => {
      const id = createNewLocalBotId(prev.bots.map((b) => b.id))
      return {
        version: 1,
        selectedBotId: id,
        bots: [...prev.bots, { id, name: id, sourceText: starterSourceText }],
      }
    })
    setEditingBotId('BOT1')
  }

  function renameSelectedBot() {
    const current = selectedMyBot
    const next = window.prompt('Rename bot', current.name)
    if (next == null) return

    const trimmed = next.trim()
    if (!trimmed) return

    setMyBots((prev) => ({
      ...prev,
      bots: prev.bots.map((b) => (b.id === current.id ? { ...b, name: trimmed } : b)),
    }))
  }

  function deleteSelectedBot() {
    if (myBots.bots.length <= 1) return
    const ok = window.confirm(`Delete "${selectedMyBot.name}"?`)
    if (!ok) return

    setMyBots((prev) => {
      if (prev.bots.length <= 1) return prev

      const remaining = prev.bots.filter((b) => b.id !== prev.selectedBotId)
      const nextSelectedBotId = remaining[0]?.id ?? prev.selectedBotId

      return {
        version: 1,
        selectedBotId: nextSelectedBotId,
        bots: remaining.length ? remaining : prev.bots,
      }
    })

    setEditingBotId('BOT1')
  }

  function selectBotAsBot1(id: string) {
    setMyBots((prev) => ({ ...prev, selectedBotId: id }))
    setEditingBotId('BOT1')
  }

  function loadStarter() {
    setMyBots((prev) => ({
      ...prev,
      bots: prev.bots.map((b) => (b.id === prev.selectedBotId ? { ...b, sourceText: starterSourceText } : b)),
    }))
    setEditingBotId('BOT1')
  }

  function setOpponent(slot: keyof OpponentAssignments, id: string) {
    setOpponents((prev) => normalizeOpponentAssignments({ ...prev, [slot]: id }, opponentPoolIds))
  }

  function randomizeOpponents() {
    const nonce = readOpponentNonce()
    const randomizeSeed = (seed >>> 0) ^ fnv1a32(selectedMyBot.sourceText ?? '') ^ nonce

    const ids = selectDistinctFromPool(randomizeSeed, opponentPoolIds, 3)

    setOpponents({ BOT2: ids[0], BOT3: ids[1], BOT4: ids[2] })
    writeOpponentNonce((nonce + 1) >>> 0)
  }

  async function handleRun() {
    setRunning(true)
    setRunError(null)

    try {
      const bots = SLOT_IDS.map((slotId) => ({ slotId, sourceText: sourcesBySlot[slotId] }))
      const nextReplay: Replay = await runLocalInWorker({ seed, tickCap, bots })
      dispatch({ type: 'LOAD_REPLAY', replay: nextReplay })
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  function optionsForOpponentSlot(slot: keyof OpponentAssignments) {
    const otherSlots = OPPONENT_SLOTS.filter((s) => s !== slot)
    const usedByOtherSlots = new Set(otherSlots.map((s) => opponents[s]))

    return opponentPool.filter((o) => o.id === opponents[slot] || !usedByOtherSlots.has(o.id))
  }

  const speedButtons = [0.5, 1, 2, 6] as const
  const effectiveTickCap = replay?.tickCap ?? tickCap

  const editorSourceText = sourcesBySlot[editingBotId]
  const editorReadOnly = editingBotId !== 'BOT1'

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
            <input className="mini-input" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
          </label>

          <label className="mini-field">
            <div className="mini-label">Tick cap</div>
            <input className="mini-input" type="number" value={tickCap} onChange={(e) => setTickCap(Math.max(1, Number(e.target.value)))} />
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
          <div className="muted" style={{ marginTop: 8 }}>{runError}</div>
        </div>
      ) : null}

      <div className="workshop-grid" style={{ marginTop: 16 }}>
        {/* Left: bot editor */}
        <section className="panel">
          <div className="panel-title">My Bots</div>

          <div className="tab-row" style={{ marginTop: 10 }}>
            {myBots.bots.map((b) => (
              <button
                key={b.id}
                className={['tab', b.id === myBots.selectedBotId ? 'active' : ''].join(' ')}
                onClick={() => selectBotAsBot1(b.id)}
                title={b.id}
              >
                {b.name}
              </button>
            ))}
          </div>

          <div className="controls" style={{ marginTop: 10 }}>
            <button className="ui-button ui-button-secondary" type="button" onClick={createNewBot}>
              New bot
            </button>
            <button className="ui-button ui-button-secondary" type="button" onClick={renameSelectedBot}>
              Rename
            </button>
            <button className="ui-button ui-button-secondary" type="button" onClick={deleteSelectedBot} disabled={myBots.bots.length <= 1}>
              Delete
            </button>
          </div>

          <div className="panel-title" style={{ marginTop: 18 }}>
            Bot editor
          </div>

          <div className="tab-row" style={{ marginTop: 10 }}>
            {SLOT_IDS.map((id) => (
              <button key={id} className={['tab', id === editingBotId ? 'active' : ''].join(' ')} onClick={() => setEditingBotId(id)}>
                {id}
              </button>
            ))}
          </div>

          <div className="controls" style={{ marginTop: 10 }}>
            <button className="ui-button ui-button-secondary" type="button" onClick={loadStarter}>
              Load starter
            </button>

            <label className="mini-field">
              <div className="mini-label">BOT2</div>
              <select className="mini-input" value={opponents.BOT2} onChange={(e) => setOpponent('BOT2', e.target.value)}>
                {optionsForOpponentSlot('BOT2').map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label className="mini-field">
              <div className="mini-label">BOT3</div>
              <select className="mini-input" value={opponents.BOT3} onChange={(e) => setOpponent('BOT3', e.target.value)}>
                {optionsForOpponentSlot('BOT3').map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label className="mini-field">
              <div className="mini-label">BOT4</div>
              <select className="mini-input" value={opponents.BOT4} onChange={(e) => setOpponent('BOT4', e.target.value)}>
                {optionsForOpponentSlot('BOT4').map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.displayName}
                  </option>
                ))}
              </select>
            </label>

            <button className="ui-button ui-button-secondary" type="button" onClick={randomizeOpponents}>
              Randomize opponents
            </button>
          </div>

          {editorReadOnly ? (
            <div className="muted" style={{ marginTop: 10 }}>
              Opponent code is read-only. Select <strong style={{ color: 'var(--text)' }}>BOT1</strong> to edit your bot.
            </div>
          ) : null}

          <textarea
            className="code-editor"
            value={editorSourceText}
            readOnly={editorReadOnly}
            onChange={(e) => {
              if (editingBotId !== 'BOT1') return
              const nextSourceText = e.target.value
              setMyBots((prev) => ({
                ...prev,
                bots: prev.bots.map((b) => (b.id === prev.selectedBotId ? { ...b, sourceText: nextSourceText } : b)),
              }))
            }}
            spellCheck={false}
          />

          <div className="muted" style={{ marginTop: 10 }}>
            Tip: mentioning <code>SAW</code> in a bot source enables the sample melee behavior.
          </div>
        </section>

        {/* Center: arena + playback */}
        <section className="panel">
          <div className="panel-title">Arena</div>

          <div className="arena-wrap" style={{ marginTop: 10 }}>
            <ArenaCanvas renderState={renderState} selectedBotId={selectedBotId} />
          </div>

          <div className="controls" style={{ marginTop: 12 }}>
            <button className="ui-button ui-button-secondary" onClick={() => dispatch({ type: 'TOGGLE_PLAY' })} disabled={!replay}>
              {playback.playing ? 'Pause' : 'Play'}
            </button>

            <button className="ui-button ui-button-secondary" onClick={() => dispatch({ type: 'STEP', delta: 1 })} disabled={!replay || playback.playing}>
              Step
            </button>

            <button className="ui-button ui-button-secondary" onClick={() => dispatch({ type: 'RESTART' })} disabled={!replay}>
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
              <button key={id} className={['tab', id === selectedBotId ? 'active' : ''].join(' ')} onClick={() => setSelectedBotId(id)}>
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
            <div className="panel-title">Tick events</div>
            <pre style={{ marginTop: 8, padding: 10, borderRadius: 10, background: 'rgba(0,0,0,0.35)', overflow: 'auto', maxHeight: 240 }}>
              {replay ? (selectedTickEvents.length ? JSON.stringify(selectedTickEvents, null, 2) : '(no events)') : 'Run a match to see events.'}
            </pre>
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
