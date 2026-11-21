import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, Sky, Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Cell, User } from '../../types';
import { networkTo3D } from '../../components/3d/coords';
import { cellHealth, HEALTH_COLOR, powerToRadius, prettyCell } from '../model';
import { terrainHeight } from './terrain';
import { Landscape } from './Landscape';
import { LatticeBatch, TowerHead, TOWER_HEIGHT } from './LatticeTower';
import { CoverageCell, CoverageField, CoverageGhost } from './CoverageField';

export interface Ghost {
  cellId: string;
  powerDbm: number;
  color: string;
  label: string;
}

export interface TowerFieldProps {
  cells: Record<string, Cell>;
  users: User[];
  focusCell: string | null;
  selectedCell: string | null;
  onSelectCell: (id: string | null) => void;
  contested: string[];
  ghosts: Ghost[];
  spikeCell: string | null;
  night: boolean;
  autoRotate: boolean;
  viewNonce?: number;
}

function towerPos(cell: Cell): THREE.Vector3 {
  const [x, , z] = networkTo3D(cell.x, cell.y);
  return new THREE.Vector3(x, terrainHeight(x, z), z);
}

const HEAD_OFFSET = TOWER_HEIGHT - 1.1;

/** User equipment: glowing handsets, radio links to their serving tower, and data packets moving along links. */
const UserLayer: React.FC<{
  users: User[];
  towers: Record<string, THREE.Vector3>;
  colors: Record<string, string>;
  focusCell: string | null;
  spikeCell: string | null;
}> = ({ users, towers, colors, focusCell, spikeCell }) => {
  const dots = useRef<THREE.InstancedMesh>(null);
  const packets = useRef<THREE.InstancedMesh>(null);
  const lineGeom = useMemo(() => new THREE.BufferGeometry(), []);

  const ues = useMemo(
    () =>
      users.map((u, i) => {
        const [x, , z] = networkTo3D(u.x, u.y);
        const p = new THREE.Vector3(x, terrainHeight(x, z) + 0.12, z);
        const serving = u.serving_cell && towers[u.serving_cell] ? u.serving_cell : null;
        const covered = u.connection_status === 'CONNECTED' && u.is_adequately_served && serving;
        return { p, serving, covered, phase: (i * 0.137) % 1, speed: 0.25 + ((i * 7919) % 100) / 300 };
      }),
    [users, towers],
  );

  useLayoutEffect(() => {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    ues.forEach((u) => {
      if (!u.serving) return;
      const t = towers[u.serving];
      const highlight = !focusCell || focusCell === u.serving;
      c.set(u.covered ? colors[u.serving] ?? '#7dd3fc' : '#f87171').multiplyScalar(highlight ? 1 : 0.25);
      pos.push(u.p.x, u.p.y, u.p.z, t.x, t.y + HEAD_OFFSET, t.z);
      col.push(c.r * 0.35, c.g * 0.35, c.b * 0.35, c.r, c.g, c.b);
    });
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lineGeom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    lineGeom.computeBoundingSphere();

    const m = new THREE.Matrix4();
    const cc = new THREE.Color();
    ues.forEach((u, i) => {
      m.makeTranslation(u.p.x, u.p.y, u.p.z);
      dots.current!.setMatrixAt(i, m);
      cc.set(!u.covered ? '#ff4d4d' : spikeCell && u.serving === spikeCell ? '#ffb020' : '#e0f2fe');
      dots.current!.setColorAt(i, cc);
      packets.current!.setColorAt(i, new THREE.Color(u.serving ? colors[u.serving] ?? '#7dd3fc' : '#000'));
    });
    dots.current!.instanceMatrix.needsUpdate = true;
    if (dots.current!.instanceColor) dots.current!.instanceColor.needsUpdate = true;
    if (packets.current!.instanceColor) packets.current!.instanceColor.needsUpdate = true;
  }, [ues, towers, colors, focusCell, spikeCell, lineGeom]);

  const tmp = useMemo(() => new THREE.Vector3(), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    ues.forEach((u, i) => {
      const spike = spikeCell && u.serving === spikeCell;
      const s = !u.covered ? 1.25 + Math.sin(t * 6 + i) * 0.35 : spike ? 1.2 + Math.sin(t * 5 + i) * 0.3 : 1;
      m.makeScale(s, s, s).setPosition(u.p);
      dots.current!.setMatrixAt(i, m);
      if (u.serving && u.covered) {
        const tw = towers[u.serving];
        const k = (u.phase + t * u.speed * (spike ? 2.2 : 1)) % 1;
        // downlink: tower → user
        tmp.set(tw.x, tw.y + HEAD_OFFSET, tw.z).lerp(u.p, k);
        const vis = !focusCell || focusCell === u.serving ? 1 : 0.0001;
        m.makeScale(vis, vis, vis).setPosition(tmp);
      } else {
        m.makeScale(0.0001, 0.0001, 0.0001);
      }
      packets.current!.setMatrixAt(i, m);
    });
    dots.current!.instanceMatrix.needsUpdate = true;
    packets.current!.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <lineSegments geometry={lineGeom} renderOrder={3}>
        <lineBasicMaterial vertexColors transparent opacity={0.42} depthWrite={false} toneMapped={false} />
      </lineSegments>
      <instancedMesh ref={dots} args={[undefined, undefined, ues.length]} renderOrder={4}>
        <capsuleGeometry args={[0.055, 0.1, 3, 8]} />
        <meshStandardMaterial emissive="#ffffff" emissiveIntensity={0.25} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={packets} args={[undefined, undefined, ues.length]}>
        <sphereGeometry args={[0.045, 6, 6]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
};

/** Smoothly flies the camera to the focused tower and keeps orbit controls usable. */
const CameraRig: React.FC<{ target: THREE.Vector3 | null; controls: React.RefObject<OrbitControlsImpl>; nonce: number }> = ({ target, controls, nonce }) => {
  const { camera } = useThree();
  const flying = useRef(0);
  const goalPos = useRef(new THREE.Vector3(0, 9.5, 30));
  const goalTarget = useRef(new THREE.Vector3(0, 2, -3));

  useEffect(() => {
    if (target) {
      goalTarget.current.set(target.x * 0.75, target.y + 2.2, target.z * 0.75);
      goalPos.current.set(target.x * 0.75 + 3, target.y + 7.5, target.z * 0.75 + 15);
    } else {
      goalTarget.current.set(0, 2, -3);
      goalPos.current.set(0, 9.5, 30);
    }
    flying.current = 2.2;
  }, [target, nonce]);

  useFrame((_, dt) => {
    if (flying.current <= 0 || !controls.current) return;
    flying.current -= dt;
    const k = 1 - Math.exp(-dt * 2.4);
    camera.position.lerp(goalPos.current, k);
    controls.current.target.lerp(goalTarget.current, k);
    controls.current.update();
  });
  return null;
};

const SceneContents: React.FC<TowerFieldProps> = (props) => {
  const { cells, users, focusCell, selectedCell, onSelectCell, contested, ghosts, spikeCell, night, autoRotate } = props;
  const controls = useRef<OrbitControlsImpl>(null);
  const [hoverCell, setHoverCell] = React.useState<string | null>(null);
  const list = useMemo(() => Object.values(cells).sort((a, b) => a.cell_id.localeCompare(b.cell_id)), [cells]);

  // tower positions only depend on geography, keep them stable across power changes
  const geoKey = list.map((c) => `${c.cell_id}:${c.x}:${c.y}`).join('|');
  const towers = useMemo(() => {
    const out: Record<string, THREE.Vector3> = {};
    list.forEach((c) => (out[c.cell_id] = towerPos(c)));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoKey]);
  const origins = useMemo(() => list.map((c) => towers[c.cell_id]), [towers, list.length]);
  const spots = useMemo(() => origins.map((o) => [o.x, o.z] as [number, number]), [origins]);

  const colors = useMemo(() => {
    const out: Record<string, string> = {};
    list.forEach((c) => (out[c.cell_id] = HEALTH_COLOR[cellHealth(c, contested.includes(c.cell_id))]));
    return out;
  }, [list, contested]);

  const coverage: CoverageCell[] = list.map((c) => {
    const t = towers[c.cell_id];
    const health = cellHealth(c, contested.includes(c.cell_id));
    return {
      x: t.x,
      z: t.z,
      radius: powerToRadius(c.tx_power_dbm, c.status),
      color: health === 'healthy' ? '#5eead4' : HEALTH_COLOR[health],
      focus: focusCell === c.cell_id || selectedCell === c.cell_id,
    };
  });

  const ghostRings: CoverageGhost[] = ghosts
    .filter((g) => towers[g.cellId])
    .map((g) => ({ x: towers[g.cellId].x, z: towers[g.cellId].z, radius: powerToRadius(g.powerDbm), color: g.color }));

  const focusVec = focusCell && towers[focusCell] ? towers[focusCell] : null;
  const sun = night ? new THREE.Vector3(-40, 30, -80) : new THREE.Vector3(-60, 5, -120);

  return (
    <>
      {night ? (
        <>
          <color attach="background" args={['#060a18']} />
          <fog attach="fog" args={['#0a1124', 35, 120]} />
          <Stars radius={150} depth={40} count={4000} factor={4} fade speed={0.6} />
          <ambientLight intensity={0.25} color="#8aa4ff" />
          <hemisphereLight args={['#2a3a6a', '#0b1020', 0.6]} />
          <directionalLight position={sun} intensity={0.35} color="#9fb4ff" />
        </>
      ) : (
        <>
          <Sky distance={4500} sunPosition={sun} turbidity={10} rayleigh={3.2} mieCoefficient={0.008} mieDirectionalG={0.9} />
          <fog attach="fog" args={['#f0b98f', 28, 125]} />
          <ambientLight intensity={0.45} color="#ffe2c4" />
          <hemisphereLight args={['#ffe0b8', '#3f6b2a', 1.1]} />
          <directionalLight
            position={sun.clone().normalize().multiplyScalar(40)}
            intensity={2.6}
            color="#ffc58f"
            castShadow
            shadow-mapSize={[1536, 1536]}
            shadow-camera-left={-30}
            shadow-camera-right={30}
            shadow-camera-top={30}
            shadow-camera-bottom={-30}
            shadow-camera-far={120}
            shadow-bias={-0.0004}
          />
        </>
      )}

      <Landscape towerSpots={spots} night={night} />
      <CoverageField cells={coverage} ghosts={ghostRings} night={night} />
      <LatticeBatch origins={origins} night={night} />

      {list.map((c) => {
        const pos = towers[c.cell_id];
        const active = c.status === 'ACTIVE' || c.status === 'SLEEP';
        const isContested = contested.includes(c.cell_id);
        const neighbourTargets = c.neighbors
          .slice(0, 2)
          .map((n) => towers[n])
          .filter(Boolean);
        const health = cellHealth(c, isContested);
        const isFocus = focusCell === c.cell_id || selectedCell === c.cell_id;
        return (
          <group key={c.cell_id}>
            <TowerHead
              position={pos}
              active={active}
              statusColor={HEALTH_COLOR[health]}
              highlight={isFocus ? (isContested ? '#f87171' : '#fbbf24') : null}
              dishTargets={neighbourTargets}
              powerNorm={(c.tx_power_dbm - 10) / 36}
              night={night}
            />
            {/* invisible click target */}
            <mesh
              position={[pos.x, pos.y + TOWER_HEIGHT / 2, pos.z]}
              onClick={(e) => {
                e.stopPropagation();
                onSelectCell(selectedCell === c.cell_id ? null : c.cell_id);
              }}
              onPointerOver={() => {
                document.body.style.cursor = 'pointer';
                setHoverCell(c.cell_id);
              }}
              onPointerOut={() => {
                document.body.style.cursor = '';
                setHoverCell(null);
              }}
            >
              <cylinderGeometry args={[0.9, 0.9, TOWER_HEIGHT + 0.6, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <Html position={[pos.x, pos.y + TOWER_HEIGHT + 0.75, pos.z]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
              <div className={`tower-tag ${isFocus || hoverCell === c.cell_id ? 'is-focus' : ''} ${isContested ? 'is-contested' : ''}`}>
                <span className="dot" style={{ background: HEALTH_COLOR[health], boxShadow: `0 0 8px ${HEALTH_COLOR[health]}` }} />
                <span className="name">{prettyCell(c.cell_id)}</span>
                <span className="pwr">{active ? `${c.tx_power_dbm.toFixed(1)} dBm` : 'OFF'}</span>
              </div>
            </Html>
          </group>
        );
      })}

      {ghosts.map((g, i) => {
        const pos = towers[g.cellId];
        if (!pos) return null;
        const r = Math.max(0.6, powerToRadius(g.powerDbm));
        const angle = -0.5 + i * 0.55;
        return (
          <Html
            key={`${g.cellId}-${i}`}
            position={[pos.x + Math.cos(angle) * r, pos.y + 0.4, pos.z + Math.sin(angle) * r]}
            center
            zIndexRange={[19, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <div className="ghost-tag" style={{ borderColor: g.color, color: g.color }}>
              {g.label}
            </div>
          </Html>
        );
      })}

      <UserLayer users={users} towers={towers} colors={colors} focusCell={focusCell ?? selectedCell} spikeCell={spikeCell} />

      <OrbitControls
        ref={controls}
        enableDamping
        dampingFactor={0.08}
        minDistance={8}
        maxDistance={60}
        maxPolarAngle={Math.PI / 2.15}
        autoRotate={autoRotate}
        autoRotateSpeed={0.35}
      />
      <CameraRig target={focusVec} controls={controls} nonce={props.viewNonce ?? 0} />
    </>
  );
};

export const TowerField: React.FC<TowerFieldProps> = (props) => {
  const [ready, setReady] = React.useState(false);
  return (
  <div className="relative w-full h-full">
  <Canvas
    onCreated={() => requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)))}
    shadows
    dpr={[1, 1.5]}
    camera={{ position: [0, 9.5, 30], fov: 45, near: 0.1, far: 5000 }}
    gl={{ antialias: true, powerPreference: 'high-performance' }}
    onPointerMissed={() => props.onSelectCell(null)}
  >
    <Suspense fallback={null}>
      <SceneContents {...props} />
    </Suspense>
  </Canvas>
  <div
    className={`absolute inset-0 z-[40] grid place-items-center bg-[#0f1624] transition-opacity duration-700 pointer-events-none ${ready ? 'opacity-0' : 'opacity-100'}`}
  >
    <div className="flex flex-col items-center gap-3 text-slate-400 text-[12px]">
      <span className="w-6 h-6 rounded-full border-2 border-amber-300 border-t-transparent cr-spin" />
      Raising towers & placing 100 users…
    </div>
  </div>
  </div>
  );
};
