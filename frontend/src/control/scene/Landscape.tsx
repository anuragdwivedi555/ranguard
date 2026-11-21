import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { fbm, mulberry32, terrainHeight, WORLD_SIZE } from './terrain';

interface LandscapeProps {
  towerSpots: Array<[number, number]>;
  night: boolean;
}

/** Ground mesh with vertex-coloured fields, meadows and forest floor. */
const Ground: React.FC<{ night: boolean }> = ({ night }) => {
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 160, 160);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const grassA = new THREE.Color('#4f8f34');
    const grassB = new THREE.Color('#7fb04a');
    const field = new THREE.Color('#b7b25a');
    const forest = new THREE.Color('#2f5a2a');
    const rock = new THREE.Color('#6d6a4f');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      const n = fbm(x * 0.12, z * 0.12);
      c.copy(grassA).lerp(grassB, n);
      // patchwork farm fields
      const fx = Math.floor((x + 300) / 7);
      const fz = Math.floor((z + 300) / 5);
      const cellRand = Math.abs(Math.sin(fx * 12.9898 + fz * 78.233)) % 1;
      if (cellRand > 0.72 && h < 3) c.lerp(field, 0.55);
      else if (cellRand < 0.12) c.lerp(grassB, 0.5);
      const forestMask = fbm(x * 0.05 + 7, z * 0.05 + 3);
      if (forestMask > 0.56) c.lerp(forest, 0.75);
      if (h > 9) c.lerp(rock, Math.min(1, (h - 9) / 8) * 0.5);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geom} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} color={night ? '#55627a' : '#ffffff'} />
    </mesh>
  );
};

/** Instanced conifers and broadleaf trees placed in forest clusters, keeping tower sites clear. */
const Trees: React.FC<LandscapeProps> = ({ towerSpots }) => {
  const coneRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const roundRef = useRef<THREE.InstancedMesh>(null);

  const { cones, rounds } = useMemo(() => {
    const rnd = mulberry32(7);
    const cones: Array<{ x: number; z: number; y: number; s: number; hue: number }> = [];
    const rounds: Array<{ x: number; z: number; y: number; s: number; hue: number }> = [];
    let tries = 0;
    while (cones.length + rounds.length < 2000 && tries < 30000) {
      tries++;
      const x = (rnd() - 0.5) * WORLD_SIZE * 0.92;
      const z = (rnd() - 0.5) * WORLD_SIZE * 0.92;
      const forest = fbm(x * 0.05 + 7, z * 0.05 + 3);
      const nearCenter = Math.abs(x) < 17 && Math.abs(z) < 12;
      const p = forest > 0.56 ? 0.95 : forest > 0.48 ? 0.15 : 0.02;
      if (rnd() > (nearCenter ? p * 0.35 : p)) continue;
      if (towerSpots.some(([tx, tz]) => (tx - x) ** 2 + (tz - z) ** 2 < 2.4)) continue;
      if (inVillage(x, z)) continue;
      const y = terrainHeight(x, z);
      const item = { x, z, y, s: 0.55 + rnd() * 0.75, hue: rnd() };
      if (rnd() < 0.7) cones.push(item);
      else rounds.push(item);
    }
    return { cones, rounds };
  }, [towerSpots]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    cones.forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, t.y + 0.9 * t.s, t.z), q, new THREE.Vector3(t.s, t.s * (1.1 + t.hue * 0.4), t.s));
      coneRef.current!.setMatrixAt(i, m);
      col.setHSL(0.3 + t.hue * 0.05, 0.45, 0.16 + t.hue * 0.08);
      coneRef.current!.setColorAt(i, col);
    });
    const all = [...cones, ...rounds];
    all.forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, t.y + 0.2 * t.s, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      trunkRef.current!.setMatrixAt(i, m);
    });
    rounds.forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, t.y + 0.75 * t.s, t.z), q, new THREE.Vector3(t.s * 0.9, t.s * 0.8, t.s * 0.9));
      roundRef.current!.setMatrixAt(i, m);
      col.setHSL(0.22 + t.hue * 0.08, 0.5, 0.22 + t.hue * 0.1);
      roundRef.current!.setColorAt(i, col);
    });
    [coneRef, trunkRef, roundRef].forEach((r) => {
      r.current!.instanceMatrix.needsUpdate = true;
      if (r.current!.instanceColor) r.current!.instanceColor.needsUpdate = true;
    });
  }, [cones, rounds]);

  return (
    <group>
      <instancedMesh ref={coneRef} args={[undefined, undefined, cones.length]} castShadow>
        <coneGeometry args={[0.42, 1.5, 7]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={roundRef} args={[undefined, undefined, rounds.length]} castShadow>
        <icosahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, cones.length + rounds.length]}>
        <cylinderGeometry args={[0.05, 0.07, 0.4, 5]} />
        <meshStandardMaterial color="#4a3423" roughness={1} />
      </instancedMesh>
    </group>
  );
};

const VILLAGES: Array<[number, number, number]> = [
  [5, 3.5, 3.2],
  [-6, -2.5, 2.4],
  [16, 9, 2.6],
  [-15, 6, 2],
  [3, -9.5, 2.2],
];

function inVillage(x: number, z: number) {
  return VILLAGES.some(([vx, vz, r]) => (vx - x) ** 2 + (vz - z) ** 2 < r * r);
}

/** Small houses with pitched roofs clustered into villages like the reference photo. */
const Houses: React.FC<{ night: boolean; towerSpots: Array<[number, number]> }> = ({ night, towerSpots }) => {
  const wallRef = useRef<THREE.InstancedMesh>(null);
  const roofRef = useRef<THREE.InstancedMesh>(null);
  const winRef = useRef<THREE.InstancedMesh>(null);

  const houses = useMemo(() => {
    const rnd = mulberry32(21);
    const list: Array<{ x: number; z: number; y: number; w: number; d: number; h: number; rot: number; roof: number; wall: number }> = [];
    VILLAGES.forEach(([vx, vz, r]) => {
      const n = Math.round(r * r * 2.2);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const rr = Math.sqrt(rnd()) * r;
        const x = vx + Math.cos(a) * rr;
        const z = vz + Math.sin(a) * rr;
        if (towerSpots.some(([tx, tz]) => (tx - x) ** 2 + (tz - z) ** 2 < 1.6)) continue;
        if (list.some((h) => (h.x - x) ** 2 + (h.z - z) ** 2 < 0.45)) continue;
        list.push({
          x,
          z,
          y: terrainHeight(x, z),
          w: 0.35 + rnd() * 0.25,
          d: 0.28 + rnd() * 0.18,
          h: 0.22 + rnd() * 0.12,
          rot: Math.round(rnd() * 4) * (Math.PI / 2) + (rnd() - 0.5) * 0.3,
          roof: rnd(),
          wall: rnd(),
        });
      }
    });
    return list;
  }, [towerSpots]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    houses.forEach((h, i) => {
      q.setFromEuler(new THREE.Euler(0, h.rot, 0));
      m.compose(new THREE.Vector3(h.x, h.y + h.h / 2, h.z), q, new THREE.Vector3(h.w, h.h, h.d));
      wallRef.current!.setMatrixAt(i, m);
      col.setHSL(0.09, 0.25, 0.78 + h.wall * 0.15);
      wallRef.current!.setColorAt(i, col);

      const rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, h.rot + Math.PI / 4, 0));
      const rs = Math.max(h.w, h.d) * 0.78;
      m.compose(new THREE.Vector3(h.x, h.y + h.h + 0.11, h.z), rq, new THREE.Vector3(rs, 0.22, rs));
      roofRef.current!.setMatrixAt(i, m);
      col.setHSL(0.02 + h.roof * 0.04, 0.55, 0.32 + h.roof * 0.12);
      roofRef.current!.setColorAt(i, col);

      m.compose(new THREE.Vector3(h.x, h.y + h.h / 2, h.z), q, new THREE.Vector3(h.w * 1.01, h.h * 0.35, h.d * 1.01));
      winRef.current!.setMatrixAt(i, m);
    });
    [wallRef, roofRef, winRef].forEach((r) => {
      r.current!.instanceMatrix.needsUpdate = true;
      if (r.current!.instanceColor) r.current!.instanceColor.needsUpdate = true;
    });
  }, [houses]);

  return (
    <group>
      <instancedMesh ref={wallRef} args={[undefined, undefined, houses.length]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={roofRef} args={[undefined, undefined, houses.length]} castShadow>
        <coneGeometry args={[0.72, 1, 4]} />
        <meshStandardMaterial roughness={0.7} flatShading />
      </instancedMesh>
      {/* warm window band that glows at night */}
      <instancedMesh ref={winRef} args={[undefined, undefined, houses.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={night ? '#ffcf7a' : '#c9b79c'}
          emissive={night ? '#ffb347' : '#000000'}
          emissiveIntensity={night ? 1.6 : 0}
          transparent
          opacity={night ? 0.9 : 0.0}
        />
      </instancedMesh>
    </group>
  );
};

/** A winding country road through the valley. */
const Road: React.FC = () => {
  const geom = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      const x = -60 + t * 120;
      const z = Math.sin(t * Math.PI * 2.2) * 6 + 1.5;
      pts.push(new THREE.Vector3(x, 0, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const segs = 400;
    const positions: number[] = [];
    const idx: number[] = [];
    const width = 0.32;
    for (let i = 0; i <= segs; i++) {
      const p = curve.getPoint(i / segs);
      const tan = curve.getTangent(i / segs);
      const nx = -tan.z;
      const nz = tan.x;
      for (const s of [-1, 1]) {
        const x = p.x + nx * width * s;
        const z = p.z + nz * width * s;
        positions.push(x, terrainHeight(x, z) + 0.03, z);
      }
      if (i < segs) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geom} receiveShadow>
      <meshStandardMaterial color="#8a8273" roughness={1} side={THREE.DoubleSide} />
    </mesh>
  );
};

export const Landscape: React.FC<LandscapeProps> = (props) => (
  <group>
    <Ground night={props.night} />
    <Road />
    <Trees {...props} />
    <Houses night={props.night} towerSpots={props.towerSpots} />
  </group>
);
