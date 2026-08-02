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
          <stop offset="0" stopColor="oklch(0.88 0.12 85)" />
          <stop offset="1" stopColor="oklch(0.68 0.16 52)" />
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
      <span className="lumenza-wordmark">Lumenza</span>
    </Link>
  );
}

export function LumenzaConvergence() {
  return (
    <div
      role="img"
      aria-label={CONVERGENCE_LABEL}
      data-testid="lumenza-convergence"
      className="lumenza-convergence"
    >
      <div className="lumenza-convergence-stage" aria-hidden="true">
        <span className="lumenza-orbit lumenza-orbit-outer" />
        <span className="lumenza-orbit lumenza-orbit-inner" />
        <span className="lumenza-orbit-particle" style={{ left: "12%", top: "22%" }} />
        <span className="lumenza-orbit-particle" style={{ left: "85%", top: "18%" }} />
        <span className="lumenza-orbit-particle" style={{ left: "20%", top: "82%" }} />
        <span className="lumenza-orbit-particle" style={{ left: "90%", top: "70%" }} />
        <LumenzaMark animated className="size-[6.75rem] sm:size-[7.5rem]" />
      </div>
      <span className="lumenza-convergence-caption" aria-hidden="true">
        <span className="lumenza-caption-pulse" />
        Модели сходятся здесь
      </span>
    </div>
  );
}
