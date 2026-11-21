import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { terrainHeight } from './terrain';

export interface CoverageCell {
  x: number;
  z: number;
  radius: number;
  color: string;
  focus: boolean;
}

export interface CoverageGhost {
  x: number;
  z: number;
  radius: number;
  color: string;
}

const N = 6;
const G = 6;

const vert = /* glsl */ `
  varying vec2 vXZ;
  void main() {
    vXZ = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const frag = /* glsl */ `
  #define N ${N}
  uniform vec3 uCells[N];      // x, z, radius
  uniform vec3 uColors[N];
  uniform vec4 uGhost[${G}];      // x, z, radius, enabled
  uniform vec3 uGhostColors[${G}];
  uniform float uFocus[N];
  uniform float uTime;
  uniform float uNight;
  varying vec2 vXZ;

  void main() {
    vec3 col = vec3(0.0);
    float alpha = 0.0;
    float covering = 0.0;
    for (int i = 0; i < N; i++) {
      vec2 c = uCells[i].xy;
      float r = uCells[i].z;
      vec2 dv = vXZ - c;
      float d = length(dv);
      float ang = atan(dv.y, dv.x);
      float focus = uFocus[i];
      if (r > 0.01) {
        float inside = 1.0 - smoothstep(r - 0.05, r, d);
        covering += inside;
        // three-sector antenna pattern: lobes at 90°, 210°, 330°
        float lobes = 0.78 + 0.22 * cos(3.0 * (ang - 1.5708));
        float fall = pow(clamp(1.0 - d / r, 0.0, 1.0), 1.3) * lobes;
        float fill = fall * (0.16 + 0.14 * focus + 0.12 * uNight) * inside;
        // radio wavefronts travelling outward
        float wave = pow(1.0 - fract(d * 0.42 - uTime * (0.45 + focus * 0.45)), 16.0) * inside * (0.10 + 0.32 * focus);
        // crisp cell edge
        float edge = exp(-pow((d - r) / 0.07, 2.0)) * (0.55 + 0.4 * focus);
        float a = fill + wave + edge;
        col += uColors[i] * a;
        alpha += a;
      }
    }
    for (int j = 0; j < ${G}; j++) {
      if (uGhost[j].w > 0.5) {
        vec2 gv = vXZ - uGhost[j].xy;
        float gd = length(gv);
        float gang = atan(gv.y, gv.x);
        float gr = max(uGhost[j].z, 0.3);
        float ring = exp(-pow((gd - gr) / 0.065, 2.0));
        float dash = step(0.45, fract(gang * 7.0 / 3.14159 + uTime * 0.35 * (float(j) + 1.0)));
        float a = ring * dash * 1.15;
        float inner = (1.0 - smoothstep(gr - 0.04, gr, gd)) * step(0.85, fract((vXZ.x - vXZ.y) * 2.2 + uTime * 0.2)) * 0.2;
        col += uGhostColors[j] * (a + inner);
        alpha += a + inner;
      }
    }
    // overlap = inter-cell interference zone, rendered as a soft warm tint
    float overlap = smoothstep(1.2, 2.0, covering);
    col += vec3(1.0, 0.55, 0.25) * overlap * 0.10;
    alpha += overlap * 0.07;
    alpha = clamp(alpha, 0.0, 0.9);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col / max(alpha, 0.001), alpha);
  }
`;

export const CoverageField: React.FC<{ cells: CoverageCell[]; ghosts: CoverageGhost[]; night: boolean }> = ({ cells, ghosts, night }) => {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  // animated radii (smooth power transitions)
  const live = useRef<number[]>(cells.map((c) => c.radius));
  const liveGhost = useRef<number[]>(new Array(G).fill(0));

  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(64, 48, 160, 120);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)) + 0.05);
    }
    return g;
  }, []);

  const uniforms = useMemo(
    () => ({
      uCells: { value: Array.from({ length: N }, () => new THREE.Vector3()) },
      uColors: { value: Array.from({ length: N }, () => new THREE.Color()) },
      uGhost: { value: Array.from({ length: G }, () => new THREE.Vector4()) },
      uGhostColors: { value: Array.from({ length: G }, () => new THREE.Color()) },
      uFocus: { value: new Array(N).fill(0) },
      uTime: { value: 0 },
      uNight: { value: 0 },
    }),
    [],
  );

  useFrame(({ clock }, dt) => {
    const k = 1 - Math.exp(-dt * 2.2);
    uniforms.uTime.value = clock.getElapsedTime();
    uniforms.uNight.value += ((night ? 1 : 0) - uniforms.uNight.value) * k;
    for (let i = 0; i < N; i++) {
      const c = cells[i];
      if (!c) {
        uniforms.uCells.value[i].set(0, 0, 0);
        continue;
      }
      live.current[i] = (live.current[i] ?? c.radius) + (c.radius - (live.current[i] ?? c.radius)) * k;
      uniforms.uCells.value[i].set(c.x, c.z, live.current[i]);
      (uniforms.uColors.value[i] as THREE.Color).lerp(new THREE.Color(c.color), k);
      uniforms.uFocus.value[i] += ((c.focus ? 1 : 0) - uniforms.uFocus.value[i]) * k;
    }
    for (let j = 0; j < G; j++) {
      const g = ghosts[j];
      if (!g) {
        uniforms.uGhost.value[j].w = 0;
        liveGhost.current[j] = 7;
        continue;
      }
      // ghost rings grow/shrink from the current footprint toward the proposed one
      liveGhost.current[j] += (g.radius - liveGhost.current[j]) * k * 1.4;
      uniforms.uGhost.value[j].set(g.x, g.z, liveGhost.current[j], 1);
      (uniforms.uGhostColors.value[j] as THREE.Color).set(g.color);
    }
  });

  return (
    <mesh geometry={geom} renderOrder={2}>
      <shaderMaterial
        ref={matRef}
        vertexShader={vert}
        fragmentShader={frag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
};
