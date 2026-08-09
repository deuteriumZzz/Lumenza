// Общие токены motion/react — единственный источник значений длительности/
// пружин для всех анимированных компонентов (см. ecc:motion-foundations).
// Хардкодить duration/easing/spring прямо в компонентах запрещено — берём
// отсюда, чтобы вся анимация в приложении ощущалась единообразно.
export const motionTokens = {
  duration: {
    instant: 0.08,
    fast: 0.16,
    normal: 0.28,
    slow: 0.52,
    crawl: 0.9,
  },
  easing: {
    smooth: [0.22, 1, 0.36, 1],
    sharp: [0.4, 0, 0.2, 1],
    linear: [0, 0, 1, 1],
  },
  distance: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 48,
  },
  scale: {
    route: 0.992,
    subtle: 0.98,
    press: 0.95,
    pop: 1.04,
  },
} as const;

export const springs = {
  snappy: { type: "spring", stiffness: 380, damping: 32 },
  gentle: { type: "spring", stiffness: 160, damping: 24 },
  instant: { type: "spring", stiffness: 600, damping: 35 },
  release: { type: "spring", stiffness: 200, damping: 20, restDelta: 0.001 },
} as const;

export const foundationMotion = {
  micro: { type: "tween", duration: 0.16, ease: [0.22, 1, 0.36, 1] },
  panel: { type: "tween", duration: 0.28, ease: [0.22, 1, 0.36, 1] },
} as const;

// Choreography-specific tokens for the pixel-perfect redesign
// (docs/LUMENZA_PIXEL_PERFECT_REDESIGN_PLAN.md §8). Kept separate from
// motionTokens.duration above rather than repurposing fast/normal/slow,
// since those are the existing single source of truth other components
// already depend on — reusing them here would silently retime unrelated
// animations. Consumed by route-transition.tsx (route in/out,
// Chat↔Agents core morph) and any right-inspector panel that needs to
// animate on selection change.
export const redesignMotion = {
  routeOut: { duration: 0.14, ease: [0.22, 1, 0.36, 1] },
  routeIn: { duration: 0.21, ease: [0.22, 1, 0.36, 1] },
  panel: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
  lumenzaCoreTransition: { duration: 0.56, ease: [0.22, 1, 0.36, 1] },
} as const;
