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

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function withAlpha(ctx, a, fn) {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * a;
  fn();
  ctx.globalAlpha = prev;
}

function byId(arr, key) {
  const m = new Map();
  for (const it of arr ?? []) m.set(it?.[key], it);
  return m;
}

function findEvent(events, type, pred) {
  for (const e of events ?? []) {
    if (!e || e.type !== type) continue;
    if (!pred || pred(e)) return e;
  }
  return null;
}

function findEvents(events, type) {
  return (events ?? []).filter(e => e?.type === type);
}

/**
 * Render a transition from `fromSnapshot` (end of tick t) to `toSnapshot`
 * (end of tick t+1). Pass `tickEvents = events[t+1]`.
 *
 * @param {{
 *  canvas: HTMLCanvasElement,
 *  fromSnapshot: any,
 *  toSnapshot: any,
 *  tickEvents?: any[],
 *  events?: any[],
 *  showAnchors: boolean,
 *  progress01: number,
 * }} params
 */
export function renderFrame(params) {
  const { canvas, fromSnapshot, toSnapshot, showAnchors } = params;
  const events = params.tickEvents ?? params.events ?? [];
  const p = clamp01(params.progress01);

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

  drawGrid(ctx, ox, oy, arenaPx);

  if (showAnchors) {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (const a of enumerateAnchors()) {
      const w = anchorWorldCenter(a);
      ctx.beginPath();
      ctx.arc(ox + w.x*S, oy + w.y*S, Math.max(1, 2*S/3), 0, Math.PI*2);
      ctx.fill();
    }
  }

  renderPowerups(ctx, ox, oy, S, fromSnapshot, toSnapshot, p);
  renderBulletsFromEvents(ctx, ox, oy, S, fromSnapshot, toSnapshot, events, p);
  renderBots(ctx, ox, oy, S, fromSnapshot, toSnapshot, events, p);

  const tickLabel = toSnapshot?.tick ?? fromSnapshot?.tick ?? 0;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `${12 + S}px ui-monospace, monospace`;
  ctx.fillText(`tick ${tickLabel}`, ox + 8, oy + 18);
}

function renderPowerups(ctx, ox, oy, S, fromSnapshot, toSnapshot, p) {
  const from = byId(fromSnapshot?.powerups ?? [], 'powerupId');
  const to = byId(toSnapshot?.powerups ?? [], 'powerupId');

  const ids = new Set([...from.keys(), ...to.keys()]);
  for (const id of ids) {
    if (id == null) continue;
    const a = from.get(id);
    const b = to.get(id);
    if (a && b) {
      const c = anchorWorldCenter(b.loc);
      drawPowerup(ctx, ox + c.x*S, oy + c.y*S, b.powerupType ?? b.type, S);
    } else if (!a && b) {
      withAlpha(ctx, p, () => {
        const c = anchorWorldCenter(b.loc);
        drawPowerup(ctx, ox + c.x*S, oy + c.y*S, b.powerupType ?? b.type, S);
      });
    } else if (a && !b) {
      withAlpha(ctx, 1 - p, () => {
        const c = anchorWorldCenter(a.loc);
        drawPowerup(ctx, ox + c.x*S, oy + c.y*S, a.powerupType ?? a.type, S);
      });
    }
  }
}

function renderBulletsFromEvents(ctx, ox, oy, S, fromSnapshot, toSnapshot, events, p) {
  const fromBots = byId(fromSnapshot?.bots ?? [], 'id');
  const toBots = byId(toSnapshot?.bots ?? [], 'id');

  const hits = findEvents(events, 'BULLET_HIT');
  const hitByBulletId = byId(hits, 'bulletId');

  const moves = findEvents(events, 'BULLET_MOVE');
  const lastMoveByBulletId = new Map();
  for (const m of moves) {
    if (m?.bulletId == null) continue;
    lastMoveByBulletId.set(m.bulletId, m);
  }

  const impactStart = 0.82;

  for (const m of moves) {
    const a = anchorWorldCenter({ sector: m.fromSector, zone: 0 });
    const sectorCenterTo = anchorWorldCenter({ sector: m.toSector, zone: 0 });

    const hit = hitByBulletId.get(m.bulletId);
    const isFinalMoveThisTick = lastMoveByBulletId.get(m.bulletId) === m;

    let impactTo = sectorCenterTo;
    if (hit && isFinalMoveThisTick) {
      const bot = toBots.get(hit.victimBotId) ?? fromBots.get(hit.victimBotId);
      if (bot?.loc) impactTo = anchorWorldCenter(bot.loc);
    }

    let x = 0;
    let y = 0;

    if (hit && isFinalMoveThisTick && (impactTo.x !== sectorCenterTo.x || impactTo.y !== sectorCenterTo.y)) {
      if (p < impactStart) {
        const t = p / impactStart;
        x = lerp(a.x, sectorCenterTo.x, t);
        y = lerp(a.y, sectorCenterTo.y, t);

        ctx.strokeStyle = 'rgba(229,238,252,0.28)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ox + a.x*S, oy + a.y*S);
        ctx.lineTo(ox + x*S, oy + y*S);
        ctx.stroke();
      } else {
        const t = (p - impactStart) / (1 - impactStart);
        x = lerp(sectorCenterTo.x, impactTo.x, t);
        y = lerp(sectorCenterTo.y, impactTo.y, t);

        ctx.strokeStyle = 'rgba(229,238,252,0.28)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ox + a.x*S, oy + a.y*S);
        ctx.lineTo(ox + sectorCenterTo.x*S, oy + sectorCenterTo.y*S);
        ctx.lineTo(ox + x*S, oy + y*S);
        ctx.stroke();
      }
    } else {
      x = lerp(a.x, sectorCenterTo.x, p);
      y = lerp(a.y, sectorCenterTo.y, p);

      ctx.strokeStyle = 'rgba(229,238,252,0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ox + a.x*S, oy + a.y*S);
      ctx.lineTo(ox + x*S, oy + y*S);
      ctx.stroke();
    }

    ctx.fillStyle = '#e5eefc';
    ctx.beginPath();
    ctx.arc(ox + x*S, oy + y*S, Math.max(2, S + 1), 0, Math.PI*2);
    ctx.fill();
  }

  const spawns = findEvents(events, 'BULLET_SPAWN');
  for (const s of spawns) {
    withAlpha(ctx, 1 - p, () => {
      const c = anchorWorldCenter({ sector: s.sector, zone: 0 });
      ctx.fillStyle = '#e5eefc';
      ctx.beginPath();
      ctx.arc(ox + c.x*S, oy + c.y*S, Math.max(2, S + 1), 0, Math.PI*2);
      ctx.fill();
    });
  }
}

function renderBots(ctx, ox, oy, S, fromSnapshot, toSnapshot, events, p) {
  const from = byId(fromSnapshot?.bots ?? [], 'id');
  const to = byId(toSnapshot?.bots ?? [], 'id');
  const ids = ['BOT1','BOT2','BOT3','BOT4'];

  for (const id of ids) {
    const a = from.get(id);
    const b = to.get(id) ?? a;
    if (!a && !b) continue;

    const mv = findEvent(events, 'BOT_MOVED', e => e.botId === id);
    const fromLoc = mv?.fromLoc ?? a?.loc ?? b?.loc;
    const toLoc = mv?.toLoc ?? b?.loc ?? a?.loc;
    if (!fromLoc || !toLoc) continue;

    const ca = anchorWorldCenter(fromLoc);
    const cb = anchorWorldCenter(toLoc);
    const x = lerp(ca.x, cb.x, p);
    const y = lerp(ca.y, cb.y, p);

    const aliveFrom = a?.alive !== false;
    const aliveTo = b?.alive !== false;
    if (!aliveFrom && !aliveTo) continue;

    const fade = (!aliveTo && aliveFrom) ? (1 - p) : 1;
    withAlpha(ctx, fade, () => {
      drawBot(ctx, ox + x*S, oy + y*S, b ?? a, S);
    });
  }

  if (p > 0.78) {
    const hits = findEvents(events, 'BULLET_HIT');
    if (hits.length) {
      const ringT = clamp01((p - 0.82) / 0.18);
      const flashT = clamp01((p - 0.78) / 0.12);
      const flashA = 1 - flashT;

      for (const h of hits) {
        const bot = to.get(h.victimBotId) ?? from.get(h.victimBotId);
        if (!bot || !bot.loc) continue;
        const c = anchorWorldCenter(bot.loc);

        if (flashA > 0) {
          withAlpha(ctx, flashA, () => {
            const cx = ox + c.x*S;
            const cy = oy + c.y*S;
            const r0 = Math.max(2, 2*S);
            const r1 = 5*S;

            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.beginPath();
            ctx.arc(cx, cy, r0, 0, Math.PI*2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.75)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx - r1, cy);
            ctx.lineTo(cx + r1, cy);
            ctx.moveTo(cx, cy - r1);
            ctx.lineTo(cx, cy + r1);
            ctx.stroke();
          });
        }

        if (ringT > 0) {
          withAlpha(ctx, ringT, () => {
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(ox + c.x*S, oy + c.y*S, 12*S, 0, Math.PI*2);
            ctx.stroke();
          });
        }
      }
    }
  }
}

function drawGrid(ctx, ox, oy, arenaPx) {
  const zone = arenaPx / 6;
  const sector = zone * 2;

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

  ctx.strokeStyle = 'rgba(140,165,190,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeRect(ox + 1.5, oy + 1.5, arenaPx - 3, arenaPx - 3);

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

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(cx - 18, cy - r - 16, 36, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `12px ui-monospace, monospace`;
  ctx.fillText(bot.id, cx - 14, cy - r - 5);

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
