type ArborLogoProps = {
  compact?: boolean;
  showText?: boolean;
  className?: string;
};

export function ArborLogo({ compact = false, showText = true, className = "" }: ArborLogoProps) {
  const markSize = compact ? 24 : 28;
  const textSize = compact ? "text-[16px]" : "text-[18px]";

  return (
    <span className={`inline-flex items-center gap-[10px] leading-none text-[var(--t1)] ${className}`.trim()}>
      <svg
        viewBox="0 0 36 36"
        width={markSize}
        height={markSize}
        aria-hidden="true"
        focusable="false"
        className="shrink-0"
      >
        <g stroke="rgba(240,239,232,0.18)" strokeWidth="1.6" strokeLinecap="round">
          <line x1="18" y1="18" x2="18" y2="5.5" />
          <line x1="18" y1="18" x2="27.5" y2="8.5" />
          <line x1="18" y1="18" x2="30.5" y2="18" />
          <line x1="18" y1="18" x2="27.5" y2="27.5" />
          <line x1="18" y1="18" x2="18" y2="30.5" />
          <line x1="18" y1="18" x2="8.5" y2="27.5" />
          <line x1="18" y1="18" x2="5.5" y2="18" />
          <line x1="18" y1="18" x2="8.5" y2="8.5" />
        </g>
        <g fill="rgba(240,239,232,0.18)">
          <circle cx="18" cy="5" r="2.15" />
          <circle cx="27.9" cy="8.1" r="2.15" />
          <circle cx="31" cy="18" r="2.15" />
          <circle cx="27.9" cy="27.9" r="2.15" />
          <circle cx="18" cy="31" r="2.15" />
          <circle cx="8.1" cy="27.9" r="2.15" />
          <circle cx="5" cy="18" r="2.15" />
          <circle cx="8.1" cy="8.1" r="2.15" />
        </g>
        <g stroke="rgba(212,103,63,0.9)" strokeWidth="1.8" strokeLinecap="round">
          <line x1="18" y1="18" x2="18" y2="8.2" />
          <line x1="18" y1="18" x2="25.1" y2="10.9" />
          <line x1="18" y1="18" x2="25.1" y2="25.1" />
          <line x1="18" y1="18" x2="10.9" y2="25.1" />
        </g>
        <circle cx="18" cy="18" r="3.95" fill="var(--accent-2)" />
        <circle cx="18" cy="8.2" r="2.05" fill="var(--accent-2)" />
        <circle cx="25.1" cy="10.9" r="2.05" fill="var(--accent-2)" />
        <circle cx="25.1" cy="25.1" r="2.05" fill="var(--accent-2)" />
        <circle cx="10.9" cy="25.1" r="2.05" fill="var(--accent-2)" />
      </svg>
      {showText ? (
        <span className={`font-serif font-semibold tracking-[-0.03em] ${textSize}`} style={{ textRendering: "optimizeLegibility" }}>
          Arbor
        </span>
      ) : null}
    </span>
  );
}

