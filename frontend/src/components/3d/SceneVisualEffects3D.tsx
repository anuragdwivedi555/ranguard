import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { networkTo3D } from './coords';

interface SceneVisualEffects3DProps {
  sceneIndex: number;
}

export const SceneVisualEffects3D: React.FC<SceneVisualEffects3DProps> = ({
  sceneIndex,
}) => {
  // Cell 02 is located at (1150, 500) -> 3D position [0, 0, -8]
  const [c2x, , c2z] = networkTo3D(1150, 500, 0);

  const controllersGroupRef = useRef<THREE.Group>(null);
  const conflictPulseRef = useRef<THREE.Mesh>(null);
  const waveRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    // Scene 2: Orbiting controllers
    if (controllersGroupRef.current) {
      controllersGroupRef.current.rotation.y = t * 0.4;
    }

    // Scene 3: Conflict pulse
    if (conflictPulseRef.current) {
      const s = 1 + Math.sin(t * 8) * 0.15;
      conflictPulseRef.current.scale.set(s, s, s);
    }

    // Scene 6: Predictive wave pulse
    if (waveRef.current) {
      const scale = (t * 4) % 30;
      waveRef.current.scale.set(scale, scale, 1);
      (waveRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.4 - scale / 30);
    }
  });

  return (
    <group>
      {/* SCENE 2: The Three Independent Controllers */}
      {sceneIndex === 2 && (
        <group position={[c2x, 3.2, c2z]}>
          <group ref={controllersGroupRef}>
            {/* Energy Controller Node (Green) */}
            <group position={[2.8, 0.5, 0]}>
              <mesh>
                <sphereGeometry args={[0.22, 16, 16]} />
                <meshStandardMaterial
                  color="#10b981"
                  emissive="#10b981"
                  emissiveIntensity={0.8}
                />
              </mesh>
              <Html distanceFactor={12} center className="pointer-events-none select-none">
                <div className="bg-emerald-950/90 border border-emerald-500/80 px-2 py-0.5 rounded text-[10px] font-mono text-emerald-300 whitespace-nowrap shadow-lg">
                  ENERGY CONTROLLER
                  <div className="text-[9px] text-emerald-400 font-bold">Propose: POWER_DOWN (-4 dBm)</div>
                </div>
              </Html>
            </group>

            {/* Coverage Controller Node (Cyan) */}
            <group position={[-1.4, 0.2, 2.4]}>
              <mesh>
                <sphereGeometry args={[0.22, 16, 16]} />
                <meshStandardMaterial
                  color="#06b6d4"
                  emissive="#06b6d4"
                  emissiveIntensity={0.8}
                />
              </mesh>
              <Html distanceFactor={12} center className="pointer-events-none select-none">
                <div className="bg-cyan-950/90 border border-cyan-500/80 px-2 py-0.5 rounded text-[10px] font-mono text-cyan-300 whitespace-nowrap shadow-lg">
                  COVERAGE CONTROLLER
                  <div className="text-[9px] text-cyan-400 font-bold">Propose: POWER_UP (+3 dBm)</div>
                </div>
              </Html>
            </group>

            {/* Interference Controller Node (Amber) */}
            <group position={[-1.4, -0.4, -2.4]}>
              <mesh>
                <sphereGeometry args={[0.22, 16, 16]} />
                <meshStandardMaterial
                  color="#f59e0b"
                  emissive="#f59e0b"
                  emissiveIntensity={0.8}
                />
              </mesh>
              <Html distanceFactor={12} center className="pointer-events-none select-none">
                <div className="bg-amber-950/90 border border-amber-500/80 px-2 py-0.5 rounded text-[10px] font-mono text-amber-300 whitespace-nowrap shadow-lg">
                  INTERFERENCE CONTROLLER
                  <div className="text-[9px] text-amber-400 font-bold">Propose: POWER_DOWN (-3 dBm)</div>
                </div>
              </Html>
            </group>
          </group>

          {/* Orbit guide ring */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[2.76, 2.84, 64]} />
            <meshBasicMaterial color="#0284c7" transparent opacity={0.3} />
          </mesh>
        </group>
      )}

      {/* SCENE 3: Direct Collision & Conflict Warning */}
      {sceneIndex === 3 && (
        <group position={[c2x, 0, c2z]}>
          {/* Pulsing Red Ground Conflict Ring */}
          <mesh ref={conflictPulseRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
            <ringGeometry args={[3.2, 3.6, 48]} />
            <meshBasicMaterial color="#ef4444" transparent opacity={0.8} />
          </mesh>

          {/* Converging Collision Vector Lines */}
          <group position={[0, 3.2, 0]}>
            {/* Energy Collision Vector */}
            <mesh position={[1.8, 0.4, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.04, 0.04, 3.2, 8]} />
              <meshBasicMaterial color="#10b981" />
            </mesh>

            {/* Coverage Collision Vector */}
            <mesh position={[-1.2, 0.2, 1.4]} rotation={[0.4, 0.8, Math.PI / 2]}>
              <cylinderGeometry args={[0.04, 0.04, 3.2, 8]} />
              <meshBasicMaterial color="#06b6d4" />
            </mesh>

            {/* 3D Warning Hologram */}
            <Html position={[0, 1.8, 0]} center distanceFactor={10} className="pointer-events-none select-none">
              <div className="bg-red-950/95 border-2 border-red-500 text-red-200 px-3 py-1.5 rounded-lg text-xs font-mono font-bold shadow-2xl flex flex-col items-center animate-bounce">
                <span className="text-red-400 tracking-wider">CRITICAL COLLISION: CELL_02</span>
                <span className="text-[10px] text-slate-200 font-normal mt-0.5">
                  Coverage (+3 dBm) vs Energy (-4 dBm)
                </span>
                <span className="text-[9px] bg-red-900/60 px-1.5 py-0.5 rounded text-red-300 mt-1">
                  Actuation Conflict Detected
                </span>
              </div>
            </Html>
          </group>
        </group>
      )}

      {/* SCENE 4: Shadow Simulation Digital Twin Candidates */}
      {sceneIndex === 4 && (
        <group position={[c2x, 0, c2z]}>
          {/* Candidate 1: Raw Energy Trim (High Risk of Coverage Hole) */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-3.5, 0.04, 0]}>
            <circleGeometry args={[4.2, 32]} />
            <meshBasicMaterial color="#ef4444" transparent opacity={0.15} />
          </mesh>
          <Html position={[-3.5, 1.2, 0]} center distanceFactor={14} className="pointer-events-none select-none">
            <div className="bg-slate-950/90 border border-red-500/60 text-red-300 px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap shadow-lg">
              <div className="font-bold text-red-400">Candidate 1: -4 dBm</div>
              <div>Cov: 91.2% (UNSAFE &lt; 95%)</div>
              <div className="text-[9px] text-red-400">REJECTED BY GUARDRAIL</div>
            </div>
          </Html>

          {/* Candidate 2: Raw Coverage Boost (Excess Interference) */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.5, 0.04, 0]}>
            <circleGeometry args={[7.8, 32]} />
            <meshBasicMaterial color="#f59e0b" transparent opacity={0.12} />
          </mesh>
          <Html position={[3.5, 1.2, 0]} center distanceFactor={14} className="pointer-events-none select-none">
            <div className="bg-slate-950/90 border border-amber-500/60 text-amber-300 px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap shadow-lg">
              <div className="font-bold text-amber-400">Candidate 2: +3 dBm</div>
              <div>Interference: +38% (Suboptimal)</div>
              <div className="text-[9px] text-amber-400">Score J = +0.08</div>
            </div>
          </Html>

          {/* Candidate 3: Pareto Compromise (Arbitrated Optimum) */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
            <circleGeometry args={[6.2, 48]} />
            <meshBasicMaterial color="#10b981" transparent opacity={0.25} />
          </mesh>
          <Html position={[0, 2.2, 0]} center distanceFactor={12} className="pointer-events-none select-none">
            <div className="bg-emerald-950/95 border-2 border-emerald-500 text-emerald-200 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap shadow-2xl">
              <div className="font-bold text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Candidate 3: Pareto Compromise</span>
              </div>
              <div className="text-[10px] text-slate-300 mt-0.5">
                P_tx = 36.0 dBm (-2 dBm) • Cov: 97.5% • Energy: -8.1%
              </div>
              <div className="text-[9px] text-emerald-300 font-bold mt-0.5">
                OPTIMAL SCORE J = +0.335 (SELECTED)
              </div>
            </div>
          </Html>
        </group>
      )}

      {/* SCENE 5: The Referee Safety Guardrails */}
      {sceneIndex === 5 && (
        <group position={[0, 0, 0]}>
          {/* Giant Safety Boundary Shield Ring Encompassing the Grid */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <ringGeometry args={[18.5, 19.2, 64]} />
            <meshBasicMaterial color="#10b981" transparent opacity={0.4} />
          </mesh>

          {/* Floating Safety Rules Badge */}
          <Html position={[0, 4.5, 0]} center distanceFactor={16} className="pointer-events-none select-none">
            <div className="bg-slate-950/95 border border-emerald-500/70 p-3 rounded-xl text-xs font-mono text-slate-200 shadow-2xl max-w-xs">
              <div className="font-bold text-emerald-400 flex items-center gap-1.5 border-b border-slate-800 pb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>RANGUARD SAFETY GUARDRAILS</span>
              </div>
              <div className="mt-2 space-y-1 text-[11px] text-slate-300">
                <div className="flex justify-between">
                  <span>Coverage Floor SLA:</span>
                  <span className="font-bold text-emerald-400">&ge; 95.0%</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Delta Step:</span>
                  <span className="font-bold text-cyan-300">&le; 6.0 dB/cycle</span>
                </div>
                <div className="flex justify-between">
                  <span>Min User SINR:</span>
                  <span className="font-bold text-cyan-300">&ge; -5.0 dB</span>
                </div>
                <div className="flex justify-between">
                  <span>Hardware Power Limits:</span>
                  <span className="font-bold text-slate-300">[10.0, 46.0] dBm</span>
                </div>
              </div>
            </div>
          </Html>
        </group>
      )}

      {/* SCENE 6: Predictive Intelligence & Traffic Forecasting */}
      {sceneIndex === 6 && (
        <group position={[0, 0.05, 0]}>
          {/* Dynamic ripple wave across the user terrain */}
          <mesh ref={waveRef} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.9, 1.0, 64]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.4} />
          </mesh>

          <Html position={[-6, 3.5, 2]} center distanceFactor={14} className="pointer-events-none select-none">
            <div className="bg-slate-950/95 border border-cyan-500/60 p-3 rounded-xl text-xs font-mono text-slate-200 shadow-xl max-w-xs">
              <div className="font-bold text-cyan-400 border-b border-slate-800 pb-1">
                PREDICTIVE MOBILITY & TRAFFIC MODEL
              </div>
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                Milan Telecom activity curves & Markov commuter transitions forecast traffic spikes 2 cycles ahead.
              </p>
              <div className="mt-1 text-[10px] text-cyan-300 font-semibold">
                Anticipatory micro-sleep & proactive load balancing
              </div>
            </div>
          </Html>
        </group>
      )}

      {/* SCENE 7: Benchmark Results Equilibrium */}
      {sceneIndex === 7 && (
        <group position={[0, 0, 0]}>
          <Html position={[0, 3.5, 0]} center distanceFactor={16} className="pointer-events-none select-none">
            <div className="bg-slate-950/95 border-2 border-cyan-500/80 p-4 rounded-xl text-xs font-mono text-slate-100 shadow-2xl max-w-sm">
              <div className="text-cyan-400 font-bold text-sm tracking-wide border-b border-slate-800 pb-1.5 flex items-center justify-between">
                <span>RANGUARD EXPERIMENTAL AUDIT</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                  BENCHMARK VERIFIED
                </span>
              </div>
              <div className="mt-2.5 space-y-1.5 text-[11px]">
                <div className="flex justify-between py-0.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Hard Safety Violations:</span>
                  <span className="font-bold text-emerald-400">0 (vs 3 in baseline)</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Energy Consumption:</span>
                  <span className="font-bold text-emerald-400">-18.4% reduction</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Coverage Percentage:</span>
                  <span className="font-bold text-cyan-300">98.2% maintained</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-400">Median Referee Latency:</span>
                  <span className="font-bold text-cyan-300">3.4 ms &lt;&lt; 10s cycle</span>
                </div>
              </div>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
};
