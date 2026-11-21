import * as THREE from 'three';

/** Deterministic PRNG so the landscape is identical on every load. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x: number, z: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, z: number, oct = 4) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * smoothNoise(x * freq, z * freq);
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

/** Ground height: nearly flat valley where the network lives, rolling hills further out. */
export function terrainHeight(x: number, z: number): number {
  const d = Math.sqrt((x / 1.25) ** 2 + (z / 1.0) ** 2);
  const valley = THREE.MathUtils.smoothstep(d, 20, 75);
  const gentle = (fbm(x * 0.08, z * 0.08) - 0.5) * 0.7;
  const hills = Math.pow(fbm(x * 0.03 + 10, z * 0.03 - 4, 5), 1.5) * 9;
  return gentle + valley * hills;
}

export const WORLD_SIZE = 220;
