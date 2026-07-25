import Link from "next/link";

const BRAND_LABEL = "Lumenza — AI-агрегатор";
const CONVERGENCE_LABEL =
  "Lumenza объединяет несколько AI-моделей в один ответ";

interface LumenzaMarkProps {
  className?: string;
  animated?: boolean;
}

/**
 * Three independent model signals converge into Lumenza's routing core and
 * leave as one answer. The same geometry is used from favicon size to the
 * animated chat hero so the product owns one recognisable symbol.
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
      <path
        className="lumenza-route lumenza-route-one"
        d="M7 10.5h5.5c5.3 0 6.2 6.7 10.4 8.8"
        pathLength="1"
      />
      <path
        className="lumenza-route lumenza-route-two"
        d="M7 24h15.5"
        pathLength="1"
      />
      <path
        className="lumenza-route lumenza-route-three"
        d="M7 37.5h5.5c5.3 0 6.2-6.7 10.4-8.8"
        pathLength="1"
      />

      <circle
        data-testid="lumenza-source-node"
        className="lumenza-source lumenza-source-one"
        cx="6"
        cy="10.5"
        r="2"
      />
      <circle
        data-testid="lumenza-source-node"
        className="lumenza-source lumenza-source-two"
        cx="6"
        cy="24"
        r="2"
      />
      <circle
        data-testid="lumenza-source-node"
        className="lumenza-source lumenza-source-three"
        cx="6"
        cy="37.5"
        r="2"
      />

      <path
        className="lumenza-core-halo"
        d="M24 14.25 32.45 19v10L24 33.75 15.55 29V19L24 14.25Z"
      />
      <path
        className="lumenza-core"
        d="M24 16.7 30.3 20.25v7.5L24 31.3l-6.3-3.55v-7.5L24 16.7Z"
      />
      <path className="lumenza-monogram" d="M21.25 20.25v7h5.65" />

      <path
        className="lumenza-output-route"
        d="M31.5 24H42"
        pathLength="1"
      />
      <circle className="lumenza-output" cx="42" cy="24" r="2.15" />
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
        <LumenzaMark animated className="size-[6.75rem] sm:size-[7.5rem]" />
      </div>
      <span className="lumenza-convergence-caption" aria-hidden="true">
        <span className="lumenza-caption-pulse" />
        Модели сходятся здесь
      </span>
    </div>
  );
}
