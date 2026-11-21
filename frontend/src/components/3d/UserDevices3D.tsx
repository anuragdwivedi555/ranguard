import React, { useState } from 'react';
import { Html } from '@react-three/drei';
import { User } from '../../types';
import { networkTo3D } from './coords';

interface UserDevices3DProps {
  users: User[];
  selectedCellId?: string | null;
}

export const UserDevices3D: React.FC<UserDevices3DProps> = ({
  users,
  selectedCellId,
}) => {
  const [hoveredUser, setHoveredUser] = useState<User | null>(null);

  return (
    <group>
      {users.map((user) => {
        const [x, , z] = networkTo3D(user.x, user.y, 0.08);

        const isUncovered = user.connection_status === 'UNCOVERED';
        const isSelectedCellServing =
          selectedCellId && user.serving_cell === selectedCellId;

        // Color coding by link quality
        let userColor = '#10b981'; // Green (high SINR >= 10 dB)
        if (isUncovered || user.sinr_db < 0) {
          userColor = '#ef4444'; // Red (uncovered or negative SINR)
        } else if (user.sinr_db < 3.0) {
          userColor = '#f59e0b'; // Amber (marginal link)
        } else if (user.sinr_db < 10.0) {
          userColor = '#06b6d4'; // Cyan (standard link)
        }

        const isHovered = hoveredUser?.user_id === user.user_id;

        return (
          <group
            key={user.user_id}
            position={[x, 0.08, z]}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoveredUser(user);
            }}
            onPointerOut={() => setHoveredUser(null)}
          >
            {/* Device Puck Chassis */}
            <mesh position={[0, 0, 0]}>
              <cylinderGeometry args={[0.16, 0.16, 0.05, 12]} />
              <meshStandardMaterial
                color="#0f172a"
                roughness={0.4}
                metalness={0.8}
              />
            </mesh>

            {/* Glowing Active LED Indicator */}
            <mesh position={[0, 0.03, 0]}>
              <cylinderGeometry args={[0.11, 0.11, 0.02, 12]} />
              <meshBasicMaterial
                color={userColor}
                transparent
                opacity={isHovered ? 1.0 : isSelectedCellServing ? 0.95 : 0.75}
              />
            </mesh>

            {/* Ground Halo Ring for Edge / Highlighted Users */}
            {(isHovered || isSelectedCellServing || isUncovered) && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]}>
                <ringGeometry args={[0.2, 0.32, 16]} />
                <meshBasicMaterial
                  color={userColor}
                  transparent
                  opacity={isHovered ? 0.8 : 0.4}
                />
              </mesh>
            )}

            {/* Hover Tooltip Tool */}
            {isHovered && (
              <Html position={[0, 0.5, 0]} center distanceFactor={14} className="pointer-events-none select-none">
                <div className="bg-slate-950/95 border border-cyan-500/50 rounded-lg p-2 text-[10px] font-mono text-slate-200 shadow-xl min-w-[130px] whitespace-nowrap">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1 font-bold text-white">
                    <span>{user.user_id}</span>
                    <span className="text-[9px] px-1 rounded bg-slate-800 text-cyan-300">
                      {user.serving_cell || 'NONE'}
                    </span>
                  </div>
                  <div className="mt-1 space-y-0.5 text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-500">RSRP:</span>
                      <span className="font-semibold text-cyan-300">{user.rsrp_dbm.toFixed(1)} dBm</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">SINR:</span>
                      <span className={`font-semibold ${user.sinr_db >= 10 ? 'text-emerald-400' : user.sinr_db >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                        {user.sinr_db.toFixed(1)} dB
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Traffic:</span>
                      <span className="text-slate-300">{user.traffic_demand.toFixed(2)} Mbps</span>
                    </div>
                  </div>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
};
