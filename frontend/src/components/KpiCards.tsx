import React from 'react';
import { Wifi, Zap, Radio, Signal, Users, Cpu, AlertTriangle } from 'lucide-react';
import { NetworkMetrics } from '../types';

interface KpiCardsProps {
  metrics: NetworkMetrics | null;
}

export const KpiCards: React.FC<KpiCardsProps> = ({ metrics }) => {
  if (!metrics) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-900/50 rounded-lg animate-pulse border border-slate-800" />
        ))}
      </div>
    );
  }

  const isCoverageSafe = metrics.coverage_percentage >= 95.0;
  const coverageColor = isCoverageSafe
    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-950/20'
    : metrics.coverage_percentage >= 90.0
    ? 'text-amber-400 border-amber-500/30 bg-amber-950/20'
    : 'text-rose-400 border-rose-500/40 bg-rose-950/30';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* Coverage */}
      <div className={`p-3.5 rounded-lg border backdrop-blur-sm ${coverageColor} transition-all`}>
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium">Network Coverage</span>
          <Wifi className="w-4 h-4" />
        </div>
        <div className="text-2xl font-bold font-mono tracking-tight">
          {metrics.coverage_percentage.toFixed(1)}%
        </div>
        <div className="text-[11px] mt-1 flex items-center gap-1 font-sans">
          {isCoverageSafe ? (
            <span className="text-emerald-400">Target ≥ 95% met</span>
          ) : (
            <span className="text-rose-400 flex items-center gap-0.5 font-medium">
              <AlertTriangle className="w-3 h-3" /> Safety Breached!
            </span>
          )}
        </div>
      </div>

      {/* Average SINR */}
      <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/60 backdrop-blur-sm">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium">Average SINR</span>
          <Signal className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="text-2xl font-bold font-mono text-cyan-300 tracking-tight">
          {metrics.avg_sinr_db.toFixed(1)} <span className="text-sm font-normal text-slate-400">dB</span>
        </div>
        <div className="text-[11px] text-slate-400 mt-1 font-mono">
          Min: <span className={metrics.min_sinr_db < 0 ? 'text-rose-400' : 'text-slate-300'}>{metrics.min_sinr_db.toFixed(1)} dB</span>
        </div>
      </div>

      {/* Total Energy */}
      <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/60 backdrop-blur-sm">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium">Energy Use</span>
          <Zap className="w-4 h-4 text-amber-400" />
        </div>
        <div className="text-2xl font-bold font-mono text-amber-300 tracking-tight">
          {metrics.total_energy.toFixed(1)} <span className="text-sm font-normal text-slate-400">units</span>
        </div>
        <div className="text-[11px] text-slate-400 mt-1">
          Simulated RF + Static
        </div>
      </div>

      {/* Interference Index */}
      <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/60 backdrop-blur-sm">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium">Interference</span>
          <Radio className="w-4 h-4 text-purple-400" />
        </div>
        <div className="text-2xl font-bold font-mono text-purple-300 tracking-tight">
          {metrics.interference_level.toFixed(1)}
        </div>
        <div className="text-[11px] text-slate-400 mt-1">
          Co-channel Radiation
        </div>
      </div>

      {/* Connected Users */}
      <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/60 backdrop-blur-sm">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium">Active Users</span>
          <Users className="w-4 h-4 text-blue-400" />
        </div>
        <div className="text-2xl font-bold font-mono text-blue-300 tracking-tight">
          {metrics.connected_users} <span className="text-sm font-normal text-slate-400">/ 100</span>
        </div>
        <div className="text-[11px] text-slate-400 mt-1">
          {metrics.uncovered_users > 0 ? (
            <span className="text-rose-400 font-medium">{metrics.uncovered_users} unserved</span>
          ) : (
            <span className="text-emerald-400">100% connected</span>
          )}
        </div>
      </div>

      {/* Active Cells */}
      <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/60 backdrop-blur-sm">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium">Active Cells</span>
          <Cpu className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="text-2xl font-bold font-mono text-slate-100 tracking-tight">
          {metrics.active_cells} <span className="text-sm font-normal text-slate-400">/ {metrics.total_cells}</span>
        </div>
        <div className="text-[11px] text-slate-400 mt-1 font-mono">
          Avg Load: {(metrics.cell_utilization * 100).toFixed(0)}%
        </div>
      </div>
    </div>
  );
};
