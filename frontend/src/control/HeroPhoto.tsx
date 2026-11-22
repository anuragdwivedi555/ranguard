import React, { useEffect, useState } from 'react';

/**
 * Landing background: the enhanced dusk photo (2560×1432) with a crisp vector layer on top.
 * Photo and rings live in ONE svg, so they always stay aligned whatever the screen shape.
 * On narrow screens the viewBox is cropped around the tower so it stays in frame.
 */
const IMG_W = 2560;
const IMG_H = 1432;
const HEAD = { x: 1590, y: 300 }; // antenna cluster of the tower in the photo

export const HeroPhoto: React.FC = () => {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const viewBox = compact ? `1120 0 940 ${IMG_H}` : `0 0 ${IMG_W} ${IMG_H}`;

  return (
    <svg viewBox={viewBox} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full" role="img" aria-label="Cell tower above a city at dusk">
      <defs>
        <linearGradient id="hp-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e6f3ff" />
          <stop offset="1" stopColor="#7cc4ff" />
        </linearGradient>
        <radialGradient id="hp-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#bfe3ff" stopOpacity="0.38" />
          <stop offset="1" stopColor="#7cc4ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <image href="/ranguard-hero-dusk.jpg" width={IMG_W} height={IMG_H} preserveAspectRatio="none" />
      <circle cx={HEAD.x} cy={HEAD.y} r="330" fill="url(#hp-glow)" />
      {Array.from({ length: 7 }).map((_, i) => (
        <circle
          key={i}
          className="hero-ring"
          cx={HEAD.x}
          cy={HEAD.y}
          r="760"
          fill="none"
          stroke="url(#hp-ring)"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
          style={{ animationDelay: `${-i * 1.05}s` }}
        />
      ))}
    </svg>
  );
};
