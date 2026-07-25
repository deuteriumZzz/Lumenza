interface StudioMarkProps {
  className?: string;
  active?: boolean;
}

/**
 * Four creative tools orbit one Lumenza core. The aperture-like bloom stays
 * legible at navigation size and opens on hover to signal a creative workspace.
 */
export function StudioMark({
  className = "size-5",
  active = false,
}: StudioMarkProps) {
  return (
    <svg
      aria-hidden="true"
      data-testid="studio-mark"
      data-active={String(active)}
      viewBox="0 0 24 24"
      fill="none"
      className={`studio-mark ${className}`}
    >
      <g className="studio-mark-petals">
        <rect
          data-testid="studio-mark-petal"
          className="studio-mark-petal"
          x="9.65"
          y="1.75"
          width="4.7"
          height="8.25"
          rx="2.35"
        />
        <rect
          data-testid="studio-mark-petal"
          className="studio-mark-petal"
          x="14"
          y="9.65"
          width="8.25"
          height="4.7"
          rx="2.35"
        />
        <rect
          data-testid="studio-mark-petal"
          className="studio-mark-petal"
          x="9.65"
          y="14"
          width="4.7"
          height="8.25"
          rx="2.35"
        />
        <rect
          data-testid="studio-mark-petal"
          className="studio-mark-petal"
          x="1.75"
          y="9.65"
          width="8.25"
          height="4.7"
          rx="2.35"
        />
      </g>

      <rect
        data-testid="studio-mark-core"
        className="studio-mark-core"
        x="8.55"
        y="8.55"
        width="6.9"
        height="6.9"
        rx="2"
        transform="rotate(45 12 12)"
      />
      <circle className="studio-mark-aperture" cx="12" cy="12" r="1.45" />
      <circle className="studio-mark-spark" cx="19.25" cy="4.75" r="1.15" />
    </svg>
  );
}
