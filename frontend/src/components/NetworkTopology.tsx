import React, { useState } from 'react';
import { Cell, User } from '../types';
import { Radio, AlertOctagon, Info } from 'lucide-react';

interface NetworkTopologyProps {
  cells: Record<string, Cell>;
  users: User[];
  selectedCellId: string | null;
  onSelectCell: (cellId: string | null) => void;
}

export const NetworkTopology: React.FC<NetworkTopologyProps> = ({
  cells,
  users,
  selectedCellId,
  onSelectCell,
}) => {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const cellList = Object.values(cells);

  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 relative flex flex-col h-full">
      {/* Title & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-slate-100 font-mono tracking-wide">
            GEOGRAPHIC TOPOLOGY (2200m × 2000m)
          </h2>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" /> Active Cell
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Shutdown Cell
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Connected User
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" /> Uncovered User
          </span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative flex-1 min-h-[360px] bg-slate-950/80 rounded-lg border border-slate-800/80 overflow-hidden flex items-center justify-center">
        <svg
          viewBox="0 0 2300 2000"
          className="w-full h-full max-h-[500px] select-none"
        >
          {/* Subtle Grid Lines */}
          <defs>
            <pattern id="grid" width="200" height="200" patternUnits="userSpaceOnUse">
              <path d="M 200 0 L 0 0 0 200" fill="none" stroke="#1e293b" strokeWidth="1" strokeOpacity="0.4" />
            </pattern>
            <linearGradient id="coverageGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.03" />
            </linearGradient>
            <radialGradient id="shutdownGrad">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
            </radialGradient>
          </defs>

          <rect width="2300" height="2000" fill="url(#grid)" />

          {/* 1. Neighbor Links */}
          {cellList.map((cell) =>
            cell.neighbors.map((nid) => {
              const neighbor = cells[nid];
              if (!neighbor || cell.cell_id > nid) return null; // avoid duplicate lines
              return (
                <line
                  key={`${cell.cell_id}-${nid}`}
                  x1={cell.x}
                  y1={cell.y}
                  x2={neighbor.x}
                  y2={neighbor.y}
                  stroke="#334155"
                  strokeWidth="2.5"
                  strokeDasharray="6 6"
                  opacity="0.6"
                />
              );
            })
          )}

          {/* 2. Cell Coverage Radii */}
          {cellList.map((cell) => {
            const isShutdown = cell.status === 'SHUTDOWN' || cell.status === 'INACTIVE';
            // Coverage radius proportional to transmission power (approx 450m - 750m)
            const radius = isShutdown ? 0 : Math.max(100, (cell.tx_power_dbm / 38.0) * 520);
            return (
              <g key={`cov-${cell.cell_id}`}>
                <circle
                  cx={cell.x}
                  cy={cell.y}
                  r={radius}
                  fill="url(#coverageGrad)"
                  stroke={isShutdown ? '#ef4444' : '#06b6d4'}
                  strokeWidth="1.5"
                  strokeOpacity={isShutdown ? 0.3 : 0.4}
                  strokeDasharray={isShutdown ? '4 4' : undefined}
                />
              </g>
            );
          })}

          {/* 3. User Dots */}
          {users.map((user) => {
            const isServed = user.is_adequately_served;
            const isSelected = selectedUser?.user_id === user.user_id;
            return (
              <circle
                key={user.user_id}
                cx={user.x}
                cy={user.y}
                r={isSelected ? 10 : 5.5}
                fill={isServed ? '#34d399' : '#f87171'}
                stroke={isSelected ? '#ffffff' : '#0f172a'}
                strokeWidth={isSelected ? 3 : 1}
                className="cursor-pointer transition-all hover:scale-150"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedUser(user);
                }}
              >
                <title>
                  {`${user.user_id}\nServing: ${user.serving_cell || 'NONE'}\nRSRP: ${user.rsrp_dbm} dBm\nSINR: ${user.sinr_db} dB`}
                </title>
              </circle>
            );
          })}

          {/* 4. Cell Towers */}
          {cellList.map((cell) => {
            const isSelected = selectedCellId === cell.cell_id;
            const isShutdown = cell.status === 'SHUTDOWN' || cell.status === 'INACTIVE';

            return (
              <g
                key={cell.cell_id}
                transform={`translate(${cell.x}, ${cell.y})`}
                className="cursor-pointer group"
                onClick={() => onSelectCell(isSelected ? null : cell.cell_id)}
              >
                {/* Selection Highlight */}
                {isSelected && (
                  <circle
                    r="44"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="3"
                    className="animate-ping"
                    opacity="0.5"
                  />
                )}

                {/* Base Node Circle */}
                <circle
                  r="30"
                  fill={isShutdown ? '#450a0a' : isSelected ? '#0e7490' : '#1e293b'}
                  stroke={isShutdown ? '#ef4444' : isSelected ? '#38bdf8' : '#0ea5e9'}
                  strokeWidth={isSelected ? 3.5 : 2.5}
                  className="transition group-hover:scale-110"
                />

                {/* Center Glyph */}
                {isShutdown ? (
                  <path
                    d="M -8 -8 L 8 8 M 8 -8 L -8 8"
                    stroke="#ef4444"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                ) : (
                  <circle r="8" fill="#38bdf8" />
                )}

                {/* Label Badges */}
                <text
                  y="-42"
                  textAnchor="middle"
                  className="fill-white font-mono font-bold text-[17px]"
                  style={{ textShadow: '0 2px 4px #000' }}
                >
                  {cell.cell_id}
                </text>

                <text
                  y="48"
                  textAnchor="middle"
                  className="fill-cyan-300 font-mono font-semibold text-[14px]"
                  style={{ textShadow: '0 2px 4px #000' }}
                >
                  {isShutdown ? 'OFFLINE' : `${cell.tx_power_dbm.toFixed(1)} dBm`}
                </text>

                <text
                  y="65"
                  textAnchor="middle"
                  className="fill-slate-400 font-mono text-[13px]"
                  style={{ textShadow: '0 2px 4px #000' }}
                >
                  {`${(cell.current_load * 100).toFixed(0)}% load (${cell.connected_users_count} UEs)`}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Selected User Modal / Popover */}
        {selectedUser && (
          <div className="absolute bottom-3 left-3 bg-slate-900/95 border border-cyan-500/40 rounded-lg p-3 shadow-xl backdrop-blur-md text-xs font-mono max-w-xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 mb-2">
              <span className="font-bold text-cyan-400">{selectedUser.user_id}</span>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-slate-400 hover:text-white px-1 font-sans"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1 text-slate-300">
              <div>Serving Cell: <span className="text-white font-bold">{selectedUser.serving_cell || 'UNCOVERED'}</span></div>
              <div>RSRP: <span className={selectedUser.rsrp_dbm < -95 ? 'text-rose-400' : 'text-emerald-400'}>{selectedUser.rsrp_dbm.toFixed(1)} dBm</span></div>
              <div>SINR: <span className={selectedUser.sinr_db < 0 ? 'text-rose-400' : 'text-cyan-400'}>{selectedUser.sinr_db.toFixed(1)} dB</span></div>
              <div>Position: ({selectedUser.x.toFixed(0)}m, {selectedUser.y.toFixed(0)}m)</div>
              <div>Demand: {selectedUser.traffic_demand.toFixed(2)} Mbps</div>
            </div>
          </div>
        )}

        {/* Selected Cell Inspector */}
        {selectedCellId && cells[selectedCellId] && (
          <div className="absolute top-3 right-3 bg-slate-900/95 border border-cyan-500/40 rounded-lg p-3 shadow-xl backdrop-blur-md text-xs font-mono max-w-xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 mb-2">
              <span className="font-bold text-cyan-400">{selectedCellId} DETAILS</span>
              <button
                onClick={() => onSelectCell(null)}
                className="text-slate-400 hover:text-white px-1 font-sans"
              >
                ✕
              </button>
            </div>
            {(() => {
              const c = cells[selectedCellId];
              return (
                <div className="space-y-1 text-slate-300">
                  <div>Status: <span className={c.status === 'ACTIVE' ? 'text-emerald-400' : 'text-rose-400'}>{c.status}</span></div>
                  <div>Power: <span className="text-white font-bold">{c.tx_power_dbm.toFixed(1)} dBm</span> [{c.min_tx_power}-{c.max_tx_power}]</div>
                  <div>Connected: <span className="text-white">{c.connected_users_count} / {c.capacity} users</span> ({(c.current_load * 100).toFixed(1)}%)</div>
                  <div>Simulated Energy: <span className="text-amber-300">{c.energy_consumption.toFixed(2)} units</span></div>
                  <div>Interference Index: <span className="text-purple-300">{c.total_interference_caused.toFixed(1)}</span></div>
                  <div>Neighbors: <span className="text-slate-400">{c.neighbors.join(', ')}</span></div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};
