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

let playing = false;
let lastFrameMs = 0;

// Continuous playhead in ticks (float), used for interpolation.
let playhead = 0;

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

function render() {
  if (!replay) {
    hud.textContent = '';
    return;
  }

  clampPlayhead();

  const maxTick = replay.state.length - 1;
  const base = Math.floor(playhead);
  const next = Math.min(maxTick, base + 1);
  const progress01 = playing ? (playhead - base) : 0;

  const fromSnapshot = replay.state[base];
  const toSnapshot = playing ? replay.state[next] : replay.state[base];
  const ev = playing ? (replay.events[next] ?? []) : (replay.events[base] ?? []);

  renderFrame({
    canvas,
    fromSnapshot,
    toSnapshot,
    events: ev,
    showAnchors: showAnchorsEl.checked,
    progress01,
  });

  const shownTick = (progress01 > 0) ? next : base;
  hud.textContent = `tick=${shownTick}/${maxTick}  speed=${currentSpeed()}×  ended=${replay.result.endReason}`;
  updateEventLog(shownTick);
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

btnRun.addEventListener('click', () => {
  const seed = Number(seedInput.value || '0');
  const tickCap = Number(tickCapInput.value || '300');
  replay = createReplay({ matchSeed: seed, tickCap });

  playhead = 0;
  playing = false;
  lastFrameMs = 0;

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
renderFrame({
  canvas,
  fromSnapshot: { tick: 0, bots: [], bullets: [], powerups: [] },
  toSnapshot: { tick: 0, bots: [], bullets: [], powerups: [] },
  events: [],
  showAnchors: false,
  progress01: 0,
});
requestAnimationFrame(animate);
