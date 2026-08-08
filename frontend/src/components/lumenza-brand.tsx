import Link from "next/link";

const BRAND_LABEL = "Lumenza — AI-агрегатор";
const CONVERGENCE_LABEL =
  "Lumenza объединяет несколько AI-моделей в один ответ";

interface LumenzaMarkProps {
  className?: string;
  animated?: boolean;
}

/**
 * A single four-point sparkle (plus a smaller companion sparkle) in the
 * brand's gold gradient — the one glyph used everywhere from the sidebar
 * wordmark to the animated chat-empty-state hero, so the product owns one
 * recognisable symbol instead of a different mark per surface.
 */
export function LumenzaMark({
  className = "size-7",
  animated = false,
}: LumenzaMarkProps) {
  return (
    <svg
      aria-hidden="true"
      data-testid="lumenza-mark"
      data-animated={animated}
      viewBox="0 0 48 48"
      fill="none"
      className={`lumenza-mark ${animated ? "is-animated" : ""} ${className}`}
    >
      <defs>
        <linearGradient id="lumenza-sparkle-gradient" x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--gold-hover)" />
          <stop offset="1" stopColor="var(--gold-active)" />
        </linearGradient>
      </defs>
      <path
        data-testid="lumenza-sparkle-primary"
        className="lumenza-sparkle lumenza-sparkle-primary"
        d="M24 0C24 13.2 13.2 24 0 24C13.2 24 24 34.8 24 48C24 34.8 34.8 24 48 24C34.8 24 24 13.2 24 0Z"
        fill="url(#lumenza-sparkle-gradient)"
      />
      <path
        data-testid="lumenza-sparkle-secondary"
        className="lumenza-sparkle lumenza-sparkle-secondary"
        d="M36.8 4C36.8 6.64 34.64 8.8 32 8.8C34.64 8.8 36.8 10.96 36.8 13.6C36.8 10.96 38.96 8.8 41.6 8.8C38.96 8.8 36.8 6.64 36.8 4Z"
        fill="url(#lumenza-sparkle-gradient)"
      />
    </svg>
  );
}

interface LumenzaBrandProps {
  href?: string;
  className?: string;
  markClassName?: string;
}

export function LumenzaBrand({
  href = "/",
  className = "",
  markClassName = "size-6",
}: LumenzaBrandProps) {
  return (
    <Link
      href={href}
      aria-label={BRAND_LABEL}
      className={`lumenza-brand ${className}`}
    >
      <LumenzaMark className={markClassName} />
      <span className="lumenza-wordmark" translate="no">Lumenza</span>
    </Link>
  );
}

/**
 * Chat's center glyph. Two prior attempts here were both wrong: an 8-point
 * compass star (traced from the design mockup — generic AI-sparkle, the
 * same visual family Claude/Gemini/ChatGPT already use for their own
 * marks) and a 3-node "goo" merge (rejected outright as a concept, not
 * just an execution problem). This one is built from the brand name
 * itself — "Lumenza" shares its root with "lumen," the unit of light —
 * rather than from generic AI iconography: a 7-blade lens iris/aperture
 * around a glowing point of light. No major AI product uses an
 * aperture/focus mark (the crowded territory is sparkles and liquid
 * blobs), and the *mechanism* directly represents what Chat does: many
 * inputs (model providers) focusing down to one clear point, same idea
 * the caption under it already states ("Модели сходятся здесь"). The
 * blade geometry is a real parametric iris construction (outer arc,
 * inner arc offset by a skew angle to create the pinwheel overlap, each
 * edge slightly bowed via a quadratic curve) rather than a simple
 * hexagon-slice pie chart — the inner opening reads as a rounded
 * aperture, not a star, at every size tested down to ~90px.
 */
function LumenzaApertureMark({ className = "size-24" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      fill="none"
      className={`lumenza-aperture-mark ${className}`}
    >
      <defs>
        <linearGradient id="lumenza-aperture-blade" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--gold-hover)" />
          <stop offset="1" stopColor="var(--gold-active)" />
        </linearGradient>
        <radialGradient id="lumenza-aperture-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff6e0" />
          <stop offset="55%" stopColor="#8fe9f2" />
          <stop offset="100%" stopColor="var(--cyan-primary)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="lumenza-aperture-glow" cx="50" cy="50" r="17" fill="url(#lumenza-aperture-glow)" />
      <g
        className="lumenza-aperture-blades"
        fill="url(#lumenza-aperture-blade)"
        fillOpacity="0.97"
        stroke="var(--bg-root)"
        strokeWidth="0.5"
        strokeLinejoin="round"
      >
        <path d="M65.32 57.38 L94.00 50.00 Q89.28 73.47 70.85 88.75 L58.59 64.67 Q61.75 60.83 65.32 57.38 Z" />
        <path d="M53.78 66.57 L77.43 84.40 Q56.14 95.35 32.71 90.46 L43.88 65.86 Q48.85 65.94 53.78 66.57 Z" />
        <path d="M39.40 63.29 L40.21 92.90 Q18.38 83.08 7.59 61.71 L33.79 55.11 Q36.82 59.04 39.40 63.29 Z" />
        <path d="M33.00 50.00 L10.36 69.09 Q4.42 45.90 14.40 24.14 L35.90 40.51 Q34.72 45.34 33.00 50.00 Z" />
        <path d="M39.40 36.71 L10.36 30.91 Q24.79 11.81 48.03 6.04 L48.63 33.06 Q44.12 35.14 39.40 36.71 Z" />
        <path d="M53.78 33.43 L40.21 7.10 Q64.14 6.48 83.14 21.05 L62.39 38.36 Q57.95 36.14 53.78 33.43 Z" />
        <path d="M65.32 42.62 L77.43 15.60 Q92.84 33.92 93.29 57.86 L66.82 52.43 Q65.79 47.57 65.32 42.62 Z" />
      </g>
    </svg>
  );
}

/**
 * Chat's empty-state hero. Previously ran 3 independently-spinning orbit
 * rings, 5 continuously-pulsing particles, and 2 static nodes, all looping
 * forever — a "solar system" that replayed every single time an active
 * user landed on an empty Chat, which for a task-focused product is
 * decorative motion with no state to convey (see Emil Kowalski's
 * frequency framework and Impeccable's product register: "no orchestrated
 * page-load sequences," "motion conveys state, not decoration"). First cut
 * at fixing this kept the star but calmed the surrounding motion to a
 * one-time entrance; the user pushed further and asked for an original
 * mark with its own living animation, matching what Agents already has
 * (a purpose-built network glyph, not a placeholder). See
 * LumenzaApertureMark above.
 */
export function LumenzaConvergence() {
  return (
    <div
      role="img"
      aria-label={CONVERGENCE_LABEL}
      data-testid="lumenza-convergence"
      className="lumenza-convergence"
    >
      <div className="lumenza-convergence-stage" aria-hidden="true">
        <span className="lumenza-orbit-ring" />
        <LumenzaApertureMark className="size-[5.5rem] sm:size-24" />
      </div>
      <span className="lumenza-convergence-caption" aria-hidden="true">
        Модели сходятся здесь
      </span>
    </div>
  );
}
