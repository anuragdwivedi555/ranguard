import React from 'react';
import { CandidateAction } from '../types';
import { Layers, CheckCircle2, XCircle, Award } from 'lucide-react';

interface ShadowSimulationProps {
  candidates: CandidateAction[];
  selectedCandidateId?: string | null;
}

export const ShadowSimulation: React.FC<ShadowSimulationProps> = ({
  candidates,
  selectedCandidateId,
}) => {
  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-slate-100 font-mono tracking-wide">
            SHADOW SIMULATION ENGINE (ISOLATED CANDIDATE EVALUATION)
          </h2>
        </div>
        <span className="text-xs font-mono text-slate-400">
          {candidates.length} Alternatives Shadow-Simulated
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto max-h-[380px] pr-1">
        {candidates.length === 0 ? (
          <div className="col-span-full p-8 text-center text-slate-500 text-xs font-mono">
            No candidates evaluated yet. Submit controller proposals or run a scenario to trigger shadow simulation.
          </div>
        ) : (
          candidates.map((cand) => {
            const isWinner = selectedCandidateId === cand.candidate_id;
            const isSafe = cand.is_safe;

            return (
              <div
                key={cand.candidate_id}
                className={`p-3.5 rounded-lg border flex flex-col justify-between transition relative ${
                  isWinner
                    ? 'border-cyan-500/80 bg-cyan-950/20 shadow-lg shadow-cyan-900/20 ring-1 ring-cyan-500/50'
                    : isSafe
                    ? 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                    : 'border-rose-900/50 bg-rose-950/10 opacity-75'
                }`}
              >
                {/* Winner Badge */}
                {isWinner && (
                  <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-cyan-500 text-slate-950 font-mono font-bold text-[10px] flex items-center gap-1 shadow">
                    <Award className="w-3 h-3" /> SELECTED WINNER
                  </div>
                )}

                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-mono text-xs font-bold text-slate-200 leading-snug">
                      {cand.description}
                    </h3>
                  </div>

                  {/* Safety Status */}
                  <div className="flex items-center gap-1.5 mb-2.5 text-xs font-mono">
                    {isSafe ? (
                      <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> HARD SAFETY PASSED
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-400 font-semibold">
                        <XCircle className="w-3.5 h-3.5" /> BLOCKED BY GUARDRAILS
                      </span>
                    )}
                  </div>

                  {/* Violations if unsafe */}
                  {!isSafe && cand.violated_constraints.length > 0 && (
                    <div className="mb-2.5 p-2 rounded bg-rose-950/40 border border-rose-900/50 text-[11px] text-rose-300 font-mono leading-tight">
                      {cand.violated_constraints.map((v, i) => (
                        <div key={i}>• {v}</div>
                      ))}
                    </div>
                  )}

                  {/* Predicted KPIs */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-900/80 rounded p-2 border border-slate-800/80 mb-2">
                    <div>
                      <span className="text-slate-400">Coverage: </span>
                      <span
                        className={
                          cand.predicted_metrics.coverage_percentage >= 95
                            ? 'text-emerald-400 font-bold'
                            : 'text-rose-400 font-bold'
                        }
                      >
                        {cand.predicted_metrics.coverage_percentage.toFixed(1)}%
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400">Energy: </span>
                      <span className="text-amber-300 font-bold">
                        {cand.predicted_metrics.total_energy.toFixed(1)} u
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400">Avg SINR: </span>
                      <span className="text-cyan-300 font-bold">
                        {cand.predicted_metrics.avg_sinr_db.toFixed(1)} dB
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400">Interf: </span>
                      <span className="text-purple-300 font-bold">
                        {cand.predicted_metrics.interference_level.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Score Footer */}
                <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-500">Objective Score:</span>
                  <span
                    className={`font-bold ${
                      isSafe ? 'text-cyan-400 text-sm' : 'text-slate-600 line-through'
                    }`}
                  >
                    {isSafe ? cand.objective_score.toFixed(3) : 'DISQUALIFIED'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
