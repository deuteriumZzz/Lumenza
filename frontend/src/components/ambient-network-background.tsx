// Статичная композиция узлов/рёбер (координаты захардкожены как разумный
// декоративный паттерн, не генерируются рантаймом) — очень низкая
// непрозрачность ("еле-еле видно"), медленный дрейф через CSS
// @keyframes (globals.css: network-drift). Чисто декоративно —
// aria-hidden, pointer-events отключены, не мешает ни кликам, ни
// скринридерам.
const NODES: [number, number][] = [
  [40, 60],
  [160, 30],
  [280, 90],
  [90, 160],
  [220, 190],
  [340, 140],
  [60, 250],
  [300, 260],
];

const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [0, 3],
  [1, 4],
  [2, 5],
  [3, 4],
  [4, 5],
  [3, 6],
  [4, 7],
  [5, 7],
];

export function AmbientNetworkBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-[0.06]"
    >
      <svg
        viewBox="0 0 380 300"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full animate-[network-drift_26s_ease-in-out_infinite_alternate]"
      >
        {EDGES.map(([from, to], index) => (
          <line
            key={index}
            x1={NODES[from][0]}
            y1={NODES[from][1]}
            x2={NODES[to][0]}
            y2={NODES[to][1]}
            stroke="var(--color-ink)"
            strokeWidth={1}
          />
        ))}
        {NODES.map(([x, y], index) => (
          <circle key={index} cx={x} cy={y} r={3} fill="var(--color-primary)" />
        ))}
      </svg>
    </div>
  );
}
