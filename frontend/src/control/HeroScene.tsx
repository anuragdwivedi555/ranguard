import React from 'react';

/** Resolution-independent sunset scene: lattice cell tower radiating animated signal rings. */
const CX = 1180; // tower axis
const HEAD_Y = 255;
const BASE_Y = 960;
const TOP_Y = 305;
const HW_BASE = 105;
const HW_TOP = 15;
const LEVELS = 14;

const hwAt = (y: number) => {
  const t = (y - TOP_Y) / (BASE_Y - TOP_Y); // 0 top … 1 base
  return HW_TOP + (HW_BASE - HW_TOP) * Math.pow(t, 1.25);
};

const lattice = (() => {
  const ys = Array.from({ length: LEVELS + 1 }, (_, i) => TOP_Y + ((BASE_Y - TOP_Y) * i) / LEVELS);
  const paths: string[] = [];
  for (let i = 0; i < LEVELS; i++) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    const a = hwAt(y0);
    const b = hwAt(y1);
    paths.push(`M${CX - b},${y1} L${CX + b},${y1}`); // girt
    paths.push(`M${CX - a},${y0} L${CX + b},${y1}`); // diagonals
    paths.push(`M${CX + a},${y0} L${CX - b},${y1}`);
  }
  return paths.join(' ');
})();

const CLOUDS: Array<[number, number, number, number, number]> = [
  [520, 610, 520, 16, 0.5],
  [900, 560, 640, 14, 0.42],
  [300, 520, 420, 12, 0.32],
  [1350, 640, 600, 18, 0.55],
  [760, 690, 700, 10, 0.5],
  [1450, 470, 420, 10, 0.3],
];

const LIGHTS: Array<[number, number, number, number]> = (() => {
  let a = 7;
  const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 220 }, () => {
    const y = 818 + rnd() * 80;
    return [rnd() * 1600, y, 0.8 + rnd() * 1.4, 0.25 + rnd() * 0.7] as [number, number, number, number];
  });
})();

export const HeroScene: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 1600 900" preserveAspectRatio="xMaxYMid slice" className={className} role="img" aria-label="Cell tower at sunset radiating signal rings">
    <defs>
      <linearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#15153a" />
        <stop offset="0.3" stopColor="#34336a" />
        <stop offset="0.5" stopColor="#8a4a7a" />
        <stop offset="0.66" stopColor="#e0635a" />
        <stop offset="0.8" stopColor="#f58a3a" />
        <stop offset="0.92" stopColor="#ffc15e" />
        <stop offset="1" stopColor="#ffd98a" />
      </linearGradient>
      <radialGradient id="hs-sun" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#fff4cf" stopOpacity="1" />
        <stop offset="0.25" stopColor="#ffd27a" stopOpacity="0.85" />
        <stop offset="1" stopColor="#ff9a3c" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="hs-ring" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#7dd3fc" />
        <stop offset="1" stopColor="#2563eb" />
      </linearGradient>
      <radialGradient id="hs-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#7dd3fc" stopOpacity="0.55" />
        <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
      </radialGradient>
      <filter id="hs-blur" x="-20%" y="-200%" width="140%" height="500%">
        <feGaussianBlur stdDeviation="14" />
      </filter>
    </defs>

    <rect width="1600" height="900" fill="url(#hs-sky)" />
    <circle cx="900" cy="800" r="460" fill="url(#hs-sun)" />
    <circle cx="900" cy="808" r="40" fill="#fff6d8" />

    {CLOUDS.map(([x, y, w, h, o], i) => (
      <ellipse key={i} cx={x} cy={y} rx={w / 2} ry={h} fill={i % 3 === 0 ? '#5a3f86' : i % 3 === 1 ? '#ff9a5a' : '#c9506a'} opacity={o} filter="url(#hs-blur)" />
    ))}

    {/* city under the sunset */}
    <path d="M0,812 C300,800 600,818 900,806 C1200,796 1450,814 1600,806 L1600,900 L0,900 Z" fill="#241a3a" />
    <path d="M0,846 C260,832 540,850 820,838 C1100,826 1380,848 1600,834 L1600,900 L0,900 Z" fill="#140f26" />
    <g fill="#ffd27a">
      {LIGHTS.map(([x, y, r, o], i) => (
        <circle key={i} cx={x} cy={y} r={r} opacity={o} />
      ))}
    </g>

    {/* signal rings */}
    <circle cx={CX} cy={HEAD_Y} r="260" fill="url(#hs-glow)" />
    {Array.from({ length: 8 }).map((_, i) => (
      <circle
        key={i}
        className="hero-ring"
        cx={CX}
        cy={HEAD_Y}
        r="620"
        fill="none"
        stroke="url(#hs-ring)"
        strokeWidth="2.2"
        vectorEffect="non-scaling-stroke"
        style={{ animationDelay: `${-i * 0.9}s` }}
      />
    ))}

    {/* tower */}
    <g stroke="#0a0d1a" strokeLinecap="round" fill="none">
      <path d={`M${CX - HW_BASE},${BASE_Y} L${CX - HW_TOP},${TOP_Y} M${CX + HW_BASE},${BASE_Y} L${CX + HW_TOP},${TOP_Y}`} strokeWidth="7" />
      <path d={lattice} strokeWidth="2.6" />
      {/* platform */}
      <path d={`M${CX - 62},${TOP_Y} H${CX + 62} M${CX - 62},${TOP_Y - 92} H${CX + 62} M${CX - 62},${TOP_Y} V${TOP_Y - 92} M${CX + 62},${TOP_Y} V${TOP_Y - 92}`} strokeWidth="3" />
      {/* mast */}
      <path d={`M${CX},${TOP_Y - 92} V${HEAD_Y - 130}`} strokeWidth="4" />
    </g>
    <g fill="#0a0d1a">
      {[-48, -2, 44].map((dx) => (
        <rect key={dx} x={CX + dx - 8} y={TOP_Y - 98} width="16" height="104" rx="4" />
      ))}
      <ellipse cx={CX + hwAt(TOP_Y + 70) + 9} cy={TOP_Y + 70} rx="7" ry="22" />
      <ellipse cx={CX - hwAt(TOP_Y + 140) - 9} cy={TOP_Y + 140} rx="7" ry="22" />
      <rect x={CX - 20} y={TOP_Y - 118} width="40" height="22" rx="4" />
    </g>
    <circle className="hero-beacon" cx={CX} cy={HEAD_Y - 134} r="6" fill="#ff3b3b" />
    <circle cx={CX} cy={HEAD_Y} r="7" fill="#e0f2fe" opacity="0.9" />
  </svg>
);
