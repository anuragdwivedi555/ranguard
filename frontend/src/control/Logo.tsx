import React from 'react';

/** RANGUARD wordmark (transparent PNG). `height` is the rendered height in px. */
export const Logo: React.FC<{ height?: number; className?: string }> = ({ height = 40, className = '' }) => (
  <img src="/ranguard-logo.png" alt="RANGUARD" height={height} style={{ height, width: 'auto' }} className={`select-none ${className}`} draggable={false} />
);
