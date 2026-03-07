import * as React from "react";

const ZONE_SIZE_WORLD = 32;
const SECTOR_SIZE_WORLD = 64;
const DEFAULT_ARENA_SIZE_WORLD = 192;

export type ArenaBotId = 1 | 2 | 3 | 4;

export type ArenaBotFrame = {
  id: ArenaBotId;
  pos: { x: number; y: number };
  hp: number; // 0..100
  color?: string; // "#RRGGBB" (fallback palette used when missing)
};

export type ArenaBulletFrame = {
  id: string;
  pos: { x: number; y: number };
  vel?: { x: number; y: number };
  ownerBotId?: ArenaBotId;
};

export type ArenaPowerupFrame = {
  id: string;
  kind: "HEALTH" | "AMMO" | "ENERGY";
  pos: { x: number; y: number };
};

export type ArenaFrame = {
  bots: ArenaBotFrame[];
  bullets?: ArenaBulletFrame[];
  powerups?: ArenaPowerupFrame[];
};

export type ArenaCanvasProps = {
  frame: ArenaFrame;
  arenaSizeWorld?: number;
  /**
   * Integer pixels-per-world-unit.
   * If omitted, the component picks the largest S in {1..6} that fits the container.
   */
  scale?: number;
  className?: string;
  style?: React.CSSProperties;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function chooseScale(availablePx: number, arenaSizeWorld: number) {
  const maxS = 6;
  for (let s = maxS; s >= 1; s--) {
    if (arenaSizeWorld * s <= availablePx) return s;
  }
  return 1;
}

function getFallbackBotColor(id: ArenaBotId) {
  // deterministic slot palette
  switch (id) {
    case 1:
      return "#3b82f6"; // blue
    case 2:
      return "#ef4444"; // red
    case 3:
      return "#22c55e"; // green
    case 4:
      return "#eab308"; // yellow
  }
}

function hpFill(hp01: number) {
  // green -> yellow -> red
  const t = clamp(hp01, 0, 1);
  if (t >= 0.5) {
    const u = (t - 0.5) / 0.5;
    const r = Math.round(255 * (1 - u));
    const g = 255;
    return `rgb(${r},${g},64)`;
  }
  const u = t / 0.5;
  const r = 255;
  const g = Math.round(255 * u);
  return `rgb(${r},${g},64)`;
}

function snapPx(cssPx: number, dpr: number) {
  return Math.round(cssPx * dpr) / dpr;
}

function linePos(cssPx: number, lineWidth: number, dpr: number) {
  const off = lineWidth % 2 === 1 ? 0.5 : 0;
  return snapPx(cssPx + off, dpr);
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
  ctx.fill();
}

function useElementSize<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);

  React.useEffect(() => {
    if (!ref.current) return;

    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setSize({ width: cr.width, height: cr.height });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}

export function ArenaCanvas({
  frame,
  arenaSizeWorld = DEFAULT_ARENA_SIZE_WORLD,
  scale,
  className,
  style,
}: ArenaCanvasProps) {
  const { ref: containerRef, size: containerSize } = useElementSize<HTMLDivElement>();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const resolvedScale = React.useMemo(() => {
    if (typeof scale === "number") return Math.max(1, Math.floor(scale));
    const availablePx = containerSize ? Math.min(containerSize.width, containerSize.height) : 0;
    if (!availablePx) return 2; // reasonable initial guess before measuring
    return chooseScale(availablePx, arenaSizeWorld);
  }, [arenaSizeWorld, containerSize, scale]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const s = resolvedScale;
    const cssSize = arenaSizeWorld * s;
    const dpr = typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;

    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    canvas.width = Math.max(1, Math.round(cssSize * dpr));
    canvas.height = Math.max(1, Math.round(cssSize * dpr));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // Background
    ctx.clearRect(0, 0, cssSize, cssSize);
    ctx.fillStyle = "#0b0f0e";
    ctx.fillRect(0, 0, cssSize, cssSize);

    const zoneStepPx = ZONE_SIZE_WORLD * s;
    const sectorStepPx = SECTOR_SIZE_WORLD * s;

    // Zone grid (thin)
    ctx.strokeStyle = "rgba(34, 197, 94, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = zoneStepPx; x < cssSize; x += zoneStepPx) {
      const xx = linePos(x, 1, dpr);
      ctx.moveTo(xx, 0);
      ctx.lineTo(xx, cssSize);
    }
    for (let y = zoneStepPx; y < cssSize; y += zoneStepPx) {
      const yy = linePos(y, 1, dpr);
      ctx.moveTo(0, yy);
      ctx.lineTo(cssSize, yy);
    }
    ctx.stroke();

    // Sector grid (thicker)
    ctx.strokeStyle = "rgba(34, 197, 94, 0.42)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = sectorStepPx; x < cssSize; x += sectorStepPx) {
      const xx = linePos(x, 2, dpr);
      ctx.moveTo(xx, 0);
      ctx.lineTo(xx, cssSize);
    }
    for (let y = sectorStepPx; y < cssSize; y += sectorStepPx) {
      const yy = linePos(y, 2, dpr);
      ctx.moveTo(0, yy);
      ctx.lineTo(cssSize, yy);
    }
    ctx.stroke();

    // Outer wall (distinct)
    const wallWidth = s >= 4 ? 4 : 3;
    ctx.strokeStyle = "rgba(148, 163, 184, 0.85)";
    ctx.lineWidth = wallWidth;
    const inset = wallWidth / 2;
    const x0 = linePos(inset, wallWidth, dpr);
    const y0 = linePos(inset, wallWidth, dpr);
    const x1 = linePos(cssSize - inset, wallWidth, dpr);
    const y1 = linePos(cssSize - inset, wallWidth, dpr);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x0, y1);
    ctx.closePath();
    ctx.stroke();

    // Sector labels 1..9
    const sectorsPerRow = Math.max(1, Math.floor(arenaSizeWorld / SECTOR_SIZE_WORLD));
    const fontSize = Math.max(12, Math.floor(10 + s * 1.25));
    ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(34, 197, 94, 0.28)";

    for (let row = 0; row < sectorsPerRow; row++) {
      for (let col = 0; col < sectorsPerRow; col++) {
        const sectorId = row * sectorsPerRow + col + 1;
        const cxWorld = col * SECTOR_SIZE_WORLD + SECTOR_SIZE_WORLD / 2;
        const cyWorld = row * SECTOR_SIZE_WORLD + SECTOR_SIZE_WORLD / 2;

        const cx = snapPx(Math.round(cxWorld * s), dpr);
        const cy = snapPx(Math.round(cyWorld * s), dpr);
        ctx.fillText(String(sectorId), cx, cy);
      }
    }

    const toPx = (w: number) => snapPx(Math.round(w * s), dpr);

    // Powerups (forward-compatible; optional)
    if (frame.powerups?.length) {
      // v1: structure is here, visuals can be added later
      // drawPowerups(frame.powerups)
    }

    // Bullets (forward-compatible; optional)
    if (frame.bullets?.length) {
      // v1: structure is here, visuals can be added later
      // drawBullets(frame.bullets)
    }

    // Bots
    const botRadiusPx = 8 * s;
    for (const bot of frame.bots) {
      const x = toPx(bot.pos.x);
      const y = toPx(bot.pos.y);

      // HP bar
      const hp01 = clamp(bot.hp / 100, 0, 1);
      const barW = Math.max(24, 16 * s + 2);
      const barH = Math.max(3, Math.floor(0.8 * s));
      const barGap = 2;
      const barX = x - barW / 2;
      const barY = y - botRadiusPx - barGap - barH;

      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = hpFill(hp01);
      ctx.fillRect(barX, barY, barW * hp01, barH);

      // Label pill
      const label = `BOT${bot.id}`;
      const labelFontSize = Math.max(10, Math.floor(9 + s * 1.1));
      ctx.font = `700 ${labelFontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"`;
      const tm = ctx.measureText(label);
      const padX = 6;
      const padY = 3;
      const pillW = tm.width + padX * 2;
      const pillH = labelFontSize + padY * 2;
      const pillX = x - pillW / 2;
      const pillY = barY - barGap - pillH;

      ctx.fillStyle = "rgba(0,0,0,0.72)";
      fillRoundRect(ctx, pillX, pillY, pillW, pillH, 6);

      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x, pillY + pillH / 2);

      // Bot token
      const fill = bot.color ?? getFallbackBotColor(bot.id);
      ctx.beginPath();
      ctx.arc(x, y, botRadiusPx, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();

      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = Math.max(1, Math.floor(1 + s * 0.2));
      ctx.stroke();
    }
  }, [arenaSizeWorld, frame, resolvedScale]);

  const cssSize = arenaSizeWorld * resolvedScale;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: "transparent",
        ...style,
      }}
    >
      <canvas ref={canvasRef} width={cssSize} height={cssSize} />
    </div>
  );
}
