import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Cell, User } from '../../types';
import { networkTo3D } from './coords';

interface SignalBeams3DProps {
  cells: Record<string, Cell>;
  users: User[];
  selectedCellId?: string | null;
}

export const SignalBeams3D: React.FC<SignalBeams3DProps> = ({
  cells,
  users,
  selectedCellId,
}) => {
  const particlesRef = useRef<THREE.Points>(null);

  // Compute line segments for active wireless links
  const { linePositions, lineColors, activeLinks } = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    const links: Array<{
      start: [number, number, number];
      end: [number, number, number];
      sinr: number;
    }> = [];

    const towerHeight = 3.2;

    for (const user of users) {
      if (
        user.connection_status === 'CONNECTED' &&
        user.serving_cell &&
        cells[user.serving_cell] &&
        cells[user.serving_cell].status === 'ACTIVE'
      ) {
        const cell = cells[user.serving_cell];
        const [cx, , cz] = networkTo3D(cell.x, cell.y, towerHeight);
        const [ux, , uz] = networkTo3D(user.x, user.y, 0.1);

        const isFiltered =
          !selectedCellId || user.serving_cell === selectedCellId;
        if (!isFiltered) continue;

        pos.push(cx, towerHeight, cz);
        pos.push(ux, 0.1, uz);

        // Color interpolation based on SINR
        const r = user.sinr_db >= 10 ? 0.05 : user.sinr_db >= 3 ? 0.02 : 0.95;
        const g = user.sinr_db >= 10 ? 0.8 : user.sinr_db >= 3 ? 0.7 : 0.2;
        const b = user.sinr_db >= 10 ? 0.6 : user.sinr_db >= 3 ? 0.9 : 0.1;

        col.push(r, g, b);
        col.push(r, g, b);

        links.push({
          start: [cx, towerHeight, cz],
          end: [ux, 0.1, uz],
          sinr: user.sinr_db,
        });
      }
    }

    return {
      linePositions: new Float32Array(pos),
      lineColors: new Float32Array(col),
      activeLinks: links,
    };
  }, [cells, users, selectedCellId]);

  // Data flow particles
  const particleCount = Math.min(activeLinks.length * 2, 200);
  const particleData = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const progress = new Float32Array(particleCount);
    const linkIndices = new Uint16Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      progress[i] = Math.random();
      linkIndices[i] = Math.floor(Math.random() * (activeLinks.length || 1));
    }

    return { positions, progress, linkIndices };
  }, [particleCount, activeLinks.length]);

  useFrame((_, delta) => {
    if (!particlesRef.current || activeLinks.length === 0) return;

    const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < particleCount; i++) {
      // Advance progress
      particleData.progress[i] += delta * 0.8;
      if (particleData.progress[i] > 1.0) {
        particleData.progress[i] = 0;
        particleData.linkIndices[i] = Math.floor(Math.random() * activeLinks.length);
      }

      const link = activeLinks[particleData.linkIndices[i]];
      if (link) {
        const t = particleData.progress[i];
        // Linear interpolation from tower to user
        positions[i * 3] = link.start[0] + (link.end[0] - link.start[0]) * t;
        positions[i * 3 + 1] = link.start[1] + (link.end[1] - link.start[1]) * t;
        positions[i * 3 + 2] = link.start[2] + (link.end[2] - link.start[2]) * t;
      }
    }

    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  if (linePositions.length === 0) return null;

  return (
    <group>
      {/* Wireless Signal Lines */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[linePositions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[lineColors, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={selectedCellId ? 0.65 : 0.22}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* Animated Data Packets Flow */}
      {particleCount > 0 && (
        <points ref={particlesRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[particleData.positions, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            size={0.12}
            color="#38bdf8"
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      )}
    </group>
  );
};
