import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

export interface CameraWaypoint {
  position: [number, number, number];
  target: [number, number, number];
}

export const SCENE_WAYPOINTS: Record<number, CameraWaypoint> = {
  1: { position: [0, 22, 24], target: [0, 0, 0] },          // Overview
  2: { position: [0, 6, -2], target: [0, 2.5, -8] },         // Controllers at Cell 02
  3: { position: [-4.5, 3.8, -5.5], target: [0, 2.0, -8] },  // Conflict at Cell 02
  4: { position: [0, 16, -3], target: [0, 0, -8] },          // Shadow Simulation
  5: { position: [12, 10, 4], target: [0, 0, 0] },           // The Referee
  6: { position: [-14, 11, 8], target: [-2, 0, 0] },         // Predictive Intelligence
  7: { position: [0, 19, 17], target: [0, 0, 0] },          // Benchmark Results
};

interface CameraControllerProps {
  sceneIndex: number;
  isFreeOrbit?: boolean;
  reducedMotion?: boolean;
}

export const CameraController: React.FC<CameraControllerProps> = ({
  sceneIndex,
  isFreeOrbit = false,
  reducedMotion = false,
}) => {
  const { camera } = useThree();
  const currentTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const desiredTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const desiredPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 22, 24));

  const waypoint = SCENE_WAYPOINTS[sceneIndex] || SCENE_WAYPOINTS[1];

  useEffect(() => {
    desiredPosRef.current.set(...waypoint.position);
    desiredTargetRef.current.set(...waypoint.target);

    if (reducedMotion && !isFreeOrbit) {
      camera.position.set(...waypoint.position);
      currentTargetRef.current.set(...waypoint.target);
      camera.lookAt(currentTargetRef.current);
    }
  }, [sceneIndex, waypoint, reducedMotion, isFreeOrbit, camera]);

  useFrame((_, delta) => {
    if (isFreeOrbit) return;

    if (reducedMotion) {
      camera.lookAt(desiredTargetRef.current);
      return;
    }

    // Smooth lerp camera position
    const lerpFactor = Math.min(delta * 2.5, 0.1);
    camera.position.lerp(desiredPosRef.current, lerpFactor);

    // Smooth lerp target lookAt point
    currentTargetRef.current.lerp(desiredTargetRef.current, lerpFactor);
    camera.lookAt(currentTargetRef.current);
  });

  return (
    <>
      {isFreeOrbit && (
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          maxDistance={45}
          minDistance={3}
          maxPolarAngle={Math.PI / 2 - 0.05} // Do not dip below ground
        />
      )}
    </>
  );
};
