const ARENA_SIZE_WORLD = 192
const SECTOR_SIZE_WORLD = 64
const ZONE_SIZE_WORLD = 32

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function slotFallbackColor(slotId) {
  switch (slotId) {
    case 'BOT1':
      return '#4ade80'
    case 'BOT2':
      return '#60a5fa'
    case 'BOT3':
      return '#f472b6'
    case 'BOT4':
      return '#fbbf24'
    default:
      return '#e2e8f0'
  }
}

function hpFill(hp01) {
  const t = clamp(hp01, 0, 1)
  if (t >= 0.5) {
    const u = (t - 0.5) / 0.5
    const r = Math.round(255 * (1 - u))
    const g = 255
    return `rgb(${r},${g},64)`
  }

  const u = t / 0.5
  const r = 255
  const g = Math.round(255 * u)
  return `rgb(${r},${g},64)`
}

function fillRoundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
  ctx.fill()
}

function measureAndSetCanvas(canvas, desiredCssPx) {
  const dpr = window.devicePixelRatio || 1

  canvas.style.width = `${desiredCssPx}px`
  canvas.style.height = `${desiredCssPx}px`
  canvas.width = Math.max(1, Math.round(desiredCssPx * dpr))
  canvas.height = Math.max(1, Math.round(desiredCssPx * dpr))

  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingEnabled = false

  return { ctx, dpr }
}

function buildAppearanceMap(replay) {
  const map = {}
  for (const b of replay.bots || []) {
    if (b?.appearance?.kind === 'COLOR' && typeof b.appearance.color === 'string') {
      map[b.slotId] = b.appearance.color
    }
  }
  return map
}

function getInterpolatedBots(replay, tick, a) {
  const t = clamp(tick, 0, replay.tickCap)
  const next = replay.state[t]
  const prev = t > 0 ? replay.state[t - 1] : next
  const prevById = new Map((prev?.bots || []).map((b) => [b.botId, b]))

  const out = []
  for (const b of next?.bots || []) {
    const p = prevById.get(b.botId) || b
    out.push({
      botId: b.botId,
      pos: {
        x: p.pos.x + (b.pos.x - p.pos.x) * a,
        y: p.pos.y + (b.pos.y - p.pos.y) * a,
      },
      hp: b.hp,
      ammo: b.ammo,
      energy: b.energy,
      alive: b.alive,
    })
  }
  return out
}

function getInterpolatedBullets(replay, tick, a) {
  const t = clamp(tick, 0, replay.tickCap)
  const next = replay.state[t]
  const prev = t > 0 ? replay.state[t - 1] : next
  const prevById = new Map((prev?.bullets || []).map((b) => [b.bulletId, b]))

  const out = []
  for (const b of next?.bullets || []) {
    const p = prevById.get(b.bulletId) || b
    out.push({
      bulletId: b.bulletId,
      ownerBotId: b.ownerBotId,
      pos: {
        x: p.pos.x + (b.pos.x - p.pos.x) * a,
        y: p.pos.y + (b.pos.y - p.pos.y) * a,
      },
      vel: b.vel,
    })
  }
  return out
}

function draw(ctx, cssSize, scale, renderState, selectedBotId) {
  ctx.clearRect(0, 0, cssSize, cssSize)

  // Background
  ctx.fillStyle = '#0b0f17'
  ctx.fillRect(0, 0, cssSize, cssSize)

  const zoneStepPx = ZONE_SIZE_WORLD * scale
  const sectorStepPx = SECTOR_SIZE_WORLD * scale

  // Zone grid
  ctx.strokeStyle = 'rgba(34, 197, 94, 0.16)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = zoneStepPx; x < cssSize; x += zoneStepPx) {
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, cssSize)
  }
  for (let y = zoneStepPx; y < cssSize; y += zoneStepPx) {
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(cssSize, y + 0.5)
  }
  ctx.stroke()

  // Sector grid
  ctx.strokeStyle = 'rgba(34, 197, 94, 0.36)'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let x = sectorStepPx; x < cssSize; x += sectorStepPx) {
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, cssSize)
  }
  for (let y = sectorStepPx; y < cssSize; y += sectorStepPx) {
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(cssSize, y + 0.5)
  }
  ctx.stroke()

  // Outer wall
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.85)'
  ctx.lineWidth = Math.max(3, Math.floor(scale))
  const inset = ctx.lineWidth / 2
  ctx.strokeRect(inset, inset, cssSize - inset * 2, cssSize - inset * 2)

  // Sector labels
  ctx.fillStyle = 'rgba(34, 197, 94, 0.28)'
  ctx.font = `600 ${Math.max(12, Math.floor(10 + scale * 1.2))}px ui-monospace, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const sectorId = row * 3 + col + 1
      const cx = (col * SECTOR_SIZE_WORLD + SECTOR_SIZE_WORLD / 2) * scale
      const cy = (row * SECTOR_SIZE_WORLD + SECTOR_SIZE_WORLD / 2) * scale
      ctx.fillText(String(sectorId), Math.round(cx), Math.round(cy))
    }
  }

  // Bullets
  for (const b of renderState.bullets || []) {
    const x = b.pos.x * scale
    const y = b.pos.y * scale
    const r = Math.max(2, Math.floor(1.2 * scale))

    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = slotFallbackColor(b.ownerBotId)
    ctx.fill()

    if (b.vel) {
      const dx = clamp(b.vel.x, -12, 12)
      const dy = clamp(b.vel.y, -12, 12)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo((b.pos.x + dx * 0.1) * scale, (b.pos.y + dy * 0.1) * scale)
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'
      ctx.lineWidth = Math.max(1, Math.floor(0.25 * scale))
      ctx.stroke()
    }
  }

  // Bots
  const botRadius = 8 * scale
  const barH = Math.max(2, Math.floor(0.6 * scale))
  const barW = Math.max(24, 16 * scale + 2)

  for (const bot of renderState.bots || []) {
    const x = bot.pos.x * scale
    const y = bot.pos.y * scale

    const fill = bot.appearanceColor || slotFallbackColor(bot.botId)
    const a = bot.alive ? 1 : 0.35

    // Selection ring
    if (selectedBotId && bot.botId === selectedBotId) {
      ctx.save()
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.95)'
      ctx.lineWidth = Math.max(2, Math.floor(1.2 * scale))
      ctx.shadowColor = 'rgba(99, 102, 241, 0.55)'
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.arc(x, y, botRadius + Math.max(4, scale), 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    ctx.save()
    ctx.globalAlpha = a

    // Bars
    const barX = x - barW / 2
    const barY = y - botRadius - 6 - barH * 3 - 2

    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.fillRect(barX, barY, barW, barH)
    ctx.fillStyle = hpFill(bot.hp / 100)
    ctx.fillRect(barX, barY, barW * clamp(bot.hp / 100, 0, 1), barH)

    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.fillRect(barX, barY + barH + 1, barW, barH)
    ctx.fillStyle = 'rgba(245, 158, 11, 0.95)'
    ctx.fillRect(barX, barY + barH + 1, barW * clamp(bot.ammo / 100, 0, 1), barH)

    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.fillRect(barX, barY + (barH + 1) * 2, barW, barH)
    ctx.fillStyle = 'rgba(56, 189, 248, 0.95)'
    ctx.fillRect(barX, barY + (barH + 1) * 2, barW * clamp(bot.energy / 100, 0, 1), barH)

    // Label
    const label = bot.botId
    const labelFont = Math.max(10, Math.floor(9 + scale * 1.1))
    ctx.font = `700 ${labelFont}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`
    const tm = ctx.measureText(label)
    const pillW = tm.width + 12
    const pillH = labelFont + 6
    const pillX = x - pillW / 2
    const pillY = barY - 6 - pillH

    ctx.fillStyle = 'rgba(0,0,0,0.72)'
    fillRoundRect(ctx, pillX, pillY, pillW, pillH, 6)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x, pillY + pillH / 2)

    // Token
    ctx.beginPath()
    ctx.arc(x, y, botRadius, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    ctx.lineWidth = Math.max(1, Math.floor(1 + scale * 0.2))
    ctx.stroke()

    ctx.restore()
  }
}

export function attachArenaRenderer(canvas) {
  let resizeObs = null
  let cssSize = 0
  let scale = 2
  let ctx = null

  function ensureSize() {
    const parent = canvas.parentElement
    const avail = parent ? Math.min(parent.clientWidth, parent.clientHeight || parent.clientWidth) : 640

    scale = clamp(Math.floor(avail / ARENA_SIZE_WORLD), 1, 6)
    cssSize = ARENA_SIZE_WORLD * scale
    const res = measureAndSetCanvas(canvas, cssSize)
    ctx = res.ctx
  }

  ensureSize()

  if ('ResizeObserver' in window) {
    resizeObs = new ResizeObserver(() => ensureSize())
    if (canvas.parentElement) resizeObs.observe(canvas.parentElement)
  }

  function renderEmpty() {
    ensureSize()
    draw(ctx, cssSize, scale, { bots: [], bullets: [] }, null)
  }

  function renderReplayFrame(replay, tick, alpha, selectedBotId) {
    ensureSize()

    const appearanceMap = buildAppearanceMap(replay)
    const bots = getInterpolatedBots(replay, tick, alpha).map((b) => ({
      ...b,
      appearanceColor: appearanceMap[b.botId] || null,
    }))
    const bullets = getInterpolatedBullets(replay, tick, alpha)

    draw(ctx, cssSize, scale, { bots, bullets }, selectedBotId)
  }

  return {
    renderEmpty,
    renderReplayFrame,
  }
}
