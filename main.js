import { createReplay, stableHash, BUILTIN_BOT2_SOURCE, BUILTIN_BOT3_SOURCE } from './engine.js';
import { renderFrame } from './renderer.js';
import { extractPreferredCodeBlock } from './markdown.js';

const el = (id) => /** @type {any} */ (document.getElementById(id));

const canvas = /** @type {HTMLCanvasElement} */ (el('canvas'));
const hud = el('hud');
const meta = el('meta');

const metaLine = document.createElement('div');
const metaQaLine = document.createElement('div');
metaQaLine.className = 'mono';
meta.textContent = '';
meta.appendChild(metaLine);
meta.appendChild(metaQaLine);

const btnRun = el('btnRun');
const btnPlay = el('btnPlay');
const btnPause = el('btnPause');
const btnStep = el('btnStep');
const btnReset = el('btnReset');

const seedInput = /** @type {HTMLInputElement} */ (el('seed'));
const tickCapInput = /** @type {HTMLInputElement} */ (el('tickCap'));
const speedSel = /** @type {HTMLSelectElement} */ (el('speed'));

const showAnchorsEl = /** @type {HTMLInputElement} */ (el('showAnchors'));
const showEventsEl = /** @type {HTMLInputElement} */ (el('showEvents'));

const btnLoadBot2 = el('btnLoadBot2');
const btnLoadBot3 = el('btnLoadBot3');
const btnLoadBot1 = el('btnLoadBot1');
const bot1Source = /** @type {HTMLTextAreaElement} */ (el('bot1Source'));
const compileOut = el('compileOut');

const matchSummary = el('matchSummary');
const eventPanel = el('eventPanel');
const eventLog = el('eventLog');

const inspectorTitle = el('inspectorTitle');
const inspectorExec = el('inspectorExec');
const inspectorCode = el('inspectorCode');

let canvasCssWidth = 0;
let canvasCssHeight = 0;
let canvasDpr = 1;

function resizeCanvasToDisplaySize() {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = rect.width || canvas.clientWidth || canvas.width;
  const cssHeight = rect.height || canvas.clientHeight || canvas.height;
  const dpr = window.devicePixelRatio || 1;

  const nextWidth = Math.max(1, Math.round(cssWidth * dpr));
  const nextHeight = Math.max(1, Math.round(cssHeight * dpr));

  canvasCssWidth = cssWidth;
  canvasCssHeight = cssHeight;
  canvasDpr = dpr;

  if (canvas.width === nextWidth && canvas.height === nextHeight) return false;

  canvas.width = nextWidth;
  canvas.height = nextHeight;
  return true;
}

/** @type {import('./engine.js').Replay|null} */
let replay = null;

/** @type {{ detOk:boolean, detHashA:string, detHashB:string, counts: Record<string, number> }|null} */
let qaReadout = null;

let playing = false;
let lastFrameMs = 0;

// Continuous playhead in ticks (float)
let playhead = 0;

/** @type {string|null} */
let selectedBotId = null;

let renderedInspectorBotId = null;
let highlightedSourceLine = null;
/** @type {Map<number, HTMLElement>} */
let sourceLineEls = new Map();

const LS_BOT1_DRAFT_KEY = 'botarena.bot1.draft.v1';

/**
 * Bot sources for opponents, ideally loaded from `examples/*.md`.
 * Stored in JS memory so `Run` can remain synchronous.
 */
const botSources = {
  BOT2: BUILTIN_BOT2_SOURCE + '\n',
  BOT3: BUILTIN_BOT3_SOURCE + '\n',
  // BOT4 needs SAW/SHIELD which isn't implemented yet; use a bullet bot script for now.
  BOT4: BUILTIN_BOT2_SOURCE + '\n',
};

async function fetchExampleScript(exampleName) {
  const url = `./examples/${exampleName}.md`;
  const md = await (await fetch(url)).text();
  const code = extractPreferredCodeBlock(md, { preferredLangs: ['text', ''] });
  if (!code) throw new Error(`No fenced code block found in ${url}`);
  return code.trimEnd() + '\n';
}

async function refreshBotSourcesFromMd() {
  try {
    botSources.BOT2 = await fetchExampleScript('bot2');
    botSources.BOT4 = botSources.BOT2;
  } catch {
    botSources.BOT2 = BUILTIN_BOT2_SOURCE + '\n';
    botSources.BOT4 = botSources.BOT2;
  }

  try {
    botSources.BOT3 = await fetchExampleScript('bot3');
  } catch {
    botSources.BOT3 = BUILTIN_BOT3_SOURCE + '\n';
  }
}

async function setBot1SourceText(next, { save = true } = {}) {
  bot1Source.value = next;
  if (save) localStorage.setItem(LS_BOT1_DRAFT_KEY, next);
}

function setUiEnabled(hasReplay) {
  btnPlay.disabled = !hasReplay;
  btnPause.disabled = !hasReplay;
  btnStep.disabled = !hasReplay;
  btnReset.disabled = !hasReplay;
}

function currentSpeed() {
  return Number(speedSel.value || '1');
}

function updateSummary() {
  if (!replay) {
    matchSummary.textContent = 'Click Run.';
    return;
  }
  const r = replay.result;
  const rows = r.bots
    .slice()
    .sort((a,b) => a.botId.localeCompare(b.botId))
    .map(b => `${b.botId}: kills=${b.kills} points=${b.points} alive=${b.alive}`)
    .join('\n');

  const winner = r.winnerBotId ? `Winner: ${r.winnerBotId}` : 'Winner: (draw)';
  matchSummary.innerHTML = `<div class="mono">${winner}<br/>End: ${r.endReason}<br/><br/>${escapeHtml(rows).replace(/\n/g,'<br/>')}</div>`;
}

function updateMeta() {
  if (!replay) {
    metaLine.textContent = '';
    metaQaLine.textContent = '';
    return;
  }

  const hash = stableHash({ header: replay.header, state0: replay.state[0], result: replay.result });
  metaLine.textContent = `ruleset=${replay.header.rulesetVersion} seed=${replay.header.matchSeed} hash=${hash}`;

  if (!qaReadout) {
    metaQaLine.textContent = '';
    return;
  }

  const c = qaReadout.counts;
  metaQaLine.textContent = [
    `QA det=${qaReadout.detOk ? 'OK' : 'FAIL'} (${qaReadout.detHashA}${qaReadout.detOk ? '' : ' != ' + qaReadout.detHashB})`,
    `BOT_MOVED=${c.BOT_MOVED ?? 0}`,
    `BULLET_SPAWN=${c.BULLET_SPAWN ?? 0}`,
    `BULLET_HIT=${c.BULLET_HIT ?? 0}`,
    `BOT_DIED=${c.BOT_DIED ?? 0}`,
    `POWERUP_PICKUP=${c.POWERUP_PICKUP ?? 0}`,
  ].join('  ');
}

function replayStablePayload(r) {
  return { state: r.state, events: r.events, result: r.result };
}

function computeSmokeCounts(replayEvents) {
  const counts = {
    BOT_MOVED: 0,
    BULLET_SPAWN: 0,
    BULLET_HIT: 0,
    BOT_DIED: 0,
    POWERUP_PICKUP: 0,
  };

  for (const tickEvents of replayEvents ?? []) {
    for (const e of tickEvents ?? []) {
      const t = e?.type;
      if (t && counts[t] != null) counts[t] += 1;
    }
  }

  return counts;
}

function updateCompileOut() {
  if (!replay?.compile) {
    compileOut.textContent = '';
    compileOut.className = 'mono small';
    return;
  }

  const diags = replay.compile.find(x => x.botId === 'BOT1')?.diagnostics ?? [];
  if (!diags.length) {
    compileOut.textContent = 'BOT1 compile: OK';
    compileOut.className = 'mono small';
    return;
  }

  compileOut.textContent = diags
    .map(d => `${d.severity.toUpperCase()}: ${d.sourceLine != null ? 'line '+d.sourceLine : 'line ?'}: ${d.message}`)
    .join('\n');

  const hasErr = diags.some(d => d.severity === 'error');
  compileOut.className = hasErr ? 'mono small error' : 'mono small';
}

function updateEventLog(tickIndex) {
  if (!replay) {
    eventPanel.style.display = 'none';
    return;
  }
  eventPanel.style.display = showEventsEl.checked ? 'block' : 'none';
  if (!showEventsEl.checked) return;

  const ev = replay.events[tickIndex] ?? [];
  eventLog.textContent = ev.map(formatEvent).join('\n');
}

function formatEvent(e) {
  if (!e || typeof e !== 'object') return String(e);
  const t = e.type;
  if (t === 'BOT_EXEC') return `${t} ${e.botId} line=${e.sourceLine ?? '?'} pc=${e.pcBefore}->${e.pcAfter} ${e.result ?? ''} ${e.reason ?? ''} ${(e.instrText ?? e.instr) ?? ''}${e.error ? ' err='+e.error : ''}`.trim();
  if (t === 'BOT_MOVED') return `${t} ${e.botId} ${locStr(e.fromLoc)} -> ${locStr(e.toLoc)}`;
  if (t === 'BULLET_MOVE') return `${t} #${e.bulletId} ${e.fromSector} -> ${e.toSector}`;
  if (t === 'BULLET_HIT') return `${t} #${e.bulletId} victim=${e.victimBotId} dmg=${e.damage}`;
  if (t === 'DAMAGE') return `${t} victim=${e.victimBotId} amt=${e.amount} src=${e.source}${e.sourceBotId ? ' by '+e.sourceBotId : ''} kind=${e.kind}`;
  if (t === 'BOT_DIED') return `${t} victim=${e.victimBotId} credited=${e.creditedBotId}`;
  if (t === 'POWERUP_SPAWN') return `${t} #${e.powerupId} ${(e.powerupType ?? e.type)} at ${locStr(e.loc)}`;
  if (t === 'POWERUP_PICKUP') return `${t} ${e.botId} got ${(e.powerupType ?? e.type)} at ${locStr(e.loc)}`;
  if (t === 'RESOURCE_DELTA') return `${t} ${e.botId} hp=${e.healthDelta} ammo=${e.ammoDelta} energy=${e.energyDelta} cause=${e.cause}`;
  if (t === 'MATCH_END') return `${t} reason=${e.endReason} winner=${e.winnerBotId}`;
  if (t === 'SCORE') return `${t} ${JSON.stringify(e.bots)}`;
  return `${t} ${JSON.stringify(e)}`;
}

function locStr(loc) {
  if (!loc) return '(?)';
  return `S${loc.sector} Z${loc.zone}`;
}

function escapeHtml(s) {
  return s.replace(/[&<>\"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;' }[c]));
}

function clampPlayhead() {
  if (!replay) return;
  const maxTick = replay.state.length - 1;
  if (playhead < 0) playhead = 0;
  if (playhead > maxTick) playhead = maxTick;
}

function computeRenderCtx() {
  if (!replay) return null;

  clampPlayhead();

  const maxTick = replay.state.length - 1;
  const base = Math.floor(playhead);
  const next = Math.min(maxTick, base + 1);
  const progress01 = playing ? (playhead - base) : 0;

  const fromSnapshot = replay.state[base];
  const toSnapshot = playing ? replay.state[next] : replay.state[base];
  const renderEvents = playing ? (replay.events[next] ?? []) : [];

  const shownTick = (progress01 > 0) ? next : base;
  return { maxTick, progress01, fromSnapshot, toSnapshot, renderEvents, shownTick };
}

function setSelectedBot(botId) {
  selectedBotId = botId;
  highlightedSourceLine = null;

  if (!selectedBotId) {
    inspectorTitle.textContent = 'Inspector (no bot selected)';
    inspectorExec.textContent = 'Click a bot on the canvas to inspect its source.';
    inspectorCode.textContent = '';
    renderedInspectorBotId = null;
    sourceLineEls = new Map();
    return;
  }

  inspectorTitle.textContent = `Inspector (${selectedBotId})`;
  renderedInspectorBotId = null;
  sourceLineEls = new Map();
}

function renderInspectorSourceIfNeeded() {
  if (!replay || !selectedBotId) return;
  if (renderedInspectorBotId === selectedBotId) return;

  const bot = replay.header.bots.find(b => b.id === selectedBotId);
  const src = bot?.sourceText ?? '';
  const lines = src.split(/\n/);

  inspectorCode.textContent = '';

  const frag = document.createDocumentFragment();
  sourceLineEls = new Map();

  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    const line = lines[i];

    const row = document.createElement('div');
    row.className = 'codeLine';
    row.dataset.line = String(ln);

    const lnEl = document.createElement('span');
    lnEl.className = 'ln';
    lnEl.textContent = String(ln);

    const txtEl = document.createElement('span');
    txtEl.className = 'txt';
    txtEl.textContent = line;

    row.appendChild(lnEl);
    row.appendChild(txtEl);

    frag.appendChild(row);
    sourceLineEls.set(ln, row);
  }

  inspectorCode.appendChild(frag);
  renderedInspectorBotId = selectedBotId;
}

function updateInspector(tickIndex) {
  if (!replay || !selectedBotId) return;

  renderInspectorSourceIfNeeded();

  const tickEvents = replay.events[tickIndex] ?? [];
  const execEv = tickEvents.find(e => e?.type === 'BOT_EXEC' && e?.botId === selectedBotId) ?? null;

  if (!execEv) {
    inspectorExec.textContent = `tick=${tickIndex}: no BOT_EXEC for ${selectedBotId}`;
    setHighlightedSourceLine(null);
    return;
  }

  const line = Number(execEv.sourceLine ?? 0) || null;
  inspectorExec.textContent = `tick=${tickIndex} pc=${execEv.pcBefore}->${execEv.pcAfter} line=${execEv.sourceLine ?? '?'} ${execEv.result ?? ''} ${(execEv.instrText ?? execEv.instr) ?? ''}${execEv.error ? ' err='+execEv.error : ''}`.trim();
  setHighlightedSourceLine(line);
}

function setHighlightedSourceLine(line) {
  if (highlightedSourceLine === line) return;

  if (highlightedSourceLine != null) {
    const prev = sourceLineEls.get(highlightedSourceLine);
    if (prev) prev.classList.remove('active');
  }

  highlightedSourceLine = line;

  if (highlightedSourceLine != null) {
    const cur = sourceLineEls.get(highlightedSourceLine);
    if (cur) {
      cur.classList.add('active');
      cur.scrollIntoView({ block: 'center' });
    }
  }
}

// --- picking / selection overlay ---

const WORLD = 192;

function sectorOrigin(sector) {
  const row = Math.floor((sector - 1) / 3);
  const col = (sector - 1) % 3;
  return { x: col * 64, y: row * 64 };
}

function anchorWorldCenter(loc) {
  const so = sectorOrigin(loc.sector);
  if (loc.zone === 0) {
    return { x: so.x + 32, y: so.y + 32 };
  }

  const zoneOffset =
    loc.zone === 1 ? { x: 0, y: 0 } :
    loc.zone === 2 ? { x: 32, y: 0 } :
    loc.zone === 3 ? { x: 0, y: 32 } :
    { x: 32, y: 32 };

  return { x: so.x + zoneOffset.x + 16, y: so.y + zoneOffset.y + 16 };
}

function canvasLogicalSize() {
  return {
    width: canvasCssWidth || canvas.clientWidth || canvas.width,
    height: canvasCssHeight || canvas.clientHeight || canvas.height,
  };
}

function pickScale(w, h) {
  const minDim = Math.min(w, h);
  const candidates = [6,5,4,3,2,1];
  for (const s of candidates) {
    if (WORLD * s <= minDim) return s;
  }
  return 1;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function easeInOutCubic(t) {
  t = clamp01(t);
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function computeViewTransform() {
  const { width, height } = canvasLogicalSize();
  const S = pickScale(width, height);
  const arenaPx = WORLD * S;
  const ox = Math.floor((width - arenaPx) / 2);
  const oy = Math.floor((height - arenaPx) / 2);
  return { S, ox, oy };
}

function botScreenPos(renderCtx, botId) {
  if (!renderCtx) return null;
  const { fromSnapshot, toSnapshot, renderEvents, progress01 } = renderCtx;

  const fromBot = (fromSnapshot?.bots ?? []).find(b => b?.id === botId) ?? null;
  const toBot = (toSnapshot?.bots ?? []).find(b => b?.id === botId) ?? fromBot;
  if (!fromBot && !toBot) return null;

  const aliveFrom = fromBot?.alive !== false;
  const aliveTo = toBot?.alive !== false;
  if (!aliveFrom && !aliveTo) return null;

  const mv = (renderEvents ?? []).find(e => e?.type === 'BOT_MOVED' && e?.botId === botId) ?? null;
  const fromLoc = mv?.fromLoc ?? fromBot?.loc ?? toBot?.loc;
  const toLoc = mv?.toLoc ?? toBot?.loc ?? fromBot?.loc;
  if (!fromLoc || !toLoc) return null;

  const a = anchorWorldCenter(fromLoc);
  const b = anchorWorldCenter(toLoc);
  const t = easeInOutCubic(progress01);
  const w = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };

  const { S, ox, oy } = computeViewTransform();
  return { x: ox + w.x * S, y: oy + w.y * S, r: 8 * S };
}

function pickBotAtPoint(renderCtx, x, y) {
  if (!renderCtx || !replay) return null;

  const ids = ['BOT1','BOT2','BOT3','BOT4'];
  let best = null;
  let bestD2 = Infinity;

  for (const id of ids) {
    const p = botScreenPos(renderCtx, id);
    if (!p) continue;
    const dx = x - p.x;
    const dy = y - p.y;
    const d2 = dx*dx + dy*dy;
    const hitR = p.r + 8;
    if (d2 <= hitR*hitR && d2 < bestD2) {
      best = id;
      bestD2 = d2;
    }
  }

  return best;
}

function selectionOverlay(renderCtx) {
  if (!renderCtx || !selectedBotId) return;
  const p = botScreenPos(renderCtx, selectedBotId);
  if (!p) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(59,130,246,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r + 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function canvasPointFromMouseEvent(ev) {
  // Important: our rendering coordinate system is in **logical (CSS) pixels**.
  // The renderer applies ctx.setTransform(dpr,0,0,dpr,0,0) internally.
  // So for picking we must return logical coordinates as well (not device pixels).
  const rect = canvas.getBoundingClientRect();
  const { width: lw, height: lh } = canvasLogicalSize();
  const scaleX = lw / rect.width;
  const scaleY = lh / rect.height;
  return { x: (ev.clientX - rect.left) * scaleX, y: (ev.clientY - rect.top) * scaleY };
}

function render() {
  // Keep canvas resolution matched to its displayed size (hi-DPI aware).
  // This reduces perceived jerkiness/jitter from browser scaling.
  resizeCanvasToDisplaySize();

  if (!replay) {
    hud.textContent = '';
    return;
  }

  const renderCtx = computeRenderCtx();
  if (!renderCtx) return;

  const { width: logicalWidth, height: logicalHeight } = canvasLogicalSize();

  renderFrame({
    canvas,
    fromSnapshot: renderCtx.fromSnapshot,
    toSnapshot: renderCtx.toSnapshot,
    events: renderCtx.renderEvents,
    showAnchors: showAnchorsEl.checked,
    progress01: renderCtx.progress01,
    dpr: canvasDpr,
    logicalWidth,
    logicalHeight,
  });

  selectionOverlay(renderCtx);

  hud.textContent = `tick=${renderCtx.shownTick}/${renderCtx.maxTick}  speed=${currentSpeed()}×  ended=${replay.result.endReason}`;
  updateEventLog(renderCtx.shownTick);
  updateInspector(renderCtx.shownTick);
}

function animate(ms) {
  if (!replay) {
    requestAnimationFrame(animate);
    return;
  }

  if (!lastFrameMs) lastFrameMs = ms;
  // Clamp dt so if the tab was inactive or the browser stutters,
  // we don't skip multiple ticks in a single frame (looks jerky).
  const dtRaw = (ms - lastFrameMs) / 1000;
  const dt = Math.min(dtRaw, 0.1);
  lastFrameMs = ms;

  if (playing) {
    const ticksPerSec = replay.header.ticksPerSecond * currentSpeed();
    playhead += dt * ticksPerSec;

    const maxTick = replay.state.length - 1;
    if (playhead >= maxTick) {
      playhead = maxTick;
      playing = false;
    }
  }

  render();
  requestAnimationFrame(animate);
}

// --- wire UI ---

canvas.addEventListener('click', (ev) => {
  if (!replay) return;

  const renderCtx = computeRenderCtx();
  const p = canvasPointFromMouseEvent(ev);
  const hit = pickBotAtPoint(renderCtx, p.x, p.y);

  setSelectedBot(hit);
  render();
});

btnLoadBot2?.addEventListener('click', async () => {
  try {
    await setBot1SourceText(await fetchExampleScript('bot2'));
  } catch {
    await setBot1SourceText(BUILTIN_BOT2_SOURCE + '\n');
  }
});

btnLoadBot3?.addEventListener('click', async () => {
  try {
    await setBot1SourceText(await fetchExampleScript('bot3'));
  } catch {
    await setBot1SourceText(BUILTIN_BOT3_SOURCE + '\n');
  }
});

btnLoadBot1?.addEventListener('click', async () => {
  // bot1 is NOT supported by the minimal VM yet, but we still load it for inspection.
  try {
    await setBot1SourceText(await fetchExampleScript('bot1'));
  } catch {
    await setBot1SourceText(BUILTIN_BOT2_SOURCE + '\n');
  }
});

bot1Source?.addEventListener('input', () => {
  localStorage.setItem(LS_BOT1_DRAFT_KEY, bot1Source.value);
});

btnRun.addEventListener('click', () => {
  const seed = Number(seedInput.value || '0');
  const tickCap = Number(tickCapInput.value || '300');

  const params = {
    matchSeed: seed,
    tickCap,
    botSourceTextById: {
      BOT1: bot1Source.value,
      BOT2: botSources.BOT2,
      BOT3: botSources.BOT3,
      BOT4: botSources.BOT4,
    },
  };

  const replayA = createReplay(params);
  const replayB = createReplay(params);

  const detHashA = stableHash(replayStablePayload(replayA));
  const detHashB = stableHash(replayStablePayload(replayB));
  const detOk = detHashA === detHashB;

  qaReadout = {
    detOk,
    detHashA,
    detHashB,
    counts: computeSmokeCounts(replayA.events),
  };

  replay = replayA;

  playhead = 0;
  playing = false;
  lastFrameMs = 0;

  setSelectedBot(null);

  setUiEnabled(true);
  updateSummary();
  updateMeta();
  updateCompileOut();
  render();
});

btnPlay.addEventListener('click', () => {
  if (!replay) return;
  playing = true;
});

btnPause.addEventListener('click', () => {
  playing = false;
  render();
});

btnStep.addEventListener('click', () => {
  if (!replay) return;
  playing = false;
  playhead = Math.min(replay.state.length - 1, Math.floor(playhead) + 1);
  render();
});

btnReset.addEventListener('click', () => {
  if (!replay) return;
  playing = false;
  playhead = 0;
  render();
});

showAnchorsEl.addEventListener('change', render);
showEventsEl.addEventListener('change', render);

setUiEnabled(false);
setSelectedBot(null);
updateCompileOut();

resizeCanvasToDisplaySize();
renderFrame({
  canvas,
  fromSnapshot: { tick: 0, bots: [], bullets: [], powerups: [] },
  toSnapshot: { tick: 0, bots: [], bullets: [], powerups: [] },
  events: [],
  showAnchors: false,
  progress01: 0,
  dpr: canvasDpr,
  logicalWidth: canvasLogicalSize().width,
  logicalHeight: canvasLogicalSize().height,
});
requestAnimationFrame(animate);

// Re-fit canvas on layout changes.
window.addEventListener('resize', () => {
  // Avoid doing work if nothing changed.
  const changed = resizeCanvasToDisplaySize();
  if (changed) render();
});

// Initialize editor content + opponent sources
(async () => {
  await refreshBotSourcesFromMd();

  const existing = localStorage.getItem(LS_BOT1_DRAFT_KEY);
  if (existing) {
    await setBot1SourceText(existing, { save: false });
    return;
  }

  try {
    await setBot1SourceText(await fetchExampleScript('bot2'), { save: false });
  } catch {
    await setBot1SourceText(BUILTIN_BOT2_SOURCE + '\n', { save: false });
  }
})();
