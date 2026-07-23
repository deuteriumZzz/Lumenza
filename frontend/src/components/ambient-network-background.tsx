// Статичная композиция узлов/рёбер (координаты захардкожены как разумный
// декоративный паттерн, не генерируются рантаймом), медленный дрейф через
// CSS @keyframes (globals.css: network-drift). Чисто декоративно —
// aria-hidden, pointer-events отключены, не мешает ни кликам, ни
// скринридерам.
//
// Широкий viewBox (не узкий квадрат) — при preserveAspectRatio="slice" на
// типичном широком/высоком экране логина маленький viewBox масштабируется
// так сильно, что видны 1-2 гигантских узла вместо сетки;ширина 900x600 с
// узлами, распределёнными по всей площади, остаётся читаемой как "сеть"
// независимо от соотношения сторон окна.
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
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-[0.16]"
    >
      <svg
        viewBox="0 0 900 600"
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
            strokeWidth={1.5}
          />
        ))}
        {NODES.map(([x, y], index) => (
          <circle key={index} cx={x} cy={y} r={4} fill="var(--color-primary)" />
        ))}
      </svg>
    </div>
  );
}
