import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { Cell } from '../../types';
import { networkTo3D, txPowerToCoverageRadius } from './coords';

interface BaseStation3DProps {
  cell: Cell;
  isSelected?: boolean;
  isContested?: boolean;
  onSelect?: (cellId: string) => void;
}

export const BaseStation3D: React.FC<BaseStation3DProps> = ({
  cell,
  isSelected = false,
  isContested = false,
  onSelect,
}) => {
  const [hovered, setHovered] = useState(false);
  const beaconRef = useRef<THREE.PointLight>(null);
  const coverageRef = useRef<THREE.Mesh>(null);

  const [x, , z] = networkTo3D(cell.x, cell.y, 0);
  const towerHeight = 3.2;
  const coverageRadius = txPowerToCoverageRadius(cell.tx_power_dbm);

  // Status colors
  const isSleep = cell.status === 'SLEEP';
  const isShutdown = cell.status === 'SHUTDOWN' || cell.status === 'INACTIVE';

  let primaryColor = '#06b6d4'; // Cyan default
  if (isShutdown) primaryColor = '#475569';
  else if (isSleep) primaryColor = '#f59e0b';
  else if (isContested) primaryColor = '#ef4444';
  else if (isSelected) primaryColor = '#10b981';

  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    // Beacon blink animation
    if (beaconRef.current) {
      if (isContested) {
        // Rapid red flash
        beaconRef.current.intensity = Math.sin(t * 12) > 0 ? 3.0 : 0.2;
      } else if (!isShutdown) {
        beaconRef.current.intensity = Math.sin(t * 3) > 0.5 ? 2.0 : 0.1;
      } else {
        beaconRef.current.intensity = 0;
      }
    }

    // Subtle coverage breathing pulse
    if (coverageRef.current && !isShutdown) {
      const pulse = 1 + Math.sin(t * 2 + cell.x) * 0.02;
      coverageRef.current.scale.set(pulse, 1, pulse);
    }
  });

  return (
    <group
      position={[x, 0, z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(cell.cell_id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      {/* Coverage Region Disc on Ground */}
      {!isShutdown && (
        <group position={[0, 0.02, 0]}>
          {/* Translucent coverage fill */}
          <mesh ref={coverageRef} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[coverageRadius, 48]} />
            <meshBasicMaterial
              color={primaryColor}
              transparent
              opacity={isSelected || hovered ? 0.22 : 0.08}
              depthWrite={false}
            />
          </mesh>

          {/* Glowing boundary perimeter ring */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[coverageRadius - 0.08, coverageRadius, 64]} />
            <meshBasicMaterial
              color={primaryColor}
              transparent
              opacity={isContested ? 0.9 : 0.5}
            />
          </mesh>
        </group>
      )}

      {/* Concrete Foundation Plinth */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.7, 0.9, 0.2, 8]} />
        <meshStandardMaterial
          color="#1e293b"
          roughness={0.7}
          metalness={0.3}
        />
      </mesh>

      {/* Equipment Shelter Cabinet */}
      <mesh position={[0.45, 0.25, 0.35]}>
        <boxGeometry args={[0.4, 0.5, 0.4]} />
        <meshStandardMaterial
          color="#0f172a"
          roughness={0.5}
          metalness={0.8}
        />
      </mesh>

      {/* Tower Lattice Mast (Tapered Main Column) */}
      <mesh position={[0, towerHeight / 2, 0]}>
        <cylinderGeometry args={[0.08, 0.25, towerHeight, 6]} />
        <meshStandardMaterial
          color="#334155"
          metalness={0.85}
          roughness={0.25}
        />
      </mesh>

      {/* Intermediate Cross-Brace Platforms */}
      {[1.0, 2.0, 2.8].map((h, idx) => (
        <mesh key={idx} position={[0, h, 0]}>
          <cylinderGeometry args={[0.22 - idx * 0.04, 0.22 - idx * 0.04, 0.06, 6]} />
          <meshStandardMaterial color="#475569" metalness={0.9} />
        </mesh>
      ))}

      {/* Triple-Sector Directional Antennas at Top */}
      <group position={[0, towerHeight, 0]}>
        {[0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((angle, i) => (
          <group key={i} rotation={[0, angle, 0]}>
            {/* Antenna mount arm */}
            <mesh position={[0.2, 0, 0]}>
              <boxGeometry args={[0.3, 0.04, 0.04]} />
              <meshStandardMaterial color="#64748b" />
            </mesh>
            {/* Directional Panel Antenna */}
            <mesh position={[0.35, 0, 0]}>
              <boxGeometry args={[0.08, 0.6, 0.16]} />
              <meshStandardMaterial
                color="#0f172a"
                metalness={0.6}
                roughness={0.3}
              />
            </mesh>
            {/* Glowing active LED status strip on antenna */}
            <mesh position={[0.4, 0, 0]}>
              <boxGeometry args={[0.02, 0.45, 0.03]} />
              <meshBasicMaterial
                color={primaryColor}
              />
            </mesh>
          </group>
        ))}

        {/* Top Warning Beacon Light */}
        <mesh position={[0, 0.35, 0]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color={isContested ? '#ef4444' : '#f59e0b'} />
        </mesh>
        <pointLight
          ref={beaconRef}
          position={[0, 0.4, 0]}
          color={isContested ? '#ef4444' : '#f59e0b'}
          distance={6}
          decay={2}
          intensity={1.5}
        />
      </group>

      {/* Floating 3D Technical Label */}
      <Html
        position={[0, towerHeight + 0.9, 0]}
        center
        distanceFactor={18}
        className="pointer-events-none select-none"
      >
        <div
          className={`flex flex-col items-center px-2 py-1 rounded-md text-[10px] font-mono tracking-tight border transition-all duration-300 backdrop-blur-md shadow-lg ${
            isContested
              ? 'bg-red-950/90 border-red-500/80 text-red-200 ring-2 ring-red-500/40 animate-pulse'
              : isSelected || hovered
              ? 'bg-cyan-950/90 border-cyan-400 text-cyan-100 ring-1 ring-cyan-400'
              : isSleep
              ? 'bg-amber-950/80 border-amber-500/50 text-amber-200'
              : 'bg-slate-950/85 border-slate-700/80 text-slate-200'
          }`}
        >
          <div className="flex items-center gap-1.5 font-bold">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isContested
                  ? 'bg-red-400'
                  : isSleep
                  ? 'bg-amber-400'
                  : isShutdown
                  ? 'bg-slate-500'
                  : 'bg-cyan-400'
              }`}
            />
            <span>{cell.cell_id}</span>
          </div>
          <div className="flex items-center gap-1 text-[9px] text-slate-300 mt-0.5">
            <span>{cell.tx_power_dbm.toFixed(1)} dBm</span>
            <span>•</span>
            <span>{Math.round(cell.current_load * 100)}% load</span>
          </div>
        </div>
      </Html>
    </group>
  );
};
