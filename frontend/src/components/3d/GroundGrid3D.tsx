import React from 'react';

export const GroundGrid3D: React.FC = () => {
  return (
    <group position={[0, -0.01, 0]}>
      {/* Primary Grid Floor */}
      <gridHelper
        args={[60, 60, '#0284c7', '#0f172a']}
        position={[0, 0, 0]}
      />

      {/* Sub-grid with higher density */}
      <gridHelper
        args={[60, 120, '#0e7490', '#030712']}
        position={[0, -0.005, 0]}
      />

      {/* Concentric Macro Range Rings */}
      {[8, 16, 24, 30].map((radius, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
          <ringGeometry args={[radius - 0.04, radius, 64]} />
          <meshBasicMaterial
            color="#06b6d4"
            transparent
            opacity={0.12 - i * 0.02}
          />
        </mesh>
      ))}

      {/* Dark Floor Plane for Depth & Fog Occlusion */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial
          color="#040711"
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
};
