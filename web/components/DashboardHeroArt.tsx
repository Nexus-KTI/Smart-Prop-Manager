/** Flat token-coloured building line art for the dashboard header. Decorative only. */
export function DashboardHeroArt() {
  const towerWindows: [number, number][] = [];
  for (let row = 0; row < 7; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      towerWindows.push([104 + col * 16, 24 + row * 14]);
    }
  }
  const blockWindows: [number, number][] = [];
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      blockWindows.push([50 + col * 22, 80 + row * 14]);
    }
  }

  return (
    <svg
      className="dash-hero-art"
      viewBox="0 0 220 136"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <line x1={8} y1={128} x2={212} y2={128} stroke="var(--border)" />

        <polygon points="96,14 112,4 168,4 152,14" fill="var(--accent)" fillOpacity={0.45} />
        <polygon points="152,14 168,4 168,118 152,128" fill="var(--accent)" fillOpacity={0.25} />
        <rect x={96} y={14} width={56} height={114} fill="var(--accent-soft)" />
        {towerWindows.map(([x, y], i) => (
          <rect
            key={`t-${x}-${y}`}
            x={x}
            y={y}
            width={8}
            height={8}
            rx={1}
            stroke="none"
            fill="var(--accent)"
            fillOpacity={i % 4 === 1 ? 0.9 : 0.35}
          />
        ))}

        <polygon points="40,70 52,62 104,62 92,70" fill="var(--accent)" fillOpacity={0.45} />
        <polygon points="92,70 104,62 104,122 92,128" fill="var(--accent)" fillOpacity={0.25} />
        <rect x={40} y={70} width={52} height={58} fill="var(--accent-soft)" />
        {blockWindows.map(([x, y], i) => (
          <rect
            key={`b-${x}-${y}`}
            x={x}
            y={y}
            width={10}
            height={8}
            rx={1}
            stroke="none"
            fill="var(--accent)"
            fillOpacity={i === 2 ? 0.9 : 0.35}
          />
        ))}
        <rect x={60} y={110} width={12} height={18} rx={1} fill="var(--accent)" fillOpacity={0.55} />

        <line x1={190} y1={114} x2={190} y2={128} />
        <circle cx={190} cy={104} r={12} fill="var(--accent-soft)" />
        <line x1={24} y1={118} x2={24} y2={128} />
        <circle cx={24} cy={111} r={8} fill="var(--accent-soft)" />
      </g>
    </svg>
  );
}
