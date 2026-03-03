import { enumerateAnchors } from './engine.js';

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

function pickScale(canvas) {
  const minDim = Math.min(canvas.width, canvas.height);
  const candidates = [6,5,4,3,2,1];
  for (const s of candidates) {
    if (WORLD * s <= minDim) return s;
  }
  return 1;
}

/**
 * @param {{
 *  canvas: HTMLCanvasElement,
 *  snapshot: any,
 *  showAnchors: boolean,
 *  progress01: number,
 * }} params
 */
export function renderFrame(params) {
  const { canvas, snapshot, showAnchors, progress01 } = params;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const S = pickScale(canvas);
  const arenaPx = WORLD * S;
  const ox = Math.floor((canvas.width - arenaPx) / 2);
  const oy = Math.floor((canvas.height - arenaPx) / 2);

  // background
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#06101a';
  ctx.fillRect(ox, oy, arenaPx, arenaPx);

  // grid
  drawGrid(ctx, ox, oy, arenaPx);

  // anchors overlay
  if (showAnchors) {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (const a of enumerateAnchors()) {
      const p = anchorWorldCenter(a);
      ctx.beginPath();
      ctx.arc(ox + p.x*S, oy + p.y*S, Math.max(1, 2*S/3), 0, Math.PI*2);
      ctx.fill();
    }
  }

  // powerups
  for (const p of snapshot.powerups ?? []) {
    const c = anchorWorldCenter(p.loc);
    drawPowerup(ctx, ox + c.x*S, oy + c.y*S, p.type, S);
  }

  // bullets (sector-level)
  for (const b of snapshot.bullets ?? []) {
    const loc = { sector: b.sector, zone: 0 };
    const c = anchorWorldCenter(loc);
    const dirOff = dirOffset(b.dir, 10 * progress01);
    ctx.fillStyle = '#e5eefc';
    ctx.beginPath();
    ctx.arc(ox + (c.x + dirOff.x) * S, oy + (c.y + dirOff.y) * S, Math.max(2, S), 0, Math.PI*2);
    ctx.fill();
  }

  // bots
  for (const bot of snapshot.bots ?? []) {
    if (!bot.alive) continue;
    const c = anchorWorldCenter(bot.loc);
    const cx = ox + c.x*S;
    const cy = oy + c.y*S;
    drawBot(ctx, cx, cy, bot, S);
  }

  // tick label
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `${12 + S}px ui-monospace, monospace`;
  ctx.fillText(`tick ${snapshot.tick}`, ox + 8, oy + 18);
}

function drawGrid(ctx, ox, oy, arenaPx) {
  const zone = arenaPx / 6; // 32*S
  const sector = zone * 2;

  // zone grid
  ctx.strokeStyle = 'rgba(80,255,110,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 6; i++) {
    const x = ox + i * zone;
    const y = oy + i * zone;
    ctx.beginPath();
    ctx.moveTo(Math.floor(x)+0.5, oy);
    ctx.lineTo(Math.floor(x)+0.5, oy + arenaPx);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ox, Math.floor(y)+0.5);
    ctx.lineTo(ox + arenaPx, Math.floor(y)+0.5);
    ctx.stroke();
  }

  // sector grid
  ctx.strokeStyle = 'rgba(80,255,110,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 3; i++) {
    const x = ox + i * sector;
    const y = oy + i * sector;
    ctx.beginPath();
    ctx.moveTo(Math.floor(x)+0.5, oy);
    ctx.lineTo(Math.floor(x)+0.5, oy + arenaPx);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ox, Math.floor(y)+0.5);
    ctx.lineTo(ox + arenaPx, Math.floor(y)+0.5);
    ctx.stroke();
  }

  // outer wall
  ctx.strokeStyle = 'rgba(140,165,190,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeRect(ox + 1.5, oy + 1.5, arenaPx - 3, arenaPx - 3);

  // sector labels 1..9
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.font = `14px ui-monospace, monospace`;
  for (let s = 1; s <= 9; s++) {
    const row = Math.floor((s-1)/3);
    const col = (s-1)%3;
    const cx = ox + col*sector + sector/2;
    const cy = oy + row*sector + sector/2;
    ctx.fillText(String(s), cx - 4, cy + 4);
  }
}

function drawBot(ctx, cx, cy, bot, S) {
  const r = 8 * S;
  ctx.fillStyle = bot.appearance?.color ?? '#888';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // label
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(cx - 18, cy - r - 16, 36, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `12px ui-monospace, monospace`;
  ctx.fillText(bot.id, cx - 14, cy - r - 5);

  // HP bar
  const hp = Math.max(0, Math.min(100, bot.health));
  const w = 28;
  const h = 4;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(cx - w/2, cy + r + 6, w, h);
  ctx.fillStyle = hp > 60 ? '#22c55e' : hp > 30 ? '#eab308' : '#ef4444';
  ctx.fillRect(cx - w/2, cy + r + 6, w * (hp/100), h);
}

function drawPowerup(ctx, cx, cy, type, S) {
  const size = 6 * S;
  ctx.save();
  ctx.translate(cx, cy);
  if (type === 'HEALTH') ctx.fillStyle = '#ff6b6b';
  else if (type === 'AMMO') ctx.fillStyle = '#f59e0b';
  else ctx.fillStyle = '#22d3ee';

  ctx.beginPath();
  ctx.rect(-size/2, -size/2, size, size);
  ctx.fill();
  ctx.restore();
}

function dirOffset(dir, mag) {
  if (dir === 'UP') return { x: 0, y: -mag };
  if (dir === 'DOWN') return { x: 0, y: mag };
  if (dir === 'LEFT') return { x: -mag, y: 0 };
  if (dir === 'RIGHT') return { x: mag, y: 0 };
  return { x: 0, y: 0 };
}
