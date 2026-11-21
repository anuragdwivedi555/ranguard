import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const TOWER_HEIGHT = 5.2;
const BASE_HALF = 0.55;
const TOP_HALF = 0.16;
const LEVELS = 9;

type Seg = [THREE.Vector3, THREE.Vector3, number];

/** Self-supporting 4-leg lattice tower: tapered legs, horizontal girts and X-bracing on every face. */
export function latticeSegments(origin: THREE.Vector3): Seg[] {
  const segs: Seg[] = [];
  const corner = (lvl: number, k: number) => {
    const t = lvl / LEVELS;
    // slight exponential taper like real towers
    const half = TOP_HALF + (BASE_HALF - TOP_HALF) * Math.pow(1 - t, 1.35);
    const sx = k === 0 || k === 3 ? -1 : 1;
    const sz = k < 2 ? -1 : 1;
    return new THREE.Vector3(origin.x + sx * half, origin.y + t * (TOWER_HEIGHT - 0.9), origin.z + sz * half);
  };
  for (let l = 0; l < LEVELS; l++) {
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      const a0 = corner(l, k);
      const a1 = corner(l + 1, k);
      const b0 = corner(l, k2);
      const b1 = corner(l + 1, k2);
      segs.push([a0, a1, 0.045]); // leg
      segs.push([a1, b1, 0.018]); // girt
      segs.push([a0, b1, 0.012]); // diagonal
      segs.push([b0, a1, 0.012]); // diagonal
    }
  }
  // top extension mast
  const topY = origin.y + TOWER_HEIGHT - 0.9;
  for (let k = 0; k < 4; k++) {
    const sx = k === 0 || k === 3 ? -1 : 1;
    const sz = k < 2 ? -1 : 1;
    segs.push([
      new THREE.Vector3(origin.x + sx * TOP_HALF, topY, origin.z + sz * TOP_HALF),
      new THREE.Vector3(origin.x + sx * 0.1, topY + 0.9, origin.z + sz * 0.1),
      0.03,
    ]);
  }
  return segs;
}

/** Renders the lattice of every tower in one instanced draw call. */
export const LatticeBatch: React.FC<{ origins: THREE.Vector3[]; night: boolean }> = ({ origins, night }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const segs = useMemo(() => origins.flatMap((o) => latticeSegments(o)), [origins]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion();
    segs.forEach(([a, b, r], i) => {
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      q.setFromUnitVectors(up, dir.normalize());
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      m.compose(mid, q, new THREE.Vector3(r, len, r));
      ref.current!.setMatrixAt(i, m);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [segs]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, segs.length]} castShadow>
      <cylinderGeometry args={[1, 1, 1, 5]} />
      <meshStandardMaterial color={night ? '#8d97a8' : '#c9ced6'} metalness={0.75} roughness={0.35} />
    </instancedMesh>
  );
};

interface TowerHeadProps {
  position: THREE.Vector3;
  active: boolean;
  statusColor: string;
  highlight: string | null;
  dishTargets: THREE.Vector3[];
  powerNorm: number;
  night: boolean;
}

const SECTORS = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];

/** Antenna head: three sector frames with panel antennas + RRUs, microwave dishes, aviation light, base cabinet. */
export const TowerHead: React.FC<TowerHeadProps> = ({ position, active, statusColor, highlight, dishTargets, powerNorm, night }) => {
  const beacon = useRef<THREE.Mesh>(null);
  const beaconLight = useRef<THREE.PointLight>(null);
  const leds = useRef<THREE.MeshStandardMaterial[]>([]);
  const halo = useRef<THREE.Mesh>(null);
  const phase = useMemo(() => Math.random() * 6, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + phase;
    const on = Math.sin(t * 2.4) > 0.55;
    if (beacon.current) {
      (beacon.current.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 6 : 0.4;
    }
    if (beaconLight.current) beaconLight.current.intensity = on ? (night ? 4 : 1.2) : 0;
    const pulse = active ? 1.5 + Math.sin(t * 5) * 0.8 : 0.05;
    leds.current.forEach((m) => m && (m.emissiveIntensity = pulse));
    if (halo.current) {
      const s = 1 + ((t * 0.9) % 1) * 1.6;
      halo.current.scale.set(s, s, s);
      (halo.current.material as THREE.MeshBasicMaterial).opacity = highlight ? 0.55 * (1 - ((t * 0.9) % 1)) : 0;
    }
  });

  const headY = TOWER_HEIGHT - 0.95;
  const panelColor = active ? '#f4f5f7' : '#7b828e';

  return (
    <group position={position}>
      {/* concrete pad + equipment cabinet + fence posts */}
      <mesh position={[0, 0.04, 0]} receiveShadow castShadow>
        <boxGeometry args={[1.7, 0.08, 1.7]} />
        <meshStandardMaterial color="#a5a39b" roughness={1} />
      </mesh>
      <mesh position={[0.55, 0.22, 0.6]} castShadow>
        <boxGeometry args={[0.38, 0.32, 0.22]} />
        <meshStandardMaterial color="#d8dbe0" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[-0.55, 0.18, 0.62]} castShadow>
        <boxGeometry args={[0.26, 0.24, 0.2]} />
        <meshStandardMaterial color="#9aa3ad" roughness={0.6} metalness={0.3} />
      </mesh>

      {/* platform rings */}
      {[headY - 0.55, headY + 0.25].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.42, 0.02, 6, 3]} />
          <meshStandardMaterial color="#b9bec6" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}

      {/* three sectors */}
      {SECTORS.map((a, si) => (
        <group key={si} rotation={[0, a, 0]}>
          {/* mounting arm */}
          <mesh position={[0, headY - 0.15, 0.24]}>
            <boxGeometry args={[0.03, 0.03, 0.48]} />
            <meshStandardMaterial color="#aab0b8" metalness={0.8} roughness={0.3} />
          </mesh>
          {/* pipe mount */}
          <mesh position={[0, headY - 0.15, 0.46]}>
            <boxGeometry args={[0.62, 0.025, 0.025]} />
            <meshStandardMaterial color="#aab0b8" metalness={0.8} roughness={0.3} />
          </mesh>
          {[-0.22, 0, 0.22].map((ox, pi) => (
            <group key={pi} position={[ox, headY - 0.15, 0.52]}>
              {/* panel antenna (radome) */}
              <mesh castShadow>
                <boxGeometry args={[0.13, pi === 1 ? 0.95 : 0.78, 0.055]} />
                <meshStandardMaterial color={panelColor} roughness={0.45} metalness={0.05} />
              </mesh>
              {/* remote radio unit behind panel */}
              <mesh position={[0, -0.1, -0.07]}>
                <boxGeometry args={[0.1, 0.18, 0.06]} />
                <meshStandardMaterial color="#5b6370" roughness={0.6} metalness={0.4} />
              </mesh>
              {/* status LED */}
              <mesh position={[0, -0.32, 0.03]}>
                <sphereGeometry args={[0.018, 8, 8]} />
                <meshStandardMaterial
                  ref={(m) => {
                    if (m) leds.current[si * 3 + pi] = m;
                  }}
                  color={statusColor}
                  emissive={statusColor}
                  emissiveIntensity={1}
                  toneMapped={false}
                />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* microwave backhaul dishes aimed at neighbouring towers */}
      {dishTargets.map((target, i) => {
        const dir = new THREE.Vector3(target.x - position.x, 0, target.z - position.z).normalize();
        const yaw = Math.atan2(dir.x, dir.z);
        const y = headY - 1.2 - i * 0.45;
        return (
          <group key={i} position={[0, y, 0]} rotation={[0, yaw, 0]}>
            <mesh position={[0, 0, 0.3]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.17, 0.17, 0.09, 20]} />
              <meshStandardMaterial color="#eceef1" roughness={0.4} />
            </mesh>
            <mesh position={[0, 0, 0.18]}>
              <boxGeometry args={[0.04, 0.04, 0.2]} />
              <meshStandardMaterial color="#9aa1aa" metalness={0.7} />
            </mesh>
          </group>
        );
      })}

      {/* lightning rod + aviation obstruction light */}
      <mesh position={[0, TOWER_HEIGHT + 0.25, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.5, 4]} />
        <meshStandardMaterial color="#c9ced6" metalness={0.8} />
      </mesh>
      <mesh ref={beacon} position={[0, TOWER_HEIGHT + 0.02, 0]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color="#ff2a2a" emissive="#ff1a1a" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <pointLight ref={beaconLight} position={[0, TOWER_HEIGHT + 0.1, 0]} color="#ff3030" distance={4} intensity={1} />

      {/* highlight halo around head when this cell is in focus */}
      <mesh ref={halo} position={[0, headY - 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 0.78, 48]} />
        <meshBasicMaterial color={highlight ?? '#ffffff'} transparent opacity={0} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};
