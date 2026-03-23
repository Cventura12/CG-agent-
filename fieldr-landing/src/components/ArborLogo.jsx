export function ArborLogo({ compact = false }) {
  return (
    <span
      className={`arbor-logo${compact ? ' is-compact' : ''}`}
      aria-label="Arbor"
      role="img"
    >
      <svg
        className="arbor-logo__mark"
        viewBox="0 0 36 36"
        aria-hidden="true"
        focusable="false"
      >
        <g stroke="rgba(232,224,212,0.18)" strokeWidth="1.6" strokeLinecap="round">
          <line x1="18" y1="18" x2="18" y2="5.5" />
          <line x1="18" y1="18" x2="27.5" y2="8.5" />
          <line x1="18" y1="18" x2="30.5" y2="18" />
          <line x1="18" y1="18" x2="27.5" y2="27.5" />
          <line x1="18" y1="18" x2="18" y2="30.5" />
          <line x1="18" y1="18" x2="8.5" y2="27.5" />
          <line x1="18" y1="18" x2="5.5" y2="18" />
          <line x1="18" y1="18" x2="8.5" y2="8.5" />
        </g>
        <g fill="rgba(232,224,212,0.18)">
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
        <circle cx="18" cy="18" r="3.95" fill="var(--sienna-lt)" />
        <circle cx="18" cy="8.2" r="2.05" fill="var(--sienna-lt)" />
        <circle cx="25.1" cy="10.9" r="2.05" fill="var(--sienna-lt)" />
        <circle cx="25.1" cy="25.1" r="2.05" fill="var(--sienna-lt)" />
        <circle cx="10.9" cy="25.1" r="2.05" fill="var(--sienna-lt)" />
      </svg>
      <span className="arbor-logo__type">Arbor</span>
    </span>
  )
}
