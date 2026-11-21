import React from 'react';
import { RefereeDecision } from '../types';
import { ShieldCheck, Check, Edit3, Clock, X, CheckCircle, ArrowRight, Activity } from 'lucide-react';

interface VerdictBannerProps {
  decision: RefereeDecision | null;
  onCommit: () => void;
  isLoading: boolean;
}

export const VerdictBanner: React.FC<VerdictBannerProps> = ({
  decision,
  onCommit,
  isLoading,
}) => {
  if (!decision) {
    return (
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6 text-center text-slate-500 font-mono text-xs">
        No active decision under consideration. Trigger a scenario or evaluate controller proposals.
      </div>
    );
  }

  const getVerdictStyle = (v: string) => {
    switch (v) {
      case 'APPROVE':
        return {
          bg: 'from-emerald-950/40 to-slate-900/80 border-emerald-500/50',
          badge: 'bg-emerald-500 text-slate-950',
          text: 'text-emerald-400',
          icon: Check,
        };
      case 'MODIFY':
        return {
          bg: 'from-cyan-950/40 to-slate-900/80 border-cyan-500/50',
          badge: 'bg-cyan-500 text-slate-950',
          text: 'text-cyan-400',
          icon: Edit3,
        };
      case 'DELAY':
        return {
          bg: 'from-amber-950/40 to-slate-900/80 border-amber-500/50',
          badge: 'bg-amber-500 text-slate-950',
          text: 'text-amber-400',
          icon: Clock,
        };
      case 'REJECT':
        return {
          bg: 'from-rose-950/40 to-slate-900/80 border-rose-500/50',
          badge: 'bg-rose-500 text-slate-950',
          text: 'text-rose-400',
          icon: X,
        };
      default:
        return {
          bg: 'bg-slate-900 border-slate-800',
          badge: 'bg-slate-700 text-white',
          text: 'text-slate-300',
          icon: ShieldCheck,
        };
    }
  };

  const style = getVerdictStyle(decision.verdict);
  const VerdictIcon = style.icon;

  return (
    <div className={`rounded-xl border p-5 bg-gradient-to-r ${style.bg} shadow-lg relative backdrop-blur-md`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Verdict Badge & Title */}
        <div className="space-y-2 max-w-3xl">
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-md font-mono font-black text-sm tracking-wider flex items-center gap-1.5 shadow ${style.badge}`}>
              <VerdictIcon className="w-4 h-4 stroke-[3]" />
              VERDICT: {decision.verdict}
            </span>
            <span className="text-xs font-mono text-slate-400">
              Latency: <span className="text-cyan-400 font-bold">{decision.computation_time_ms.toFixed(1)} ms</span>
            </span>
            <span className="text-xs font-mono text-slate-400">
              Version: <span className="text-indigo-400 font-bold">v{decision.state_version}</span>
            </span>
            {decision.committed && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-950 text-emerald-400 border border-emerald-700 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> COMMITTED TO NETWORK
              </span>
            )}
          </div>

          <h2 className="text-sm font-semibold text-slate-100 font-mono tracking-tight leading-snug">
            {decision.reason}
          </h2>

          {/* Action Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs font-mono">
            <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800">
              <span className="text-slate-500 block mb-1">ORIGINAL INCOMING PROPOSAL:</span>
              {decision.original_proposals.length === 0 ? (
                <span className="text-slate-400">None</span>
              ) : (
                decision.original_proposals.map((p) => (
                  <div key={p.command_id} className="text-slate-300 font-medium">
                    [{p.controller_id}] {p.action_type} on <span className="text-cyan-400">{p.target_cell}</span> ({p.delta > 0 ? `+${p.delta}` : p.delta} dBm)
                  </div>
                ))
              )}
            </div>

            <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800">
              <span className="text-cyan-500 block mb-1">SELECTED SAFE ACTION:</span>
              {Object.keys(decision.selected_action).length === 0 ? (
                <span className="text-slate-400">Preserve Status Quo (No state changes)</span>
              ) : (
                Object.entries(decision.selected_action).map(([cid, act]: [string, any]) => (
                  <div key={cid} className="text-emerald-300 font-bold">
                    {cid} → {act.status === 'SHUTDOWN' ? 'SHUTDOWN' : `${act.tx_power_dbm} dBm`}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Predictive Traffic Advisory Card */}
          {decision.predictive_advisory && decision.predictive_advisory.ml_enabled && (
            <div className={`p-2.5 rounded border text-xs font-mono mt-1 ${
              decision.predictive_advisory.is_premature_power_cut
                ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                : 'bg-cyan-950/30 border-cyan-800/40 text-cyan-300'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <span className="font-bold flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  XGBOOST PREDICTIVE ADVISORY — CELL: {decision.predictive_advisory.cell_id}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  decision.predictive_advisory.predicted_trend === 'SURGE'
                    ? 'bg-amber-500 text-slate-950'
                    : decision.predictive_advisory.predicted_trend === 'DECLINE'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-700 text-slate-200'
                }`}>
                  TREND: {decision.predictive_advisory.predicted_trend}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed opacity-90">{decision.predictive_advisory.explanation}</p>
              <div className="flex items-center gap-3 pt-1 text-[10px] text-slate-400">
                <span>Observed Index: <b className="text-white">{decision.predictive_advisory.current_activity_index}</b></span>
                <span>Forecast (10-min): <b className="text-cyan-400">{decision.predictive_advisory.predicted_activity_index}</b></span>
                <span>Delta: <b className={decision.predictive_advisory.trend_delta >= 0 ? 'text-amber-400' : 'text-emerald-400'}>
                  {decision.predictive_advisory.trend_delta >= 0 ? `+${decision.predictive_advisory.trend_delta}` : decision.predictive_advisory.trend_delta}
                </b> activity units</span>
              </div>
            </div>
          )}

          {/* Predicted Deltas */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-mono">
            <span className="text-slate-500 text-[11px]">EXPECTED KPI IMPACT:</span>
            <span className={`px-2 py-0.5 rounded ${decision.predicted_kpi_impact.coverage_delta >= 0 ? 'bg-emerald-950/80 text-emerald-300' : 'bg-rose-950/80 text-rose-300'}`}>
              Δ Coverage: {decision.predicted_kpi_impact.coverage_delta >= 0 ? `+${decision.predicted_kpi_impact.coverage_delta}` : decision.predicted_kpi_impact.coverage_delta}%
            </span>
            <span className={`px-2 py-0.5 rounded ${decision.predicted_kpi_impact.energy_delta <= 0 ? 'bg-emerald-950/80 text-emerald-300' : 'bg-amber-950/80 text-amber-300'}`}>
              Δ Energy: {decision.predicted_kpi_impact.energy_delta >= 0 ? `+${decision.predicted_kpi_impact.energy_delta}` : decision.predicted_kpi_impact.energy_delta} units
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300">
              Δ SINR: {decision.predicted_kpi_impact.sinr_delta >= 0 ? `+${decision.predicted_kpi_impact.sinr_delta}` : decision.predicted_kpi_impact.sinr_delta} dB
            </span>
          </div>
        </div>

        {/* Commit Action Button */}
        {!decision.committed && (
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={onCommit}
              disabled={isLoading}
              className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs shadow-lg shadow-emerald-600/30 active:scale-95 transition border border-emerald-400 flex items-center gap-2 disabled:opacity-50"
            >
              <span>COMMIT VERDICT</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <span className="text-[10px] text-slate-400 font-mono">
              Validates state v{decision.state_version}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
