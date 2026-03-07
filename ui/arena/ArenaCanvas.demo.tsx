import * as React from "react";

import { ArenaCanvas, type ArenaFrame } from "./ArenaCanvas";

export function ArenaCanvasDemo() {
  const [t, setT] = React.useState(0);

  React.useEffect(() => {
    let raf = 0;
    const loop = () => {
      setT((v) => v + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const time = t / 60;

  const frame: ArenaFrame = {
    bots: [
      {
        id: 1,
        pos: { x: 32 + 64 * (1 + Math.sin(time * 0.8)), y: 32 + 64 * (1 + Math.cos(time * 0.7)) },
        hp: 92,
        color: "#60a5fa",
      },
      {
        id: 2,
        pos: { x: 96 + 48 * Math.cos(time * 0.6), y: 96 + 48 * Math.sin(time * 0.6) },
        hp: 68,
        color: "#f87171",
      },
      {
        id: 3,
        pos: { x: 140 + 14 * Math.sin(time * 1.4), y: 56 + 18 * Math.cos(time * 1.0) },
        hp: 37,
        color: "#34d399",
      },
      {
        id: 4,
        pos: { x: 54 + 12 * Math.cos(time * 1.25), y: 144 + 10 * Math.sin(time * 1.1) },
        hp: 12,
        color: "#fbbf24",
      },
    ],
    bullets: [],
    powerups: [],
  };

  return (
    <div
      style={{
        width: 520,
        height: 520,
        padding: 16,
        background: "#0a0a0a",
        borderRadius: 12,
        boxSizing: "border-box",
      }}
    >
      <div style={{ height: "100%" }}>
        <ArenaCanvas frame={frame} />
      </div>
    </div>
  );
}
