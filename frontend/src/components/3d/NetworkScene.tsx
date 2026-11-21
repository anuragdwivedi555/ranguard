import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Cell, User } from '../../types';
import { GroundGrid3D } from './GroundGrid3D';
import { BaseStation3D } from './BaseStation3D';
import { UserDevices3D } from './UserDevices3D';
import { SignalBeams3D } from './SignalBeams3D';
import { SceneVisualEffects3D } from './SceneVisualEffects3D';
import { CameraController } from './CameraController';

interface NetworkSceneProps {
  cells: Record<string, Cell>;
  users: User[];
  sceneIndex?: number;
  selectedCellId?: string | null;
  onSelectCell?: (cellId: string) => void;
  isFreeOrbit?: boolean;
  reducedMotion?: boolean;
  contestedCellId?: string | null;
  className?: string;
}

export const NetworkScene: React.FC<NetworkSceneProps> = ({
  cells,
  users,
  sceneIndex = 1,
  selectedCellId = null,
  onSelectCell,
  isFreeOrbit = false,
  reducedMotion = false,
  contestedCellId = 'CELL_02',
  className = 'w-full h-full',
}) => {
  return (
    <div className={`relative ${className}`}>
      <Canvas
        camera={{ position: [0, 22, 24], fov: 45, near: 0.1, far: 1000 }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          alpha: false,
        }}
        onPointerMissed={() => onSelectCell?.('')}
        className="w-full h-full"
      >
        {/* Background color and atmospheric depth fog */}
        <color attach="background" args={['#040711']} />
        <fogExp2 attach="fog" args={['#040711', 0.015]} />

        {/* Cinematic Atmospheric Lighting */}
        <ambientLight intensity={0.4} color="#0e2439" />
        <directionalLight
          position={[15, 25, 10]}
          intensity={0.9}
          color="#e0f2fe"
          castShadow
        />
        <pointLight
          position={[-10, 15, -10]}
          intensity={0.5}
          color="#0284c7"
          distance={40}
        />

        <Suspense fallback={null}>
          {/* Ground Grid & Range Rings */}
          <GroundGrid3D />

          {/* 6 Cellular Base Stations */}
          {Object.values(cells).map((cell) => (
            <BaseStation3D
              key={cell.cell_id}
              cell={cell}
              isSelected={selectedCellId === cell.cell_id}
              isContested={
                (sceneIndex === 3 && cell.cell_id === 'CELL_02') ||
                contestedCellId === cell.cell_id
              }
              onSelect={onSelectCell}
            />
          ))}

          {/* 100 User Devices */}
          <UserDevices3D
            users={users}
            selectedCellId={selectedCellId}
          />

          {/* Signal Propagation Paths & Animated Data Flows */}
          <SignalBeams3D
            cells={cells}
            users={users}
            selectedCellId={selectedCellId}
          />

          {/* Narrative Visual Effects per Scene */}
          <SceneVisualEffects3D sceneIndex={sceneIndex} />

          {/* Camera Motion & Choreography Controller */}
          <CameraController
            sceneIndex={sceneIndex}
            isFreeOrbit={isFreeOrbit}
            reducedMotion={reducedMotion}
          />
        </Suspense>
      </Canvas>
    </div>
  );
};
