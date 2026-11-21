export const COORD_SCALE = 0.016;
export const CENTER_X = 1150;
export const CENTER_Y = 1000;

export function networkTo3D(x: number, y: number, height: number = 0): [number, number, number] {
  const x3d = (x - CENTER_X) * COORD_SCALE;
  const z3d = (y - CENTER_Y) * COORD_SCALE;
  return [x3d, height, z3d];
}

export function txPowerToCoverageRadius(powerDbm: number): number {
  // 38 dBm standard -> radius ~ 7.0 in 3D
  // 46 dBm max -> radius ~ 10.0 in 3D
  // 10 dBm min -> radius ~ 2.5 in 3D
  const normalized = Math.max(0, (powerDbm - 10) / 36);
  return 2.5 + normalized * 7.5;
}
