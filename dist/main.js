import { createReplay, stableHash } from './engine.js';
import { renderFrame } from './renderer.js';

const el = (id) => /** @type {any} */ (document.getElementById(id));

const canvas = /** @type {HTMLCanvasElement} */ (el('canvas'));
const hud = el('hud');
const meta = el('meta');

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

const matchSummary = el('matchSummary');
const eventPanel = el('eventPanel');
const eventLog = el('eventLog');

/** @type {import('./engine.js').Replay|null} */
let replay = null;
let tick = 0;
let playing = false;
let lastFrameMs = 0;
let tickAccumulator = 0;

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
    meta.textContent = '';
    return;
  }
  const hash = stableHash({ header: replay.header, state0: replay.state[0], result: replay.result });
  meta.textContent = `ruleset=${replay.header.rulesetVersion} seed=${replay.header.matchSeed} hash=${hash}`;
}

function updateEventLog() {
  if (!replay) {
    eventPanel.style.display = 'none';
    return;
  }
  eventPanel.style.display = showEventsEl.checked ? 'block' : 'none';
  if (!showEventsEl.checked) return;

  const ev = replay.events[tick] ?? [];
  eventLog.textContent = ev.map(formatEvent).join('\n');
}

function formatEvent(e) {
  if (!e || typeof e !== 'object') return String(e);
  const t = e.type;
  if (t === 'BOT_MOVED') return `${t} ${e.botId} ${locStr(e.fromLoc)} -> ${locStr(e.toLoc)}`;
  if (t === 'BULLET_MOVE') return `${t} #${e.bulletId} ${e.fromSector} -> ${e.toSector}`;
  if (t === 'BULLET_HIT') return `${t} #${e.bulletId} victim=${e.victimBotId} dmg=${e.damage}`;
  if (t === 'DAMAGE') return `${t} victim=${e.victimBotId} amt=${e.amount} src=${e.source}${e.sourceBotId ? ' by '+e.sourceBotId : ''} kind=${e.kind}`;
  if (t === 'BOT_DIED') return `${t} victim=${e.victimBotId} credited=${e.creditedBotId}`;
  if (t === 'POWERUP_SPAWN') return `${t} #${e.powerupId} ${e.type} at ${locStr(e.loc)}`;
  if (t === 'POWERUP_PICKUP') return `${t} ${e.botId} got ${e.type} at ${locStr(e.loc)}`;
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

function clampTick() {
  if (!replay) return;
  tick = Math.max(0, Math.min(tick, replay.state.length - 1));
}

function render() {
  if (!replay) {
    hud.textContent = '';
    return;
  }
  clampTick();
  const snapshot = replay.state[tick];
  const p = playing ? Math.min(1, tickAccumulator) : 1;
  renderFrame({ canvas, snapshot, showAnchors: showAnchorsEl.checked, progress01: p });
  hud.textContent = `tick=${tick}/${replay.state.length - 1}  speed=${currentSpeed()}×  ended=${replay.result.endReason}`;
  updateEventLog();
}

function animate(ms) {
  if (!replay) {
    requestAnimationFrame(animate);
    return;
  }
  if (!lastFrameMs) lastFrameMs = ms;
  const dt = (ms - lastFrameMs) / 1000;
  lastFrameMs = ms;

  if (playing) {
    const ticksPerSec = replay.header.ticksPerSecond * currentSpeed();
    tickAccumulator += dt * ticksPerSec;
    while (tickAccumulator >= 1) {
      tickAccumulator -= 1;
      tick += 1;
      if (tick >= replay.state.length - 1) {
        tick = replay.state.length - 1;
        playing = false;
        break;
      }
    }
  } else {
    tickAccumulator = 0;
  }

  render();
  requestAnimationFrame(animate);
}

btnRun.addEventListener('click', () => {
  const seed = Number(seedInput.value || '0');
  const tickCap = Number(tickCapInput.value || '300');
  replay = createReplay({ matchSeed: seed, tickCap });
  tick = 0;
  playing = false;
  lastFrameMs = 0;
  tickAccumulator = 0;
  setUiEnabled(true);
  updateSummary();
  updateMeta();
  render();
});

btnPlay.addEventListener('click', () => {
  if (!replay) return;
  playing = true;
});

btnPause.addEventListener('click', () => {
  playing = false;
});

btnStep.addEventListener('click', () => {
  if (!replay) return;
  playing = false;
  tick += 1;
  clampTick();
  render();
});

btnReset.addEventListener('click', () => {
  if (!replay) return;
  playing = false;
  tick = 0;
  render();
});

showAnchorsEl.addEventListener('change', render);
showEventsEl.addEventListener('change', () => {
  updateEventLog();
});

setUiEnabled(false);
renderFrame({ canvas, snapshot: { tick: 0, bots: [], bullets: [], powerups: [] }, showAnchors: false, progress01: 1 });
requestAnimationFrame(animate);
