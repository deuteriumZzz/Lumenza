"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useZone } from "@/components/zone";

const NODES: [number, number][] = [
  [60, 80],
  [220, 40],
  [400, 110],
  [560, 60],
  [740, 130],
  [860, 70],
  [140, 220],
  [320, 260],
  [500, 220],
  [680, 280],
  [820, 240],
  [90, 400],
  [260, 460],
  [430, 420],
  [610, 470],
  [780, 410],
  [180, 560],
  [400, 540],
  [600, 560],
  [840, 540],
];

const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [0, 6],
  [1, 7],
  [2, 8],
  [3, 9],
  [4, 10],
  [6, 7],
  [7, 8],
  [8, 9],
  [9, 10],
  [6, 11],
  [7, 12],
  [8, 13],
  [9, 14],
  [10, 15],
  [11, 12],
  [12, 13],
  [13, 14],
  [14, 15],
  [11, 16],
  [12, 17],
  [13, 17],
  [14, 18],
  [15, 19],
  [16, 17],
  [17, 18],
  [18, 19],
];

export function AmbientNetworkBackground() {
  const zone = useZone();
  // Смена зоны (перешли в Студию, переключили её категорию) один раз
  // проигрывает "сигнал" — тонкую волну, расходящуюся от центра, как будто
  // impulse побежал по проводам сети. Не проигрываем её на самом первом
  // рендере (первая зона — это не переход, а стартовое состояние).
  const [pulse, setPulse] = useState<{ zone: string; seq: number } | null>(
    null,
  );
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setPulse((current) => ({ zone, seq: (current?.seq ?? 0) + 1 }));
  }, [zone]);

  return (
    <div
      aria-hidden="true"
      data-testid="ambient-network-background"
      className="network-background pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <svg
        viewBox="0 0 900 600"
        preserveAspectRatio="xMidYMid slice"
        className="network-canvas h-full w-full"
      >
        <defs>
          <radialGradient id="network-node-glow">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="network-edge-glow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-muted)" stopOpacity="0.35" />
            <stop offset="52%" stopColor="var(--color-primary)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="var(--color-muted)" stopOpacity="0.22" />
          </linearGradient>
        </defs>
        {EDGES.map(([from, to], index) => (
          <line
            key={index}
            className="network-edge"
            style={{ animationDelay: `${-(index % 9) * 0.7}s` }}
            x1={NODES[from][0]}
            y1={NODES[from][1]}
            x2={NODES[to][0]}
            y2={NODES[to][1]}
            pathLength="1"
            stroke="url(#network-edge-glow)"
            strokeWidth={1.25}
          />
        ))}
        {NODES.map(([x, y], index) => {
          const animationStyle = {
            animationDelay: `${-(index % 7) * 0.85}s`,
          } as CSSProperties;
          return (
            <g key={index}>
              <circle
                className="network-node-glow"
                cx={x}
                cy={y}
                r={18}
                fill="url(#network-node-glow)"
                style={animationStyle}
              />
              <circle
                className="network-node"
                cx={x}
                cy={y}
                r={3.5}
                fill="var(--color-primary)"
                style={animationStyle}
              />
              {index % 5 === 0 && (
                <circle
                  className="network-signal"
                  cx={x}
                  cy={y}
                  r={5}
                  fill="none"
                  stroke="var(--color-primary)"
                  strokeWidth={1}
                  style={animationStyle}
                />
              )}
            </g>
          );
        })}
      </svg>
      {pulse && (
        <div
          key={pulse.seq}
          data-testid="ambient-network-pulse"
          data-zone={pulse.zone}
          className="network-pulse-scope"
        >
          <span className="network-pulse" />
        </div>
      )}
    </div>
  );
}
