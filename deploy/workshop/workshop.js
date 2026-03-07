import { generateSampleReplay } from '../replay/generateSampleReplay.js'
import { attachArenaRenderer } from './arena.js'
import { EXAMPLE_BOTS, OPPONENT_EXAMPLE_POOL_IDS } from './exampleBots.js'

const SLOT_IDS = ['BOT1', 'BOT2', 'BOT3', 'BOT4']

const STORAGE_KEY = 'nowt:deploy:drafts:v1'
const OPPONENT_NONCE_KEY = 'nowt:deploy:opponentNonce:v1'

const SLOT_APPEARANCE = {
  BOT1: { kind: 'COLOR', color: '#4ade80' },
  BOT2: { kind: 'COLOR', color: '#60a5fa' },
  BOT3: { kind: 'COLOR', color: '#f472b6' },
  BOT4: { kind: 'COLOR', color: '#fbbf24' },
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

/** FNV-1a 32-bit hash of UTF-16 code units. Deterministic across JS engines. */
function fnv1a32(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mixSeed(seed, bots) {
  let h = seed >>> 0
  for (const b of bots) {
    h ^= fnv1a32(`${b.slotId}\n${b.sourceText}\n`)
    h = Math.imul(h, 2654435761) >>> 0
  }
  return h >>> 0
}

function createEl(tag, props = {}, children = []) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v
    else if (k === 'text') el.textContent = v
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
    else el.setAttribute(k, String(v))
  }
  for (const c of children) el.appendChild(c)
  return el
}

function readDrafts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const next = {}
    for (const id of SLOT_IDS) {
      if (typeof parsed?.[id] === 'string') next[id] = parsed[id]
    }
    return next
  } catch {
    return null
  }
}

function writeDrafts(drafts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
  } catch {
    // ignore
  }
}

function defaultSources() {
  return {
    BOT1: EXAMPLE_BOTS.bot0.sourceText,
    BOT2: EXAMPLE_BOTS.bot2.sourceText,
    BOT3: EXAMPLE_BOTS.bot3.sourceText,
    BOT4: EXAMPLE_BOTS.bot4.sourceText,
  }
}

function readOpponentNonce() {
  try {
    const raw = localStorage.getItem(OPPONENT_NONCE_KEY)
    const n = raw == null ? 0 : Number(raw)
    return Number.isFinite(n) ? (n >>> 0) : 0
  } catch {
    return 0
  }
}

function writeOpponentNonce(nonce) {
  try {
    localStorage.setItem(OPPONENT_NONCE_KEY, String(nonce >>> 0))
  } catch {
    // ignore
  }
}

function xorshift32(seed) {
  let x = seed >>> 0
  if (x === 0) x = 0x6d2b79f5

  return () => {
    x ^= x << 13
    x >>>= 0
    x ^= x >>> 17
    x >>>= 0
    x ^= x << 5
    x >>>= 0
    return x >>> 0
  }
}

function shuffleInPlaceDeterministic(arr, nextU32) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextU32() % (i + 1)
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

function displayNameForSource(sourceText) {
  for (const ex of Object.values(EXAMPLE_BOTS)) {
    if (ex.sourceText === sourceText) return ex.displayName
  }
  return null
}

// DOM
const seedInput = document.getElementById('seedInput')
const tickCapInput = document.getElementById('tickCapInput')
const randomizeOpponentsBtn = document.getElementById('randomizeOpponentsBtn')
const runBtn = document.getElementById('runBtn')

const botTabs = document.getElementById('botTabs')
const botEditor = document.getElementById('botEditor')

const inspectTabs = document.getElementById('inspectTabs')
const inspectStats = document.getElementById('inspectStats')
const eventLog = document.getElementById('eventLog')

const tickLabel = document.getElementById('tickLabel')
const playPauseBtn = document.getElementById('playPauseBtn')
const stepBtn = document.getElementById('stepBtn')
const restartBtn = document.getElementById('restartBtn')
const speedSelect = document.getElementById('speedSelect')
const scrub = document.getElementById('scrub')

const canvas = document.getElementById('arenaCanvas')

// State
let sources = { ...defaultSources(), ...(readDrafts() ?? {}) }
let editingBotId = 'BOT1'
let selectedBotId = 'BOT1'

let replay = null
let playing = false
let speed = 1

// We interpret tick as end-of-tick snapshot index.
// When playing, render tick `t` with alpha in [0,1] interpolating from state[t-1] -> state[t].
let tick = 0
let alpha = 1

let rafId = 0
let lastNow = 0
let accMs = 0

const render = attachArenaRenderer(canvas)

function setActiveTab(container, activeId) {
  for (const btn of container.querySelectorAll('button[data-id]')) {
    btn.classList.toggle('active', btn.getAttribute('data-id') === activeId)
  }
}

function renderTabs(container, currentId, onSelect) {
  container.innerHTML = ''
  for (const id of SLOT_IDS) {
    const btn = createEl('button', {
      class: `tab ${id === currentId ? 'active' : ''}`,
      'data-id': id,
      type: 'button',
      onClick: () => onSelect(id),
      text: id,
    })
    container.appendChild(btn)
  }
}

function updateEditor() {
  botEditor.value = sources[editingBotId] ?? ''
  setActiveTab(botTabs, editingBotId)
}

function updateInspector() {
  setActiveTab(inspectTabs, selectedBotId)

  if (!replay) {
    inspectStats.innerHTML = '<div class="muted">Run a match to inspect bots.</div>'
    eventLog.textContent = ''
    return
  }

  const t = clamp(tick, 0, replay.tickCap)
  const snap = replay.state[t]
  const bot = snap?.bots?.find((b) => b.botId === selectedBotId)

  if (!bot) {
    inspectStats.innerHTML = '<div class="muted">Bot not found in replay.</div>'
  } else {
    inspectStats.innerHTML = ''
    inspectStats.appendChild(kvRow('Bot', bot.botId))
    inspectStats.appendChild(kvRow('HP', String(bot.hp)))
    inspectStats.appendChild(kvRow('Ammo', String(bot.ammo)))
    inspectStats.appendChild(kvRow('Energy', String(bot.energy)))
    inspectStats.appendChild(kvRow('Alive', bot.alive ? 'yes' : 'no'))
    inspectStats.appendChild(kvRow('PC', String(bot.pc)))
    inspectStats.appendChild(kvRow('Pos', `${bot.pos.x.toFixed(3)}, ${bot.pos.y.toFixed(3)}`))
  }

  const tickEvents = replay.events[t] ?? []
  eventLog.textContent = tickEvents.length ? JSON.stringify(tickEvents, null, 2) : '(no events)'
}

function kvRow(k, v) {
  const row = createEl('div', { class: 'kv-row' })
  row.appendChild(createEl('div', { class: 'kv-k', text: k }))
  row.appendChild(createEl('div', { class: 'kv-v', text: v }))
  return row
}

function updatePlaybackUI() {
  if (!replay) {
    tickLabel.textContent = 'tick 0 / 0'
    scrub.max = '0'
    scrub.value = '0'
    playPauseBtn.disabled = true
    stepBtn.disabled = true
    restartBtn.disabled = true
    return
  }

  tickLabel.textContent = `tick ${tick} / ${replay.tickCap}`
  scrub.max = String(replay.tickCap)
  scrub.value = String(clamp(tick, 0, replay.tickCap))

  playPauseBtn.disabled = false
  stepBtn.disabled = playing
  restartBtn.disabled = false
  scrub.disabled = playing
}

function stop() {
  playing = false
  alpha = 1
  cancelAnimationFrame(rafId)
  rafId = 0
  updatePlaybackUI()
}

function start() {
  if (!replay) return
  if (playing) return

  if (tick >= replay.tickCap) {
    tick = replay.tickCap
    alpha = 1
    updatePlaybackUI()
    return
  }

  // Start animating state[tick] -> state[tick+1]
  tick = Math.min(replay.tickCap, tick + 1)
  alpha = tick === 0 ? 1 : 0

  playing = true
  lastNow = performance.now()
  accMs = 0

  rafId = requestAnimationFrame(frame)
  updatePlaybackUI()
}

function frame(now) {
  if (!replay || !playing) return

  const dt = now - lastNow
  lastNow = now

  const tps = replay.ticksPerSecond || 1
  const tickMs = 1000 / tps

  accMs += dt * speed

  const steps = Math.floor(accMs / tickMs)
  if (steps > 0) {
    accMs -= steps * tickMs
    tick = Math.min(replay.tickCap, tick + steps)
  }

  alpha = clamp(accMs / tickMs, 0, 1)

  if (tick >= replay.tickCap && alpha >= 1) {
    tick = replay.tickCap
    alpha = 1
    stop()
  }

  draw()

  rafId = requestAnimationFrame(frame)
}

function draw() {
  if (!replay) {
    render.renderEmpty()
    updateInspector()
    updatePlaybackUI()
    return
  }

  const a = playing ? alpha : 1
  render.renderReplayFrame(replay, tick, a, selectedBotId)
  updateInspector()
  updatePlaybackUI()
}

function stepOnce() {
  if (!replay) return
  stop()
  tick = Math.min(replay.tickCap, tick + 1)
  alpha = 1
  draw()
}

function restart() {
  if (!replay) return
  stop()
  tick = 0
  alpha = 1
  draw()
}

function seekTo(t) {
  if (!replay) return
  stop()
  tick = clamp(Math.floor(t), 0, replay.tickCap)
  alpha = 1
  draw()
}

async function run() {
  stop()

  const seed = Number(seedInput.value)
  const tickCap = clamp(Math.floor(Number(tickCapInput.value)), 1, 2000)

  const bots = SLOT_IDS.map((slotId) => ({ slotId, sourceText: sources[slotId] ?? '' }))
  const mixed = mixSeed(seed, bots)

  const headerBots = SLOT_IDS.map((slotId) => ({
    slotId,
    displayName: displayNameForSource(sources[slotId] ?? '') ?? slotId,
    appearance: SLOT_APPEARANCE[slotId],
    sourceText: sources[slotId] ?? '',
  }))

  // Build replay.
  replay = generateSampleReplay(mixed, { tickCap, bots: headerBots })

  tick = 0
  alpha = 1

  draw()
}

// Wire up UI
renderTabs(botTabs, editingBotId, (id) => {
  editingBotId = id
  updateEditor()
})

renderTabs(inspectTabs, selectedBotId, (id) => {
  selectedBotId = id
  updateInspector()
  draw()
})

botEditor.addEventListener('input', () => {
  sources[editingBotId] = botEditor.value
  writeDrafts(sources)
})

function randomizeOpponents() {
  const nonce = readOpponentNonce()

  const seed =
    (Number(seedInput.value) >>> 0) ^
    fnv1a32(sources.BOT1 ?? '') ^
    nonce

  const nextU32 = xorshift32(seed)
  const ids = shuffleInPlaceDeterministic([...OPPONENT_EXAMPLE_POOL_IDS], nextU32).slice(0, 3)

  sources.BOT2 = EXAMPLE_BOTS[ids[0]].sourceText
  sources.BOT3 = EXAMPLE_BOTS[ids[1]].sourceText
  sources.BOT4 = EXAMPLE_BOTS[ids[2]].sourceText

  writeOpponentNonce((nonce + 1) >>> 0)

  writeDrafts(sources)
  updateEditor()
}

randomizeOpponentsBtn.addEventListener('click', () => {
  randomizeOpponentsBtn.disabled = true
  randomizeOpponentsBtn.textContent = 'Randomizing…'

  Promise.resolve()
    .then(() => randomizeOpponents())
    .then(run)
    .finally(() => {
      randomizeOpponentsBtn.disabled = false
      randomizeOpponentsBtn.textContent = 'Randomize opponents'
    })
})

runBtn.addEventListener('click', () => {
  runBtn.disabled = true
  runBtn.textContent = 'Running…'
  Promise.resolve()
    .then(run)
    .finally(() => {
      runBtn.disabled = false
      runBtn.textContent = 'Run / Preview'
    })
})

playPauseBtn.addEventListener('click', () => {
  if (!replay) return
  if (playing) stop()
  else start()
  draw()
})

stepBtn.addEventListener('click', () => stepOnce())
restartBtn.addEventListener('click', () => restart())

speedSelect.addEventListener('change', () => {
  speed = Number(speedSelect.value) || 1
})

scrub.addEventListener('input', () => {
  seekTo(Number(scrub.value))
})

// Initial render
updateEditor()
draw()
