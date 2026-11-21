import React from 'react';
import { ConflictReport } from '../types';
import { AlertTriangle, AlertCircle, Share2 } from 'lucide-react';

interface ConflictPanelProps {
  conflicts: ConflictReport[];
}

export const ConflictPanel: React.FC<ConflictPanelProps> = ({ conflicts }) => {
  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
        <div className="flex items-center gap-2">
          <Share2 className="w-4 h-4 text-rose-400" />
          <h2 className="text-sm font-semibold text-slate-100 font-mono tracking-wide">
            CONFLICT DETECTION & IMPACT GRAPH
          </h2>
        </div>
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
          {conflicts.length} {conflicts.length === 1 ? 'Conflict' : 'Conflicts'} Active
        </span>
      </div>

      <div className="space-y-2.5 overflow-y-auto max-h-[280px] pr-1">
        {conflicts.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs font-mono flex flex-col items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-emerald-400 mb-2" />
            No active collisions or indirect cross-cell interference conflicts detected.
          </div>
        ) : (
          conflicts.map((conf) => {
            const isDirect = conf.conflict_type === 'DIRECT';
            const isCritical = conf.severity === 'CRITICAL' || conf.severity === 'HIGH';

            return (
              <div
                key={conf.conflict_id}
                className={`p-3 rounded-lg border backdrop-blur-sm transition ${
                  isDirect
                    ? 'border-rose-500/40 bg-rose-950/20'
                    : 'border-amber-500/30 bg-amber-950/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold">
                    {isCritical ? (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                    )}
                    <span className={isDirect ? 'text-rose-400' : 'text-amber-400'}>
                      {conf.conflict_type} CONFLICT
                    </span>
                    <span className="text-slate-400 font-normal">
                      on [{conf.affected_cells.join(', ')}]
                    </span>
                  </div>

                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded font-mono ${
                      isCritical
                        ? 'bg-rose-900/80 text-rose-300 border border-rose-700'
                        : 'bg-amber-900/80 text-amber-300 border border-amber-700'
                    }`}
                  >
                    {conf.severity}
                  </span>
                </div>

                <p className="text-[12px] text-slate-300 font-sans leading-relaxed mb-2">
                  {conf.explanation}
                </p>

                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-slate-400">
                  <span className="text-slate-500">Controllers:</span>
                  {conf.involved_controllers.map((ctrl) => (
                    <span key={ctrl} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      {ctrl}
                    </span>
                  ))}
                  <span className="text-slate-500 ml-2">KPIs:</span>
                  {conf.affected_kpis.map((kpi) => (
                    <span key={kpi} className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400">
                      {kpi}
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
