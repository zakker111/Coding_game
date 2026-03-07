import { generateSampleReplay } from '../replay/generateSampleReplay.js'
import { attachArenaRenderer } from './arena.js'
import { DEFAULT_OPPONENT_EXAMPLE_IDS, EXAMPLE_BOTS, OPPONENT_EXAMPLE_POOL_IDS } from './exampleBots.js'

const SLOT_IDS = ['BOT1', 'BOT2', 'BOT3', 'BOT4']

const LEGACY_DRAFTS_KEY = 'nowt:deploy:drafts:v1'

const MY_BOTS_KEY = 'nowt:deploy:myBots:v1'
const MY_BOTS_NEXT_ID_KEY = 'nowt:deploy:myBotsNextId:v1'
const SELECTED_MY_BOT_ID_KEY = 'nowt:deploy:selectedMyBotId:v1'
const MY_BOT_DRAFTS_KEY = 'nowt:deploy:myBotDrafts:v1'

const OPPONENTS_KEY = 'nowt:deploy:opponents:v1'
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

function readLegacyDrafts() {
  try {
    const raw = localStorage.getItem(LEGACY_DRAFTS_KEY)
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

function readMyBots() {
  try {
    const raw = localStorage.getItem(MY_BOTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const out = []
    for (const b of parsed) {
      if (!b || typeof b !== 'object') continue
      if (typeof b.id !== 'string') continue
      if (typeof b.name !== 'string') continue
      if (typeof b.sourceText !== 'string') continue
      out.push({ id: b.id, name: b.name, sourceText: b.sourceText })
    }
    return out
  } catch {
    return []
  }
}

function writeMyBots(bots) {
  try {
    localStorage.setItem(MY_BOTS_KEY, JSON.stringify(bots))
  } catch {
    // ignore
  }
}

function readMyBotDrafts() {
  try {
    const raw = localStorage.getItem(MY_BOT_DRAFTS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}

    const out = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === 'string' && typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function writeMyBotDrafts(drafts) {
  try {
    localStorage.setItem(MY_BOT_DRAFTS_KEY, JSON.stringify(drafts))
  } catch {
    // ignore
  }
}

function readNextMyBotId() {
  try {
    const raw = localStorage.getItem(MY_BOTS_NEXT_ID_KEY)
    const n = raw == null ? 1 : Number(raw)
    return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1
  } catch {
    return 1
  }
}

function writeNextMyBotId(nextId) {
  try {
    localStorage.setItem(MY_BOTS_NEXT_ID_KEY, String(Math.max(1, Math.floor(nextId))))
  } catch {
    // ignore
  }
}

function allocateMyBotId() {
  const n = readNextMyBotId()
  writeNextMyBotId(n + 1)
  return `my${n}`
}

function readSelectedMyBotId() {
  try {
    const raw = localStorage.getItem(SELECTED_MY_BOT_ID_KEY)
    return typeof raw === 'string' ? raw : null
  } catch {
    return null
  }
}

function writeSelectedMyBotId(id) {
  try {
    localStorage.setItem(SELECTED_MY_BOT_ID_KEY, id)
  } catch {
    // ignore
  }
}

function opponentValue(ref) {
  return `${ref.kind}:${ref.id}`
}

function parseOpponentValue(v) {
  if (typeof v !== 'string') return null
  const i = v.indexOf(':')
  if (i <= 0) return null
  const kind = v.slice(0, i)
  const id = v.slice(i + 1)

  if (kind !== 'ex' && kind !== 'my') return null
  if (!id) return null

  return { kind, id }
}

function defaultOpponentSelections() {
  return {
    BOT2: `ex:${DEFAULT_OPPONENT_EXAMPLE_IDS[0]}`,
    BOT3: `ex:${DEFAULT_OPPONENT_EXAMPLE_IDS[1]}`,
    BOT4: `ex:${DEFAULT_OPPONENT_EXAMPLE_IDS[2]}`,
  }
}

function readOpponentSelections() {
  try {
    const raw = localStorage.getItem(OPPONENTS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)

    const out = {}
    for (const slotId of ['BOT2', 'BOT3', 'BOT4']) {
      if (typeof parsed?.[slotId] === 'string') out[slotId] = parsed[slotId]
    }

    if (!out.BOT2 || !out.BOT3 || !out.BOT4) return null
    return out
  } catch {
    return null
  }
}

function writeOpponentSelections(sel) {
  try {
    localStorage.setItem(OPPONENTS_KEY, JSON.stringify(sel))
  } catch {
    // ignore
  }
}

function exampleBotOption(id) {
  const ex = EXAMPLE_BOTS[id]
  return {
    value: `ex:${id}`,
    label: `Example: ${ex?.displayName ?? id}`,
  }
}

function myBotOption(bot) {
  return {
    value: `my:${bot.id}`,
    label: `My: ${bot.name}`,
  }
}

function opponentPoolOptions(myBots, selectedMyBotId) {
  const opts = []

  for (const id of OPPONENT_EXAMPLE_POOL_IDS) opts.push(exampleBotOption(id))

  const my = myBots
    .filter((b) => b.id !== selectedMyBotId)
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  for (const b of my) opts.push(myBotOption(b))

  return opts
}

function normalizeOpponentSelections(sel, options) {
  const optionSet = new Set(options.map((o) => o.value))
  const desired = {
    BOT2: sel.BOT2,
    BOT3: sel.BOT3,
    BOT4: sel.BOT4,
  }

  /** @type {Set<string>} */
  const used = new Set()
  for (const slotId of ['BOT2', 'BOT3', 'BOT4']) {
    const v = desired[slotId]
    if (!optionSet.has(v) || used.has(v)) desired[slotId] = ''
    else used.add(v)
  }

  for (const slotId of ['BOT2', 'BOT3', 'BOT4']) {
    if (desired[slotId]) continue

    const next = options.find((o) => !used.has(o.value))?.value
    if (next) {
      desired[slotId] = next
      used.add(next)
    }
  }

  return desired
}

function ensureInitialMyBots() {
  let myBots = readMyBots()
  if (myBots.length) return myBots

  const legacy = readLegacyDrafts()

  const selected = {
    id: allocateMyBotId(),
    name: 'Starter',
    sourceText: legacy?.BOT1 ?? EXAMPLE_BOTS.bot0.sourceText,
  }

  myBots = [selected]

  if (legacy?.BOT2 && legacy.BOT2 !== EXAMPLE_BOTS.bot2.sourceText) {
    myBots.push({ id: allocateMyBotId(), name: 'Imported (BOT2)', sourceText: legacy.BOT2 })
  }
  if (legacy?.BOT3 && legacy.BOT3 !== EXAMPLE_BOTS.bot3.sourceText) {
    myBots.push({ id: allocateMyBotId(), name: 'Imported (BOT3)', sourceText: legacy.BOT3 })
  }
  if (legacy?.BOT4 && legacy.BOT4 !== EXAMPLE_BOTS.bot4.sourceText) {
    myBots.push({ id: allocateMyBotId(), name: 'Imported (BOT4)', sourceText: legacy.BOT4 })
  }

  writeMyBots(myBots)
  writeSelectedMyBotId(selected.id)

  return myBots
}

function getBotById(bots, id) {
  return bots.find((b) => b.id === id) ?? null
}

function opponentInfoFromValue(v, myBots) {
  const ref = parseOpponentValue(v)
  if (!ref) return null

  if (ref.kind === 'ex') {
    const ex = EXAMPLE_BOTS[ref.id]
    if (!ex) return null
    return { displayName: ex.displayName ?? ref.id, sourceText: ex.sourceText }
  }

  const mb = getBotById(myBots, ref.id)
  if (!mb) return null
  return { displayName: mb.name, sourceText: mb.sourceText }
}

// DOM
const seedInput = document.getElementById('seedInput')
const tickCapInput = document.getElementById('tickCapInput')
const opponent2Select = document.getElementById('opponent2Select')
const opponent3Select = document.getElementById('opponent3Select')
const opponent4Select = document.getElementById('opponent4Select')
const randomizeOpponentsBtn = document.getElementById('randomizeOpponentsBtn')
const runBtn = document.getElementById('runBtn')
const runNotice = document.getElementById('runNotice')

const myBotsSelect = document.getElementById('myBotsSelect')
const myBotNameInput = document.getElementById('myBotNameInput')
const myBotNewBtn = document.getElementById('myBotNewBtn')
const myBotDeleteBtn = document.getElementById('myBotDeleteBtn')
const myBotRenameBtn = document.getElementById('myBotRenameBtn')
const myBotApplyBtn = document.getElementById('myBotApplyBtn')
const myBotApplyStatus = document.getElementById('myBotApplyStatus')
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
let myBots = ensureInitialMyBots()
let myBotDrafts = readMyBotDrafts()
let selectedMyBotId = readSelectedMyBotId() ?? myBots[0]?.id ?? null
if (!getBotById(myBots, selectedMyBotId) && myBots[0]) selectedMyBotId = myBots[0].id

let opponentSelections = readOpponentSelections() ?? defaultOpponentSelections()

let selectedBotId = 'BOT1'

let replay = null
let playing = false
let speed = 1

let runInProgress = false
let randomizeInProgress = false

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

function setSelectOptions(select, options, selectedValue) {
  select.innerHTML = ''
  for (const opt of options) {
    const o = createEl('option', { value: opt.value, text: opt.label })
    if (opt.value === selectedValue) o.selected = true
    select.appendChild(o)
  }
}

function draftTextForMyBot(bot) {
  if (!bot) return ''
  const d = myBotDrafts?.[bot.id]
  return typeof d === 'string' ? d : bot.sourceText
}

function isMyBotDirty(bot) {
  if (!bot) return false
  return draftTextForMyBot(bot) !== bot.sourceText
}

function updateMyBotDraftUI() {
  const bot = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null
  const dirty = isMyBotDirty(bot)

  myBotApplyBtn.disabled = !dirty
  myBotApplyStatus.textContent = dirty ? 'Unapplied changes' : 'Applied'

  runBtn.disabled = runInProgress || dirty
  runBtn.textContent = runInProgress ? 'Running…' : 'Run / Preview'

  if (!randomizeInProgress) {
    randomizeOpponentsBtn.disabled = runInProgress || dirty
  }

  runNotice.textContent = dirty ? 'Unapplied BOT1 edits — click “Update bot” to run.' : ''
}

function hasUnappliedMyBotChanges() {
  const bot = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null
  return isMyBotDirty(bot)
}

function updateMyBotsUI() {
  myBots = readMyBots()
  if (!myBots.length) myBots = ensureInitialMyBots()

  const idSet = new Set(myBots.map((b) => b.id))
  let draftsChanged = false
  for (const id of Object.keys(myBotDrafts)) {
    if (idSet.has(id)) continue
    delete myBotDrafts[id]
    draftsChanged = true
  }
  if (draftsChanged) writeMyBotDrafts(myBotDrafts)

  if (!getBotById(myBots, selectedMyBotId) && myBots[0]) selectedMyBotId = myBots[0].id
  if (selectedMyBotId) writeSelectedMyBotId(selectedMyBotId)

  setSelectOptions(
    myBotsSelect,
    myBots.map((b) => ({ value: b.id, label: b.name })),
    selectedMyBotId
  )

  const bot = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null

  myBotNameInput.value = bot?.name ?? ''
  botEditor.value = bot ? draftTextForMyBot(bot) : ''
  myBotDeleteBtn.disabled = myBots.length <= 1

  updateMyBotDraftUI()
}

function updateOpponentsUI() {
  const pool = opponentPoolOptions(myBots, selectedMyBotId)
  opponentSelections = normalizeOpponentSelections(opponentSelections, pool)
  writeOpponentSelections(opponentSelections)

  setSelectOptions(opponent2Select, pool, opponentSelections.BOT2)
  setSelectOptions(opponent3Select, pool, opponentSelections.BOT3)
  setSelectOptions(opponent4Select, pool, opponentSelections.BOT4)
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

  myBots = readMyBots()
  if (!myBots.length) myBots = ensureInitialMyBots()

  const seed = Number(seedInput.value)
  const tickCap = clamp(Math.floor(Number(tickCapInput.value)), 1, 2000)

  const bot1 = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null
  const bot1Source = bot1?.sourceText ?? EXAMPLE_BOTS.bot0.sourceText

  const opp2 = opponentInfoFromValue(opponentSelections.BOT2, myBots)
  const opp3 = opponentInfoFromValue(opponentSelections.BOT3, myBots)
  const opp4 = opponentInfoFromValue(opponentSelections.BOT4, myBots)

  const sources = {
    BOT1: bot1Source,
    BOT2: opp2?.sourceText ?? EXAMPLE_BOTS.bot2.sourceText,
    BOT3: opp3?.sourceText ?? EXAMPLE_BOTS.bot3.sourceText,
    BOT4: opp4?.sourceText ?? EXAMPLE_BOTS.bot4.sourceText,
  }

  const botsForMix = SLOT_IDS.map((slotId) => ({ slotId, sourceText: sources[slotId] ?? '' }))
  const mixed = mixSeed(seed, botsForMix)

  const headerBots = [
    {
      slotId: 'BOT1',
      displayName: bot1?.name ?? 'BOT1',
      appearance: SLOT_APPEARANCE.BOT1,
      sourceText: sources.BOT1,
    },
    {
      slotId: 'BOT2',
      displayName: opp2?.displayName ?? 'BOT2',
      appearance: SLOT_APPEARANCE.BOT2,
      sourceText: sources.BOT2,
    },
    {
      slotId: 'BOT3',
      displayName: opp3?.displayName ?? 'BOT3',
      appearance: SLOT_APPEARANCE.BOT3,
      sourceText: sources.BOT3,
    },
    {
      slotId: 'BOT4',
      displayName: opp4?.displayName ?? 'BOT4',
      appearance: SLOT_APPEARANCE.BOT4,
      sourceText: sources.BOT4,
    },
  ]

  replay = generateSampleReplay(mixed, { tickCap, bots: headerBots })

  tick = 0
  alpha = 1

  draw()
}

function randomizeOpponents() {
  const pool = opponentPoolOptions(myBots, selectedMyBotId)

  const nonce = readOpponentNonce()
  const bot1 = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null

  const seed =
    (Number(seedInput.value) >>> 0) ^
    fnv1a32(bot1?.sourceText ?? '') ^
    fnv1a32(bot1?.id ?? '') ^
    nonce

  const nextU32 = xorshift32(seed)
  const values = shuffleInPlaceDeterministic(pool.map((p) => p.value), nextU32).slice(0, 3)

  opponentSelections = {
    ...opponentSelections,
    BOT2: values[0],
    BOT3: values[1],
    BOT4: values[2],
  }

  writeOpponentNonce((nonce + 1) >>> 0)
  writeOpponentSelections(opponentSelections)

  updateOpponentsUI()
}

// Wire up UI
renderTabs(inspectTabs, selectedBotId, (id) => {
  selectedBotId = id
  updateInspector()
  draw()
})

myBotsSelect.addEventListener('change', () => {
  selectedMyBotId = myBotsSelect.value
  writeSelectedMyBotId(selectedMyBotId)
  updateMyBotsUI()
  updateOpponentsUI()
})

myBotRenameBtn.addEventListener('click', () => {
  const bot = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null
  if (!bot) return

  const name = myBotNameInput.value.trim() || 'Untitled'

  const next = myBots.map((b) => (b.id === bot.id ? { ...b, name } : b))
  writeMyBots(next)
  updateMyBotsUI()
  updateOpponentsUI()
})

myBotNewBtn.addEventListener('click', () => {
  const id = allocateMyBotId()
  const name = `Bot ${id}`

  const next = [...myBots, { id, name, sourceText: EXAMPLE_BOTS.bot0.sourceText }]
  writeMyBots(next)

  selectedMyBotId = id
  writeSelectedMyBotId(id)

  updateMyBotsUI()
  updateOpponentsUI()
})

myBotDeleteBtn.addEventListener('click', () => {
  const bot = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null
  if (!bot) return
  if (myBots.length <= 1) return

  if (!confirm(`Delete "${bot.name}"?`)) return

  const next = myBots.filter((b) => b.id !== bot.id)
  writeMyBots(next)

  if (myBotDrafts[bot.id] != null) {
    delete myBotDrafts[bot.id]
    writeMyBotDrafts(myBotDrafts)
  }

  selectedMyBotId = next[0]?.id ?? null
  if (selectedMyBotId) writeSelectedMyBotId(selectedMyBotId)

  updateMyBotsUI()
  updateOpponentsUI()
})

myBotApplyBtn.addEventListener('click', () => {
  const bot = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null
  if (!bot) return

  const nextText = botEditor.value

  const next = myBots.map((b) => (b.id === bot.id ? { ...b, sourceText: nextText } : b))
  writeMyBots(next)

  if (myBotDrafts[bot.id] != null) {
    delete myBotDrafts[bot.id]
    writeMyBotDrafts(myBotDrafts)
  }

  updateMyBotsUI()
  updateOpponentsUI()
})

botEditor.addEventListener('input', () => {
  const bot = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null
  if (!bot) return

  const nextText = botEditor.value

  if (nextText === bot.sourceText) {
    if (myBotDrafts[bot.id] != null) {
      delete myBotDrafts[bot.id]
      writeMyBotDrafts(myBotDrafts)
    }
  } else {
    myBotDrafts[bot.id] = nextText
    writeMyBotDrafts(myBotDrafts)
  }

  updateMyBotDraftUI()
})

opponent2Select.addEventListener('change', () => {
  opponentSelections.BOT2 = opponent2Select.value
  updateOpponentsUI()
})

opponent3Select.addEventListener('change', () => {
  opponentSelections.BOT3 = opponent3Select.value
  updateOpponentsUI()
})

opponent4Select.addEventListener('change', () => {
  opponentSelections.BOT4 = opponent4Select.value
  updateOpponentsUI()
})

randomizeOpponentsBtn.addEventListener('click', () => {
  if (hasUnappliedMyBotChanges()) {
    updateMyBotDraftUI()
    return
  }

  randomizeInProgress = true
  runInProgress = true

  randomizeOpponentsBtn.disabled = true
  randomizeOpponentsBtn.textContent = 'Randomizing…'
  updateMyBotDraftUI()

  Promise.resolve()
    .then(() => randomizeOpponents())
    .then(run)
    .finally(() => {
      randomizeInProgress = false
      runInProgress = false

      randomizeOpponentsBtn.disabled = false
      randomizeOpponentsBtn.textContent = 'Randomize opponents'
      updateMyBotDraftUI()
    })
})

runBtn.addEventListener('click', () => {
  if (hasUnappliedMyBotChanges()) {
    updateMyBotDraftUI()
    return
  }

  runInProgress = true
  updateMyBotDraftUI()

  Promise.resolve()
    .then(run)
    .finally(() => {
      runInProgress = false
      updateMyBotDraftUI()
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
updateMyBotsUI()
updateOpponentsUI()
draw()
