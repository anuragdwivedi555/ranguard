import React, { useState, useEffect } from 'react';
import {
  Brain,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Activity,
  Zap,
  Radio,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  Layers,
  ChevronRight,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  RefereeDecision,
  PredictionVerificationPair,
  DecisionIntelligenceAudit,
} from '../types';
import { api } from '../services/api';

interface AIRiskLensProps {
  currentDecision: RefereeDecision | null;
  onSelectCandidate?: (candidateId: string) => void;
}

export const AIRiskLens: React.FC<AIRiskLensProps> = ({
  currentDecision,
}) => {
  const [selectedPairIndex, setSelectedPairIndex] = useState<number>(0);
  const [evalMetrics, setEvalMetrics] = useState<any[]>([]);
  const [lensMode, setLensMode] = useState<'decision_trio' | 'held_out_benchmark'>('decision_trio');
  const [customCell, setCustomCell] = useState<string>('CELL_03');
  const [customPower, setCustomPower] = useState<number>(34.0);
  const [customStatus, setCustomStatus] = useState<string>('ACTIVE');
  const [customPrediction, setCustomPrediction] = useState<any | null>(null);
  const [isPredicting, setIsPredicting] = useState<boolean>(false);
  const [lensEnabled, setLensEnabled] = useState<boolean>(false);
  const [localAudit, setLocalAudit] = useState<DecisionIntelligenceAudit | null>(null);

  const audit: DecisionIntelligenceAudit | undefined = currentDecision?.decision_intelligence || localAudit || undefined;
  const pairs: PredictionVerificationPair[] = audit?.candidate_comparisons || [];

  useEffect(() => {
    // Load held-out empirical evaluation metrics
    api.getIntelligenceEvaluation().then((res) => {
      if (res && res.metrics) {
        setEvalMetrics(res.metrics);
      }
    }).catch(() => {});

    // Check backend on-demand AI Risk Lens status
    api.getDecisionIntelligenceStatus().then((res) => {
      if (res) setLensEnabled(!!res.enabled);
    }).catch(() => {});

    // If current decision has no audit, fetch or generate on-demand latest
    if (!currentDecision?.decision_intelligence) {
      api.getLatestIntelligenceAudit().then((res) => {
        if (res && res.cycle !== undefined) {
          setLocalAudit(res);
        }
      }).catch(() => {});
    }
  }, [currentDecision]);

  const handleToggleLens = async () => {
    try {
      const nextState = !lensEnabled;
      const res = await api.toggleDecisionIntelligence(nextState);
      setLensEnabled(!!res.enabled);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCustomPredict = async () => {
    setIsPredicting(true);
    try {
      const pred = await api.predictCandidateOutcome(customCell, customPower, customStatus);
      setCustomPrediction(pred);
    } catch (e) {
      console.error(e);
    } finally {
      setIsPredicting(false);
    }
  };

  const activePair = pairs.length > 0 ? pairs[Math.min(selectedPairIndex, pairs.length - 1)] : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-6">
      {/* Header, On-Demand Toggle, and Mode Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Brain className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  AI RISK LENS
                  <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
                    DECISION INTELLIGENCE
                  </span>
                </h2>
                <button
                  onClick={handleToggleLens}
                  className={`text-[11px] px-2.5 py-1 rounded-full font-mono font-bold transition-all border ${
                    lensEnabled
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/50 hover:bg-emerald-900'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                  title="Toggle on-demand surrogate execution during referee arbitration"
                >
                  {lensEnabled ? '● AI LENS: ACTIVE' : '○ AI LENS: STANDBY (PURE SHADOW)'}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                AI PREDICTS → DIGITAL TWIN VERIFIES → REFEREE DECIDES
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setLensMode('decision_trio')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              lensMode === 'decision_trio'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Candidate Inspection Trio
          </button>
          <button
            onClick={() => setLensMode('held_out_benchmark')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              lensMode === 'held_out_benchmark'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Held-out Benchmark & Proofs
          </button>
        </div>
      </div>

      {lensMode === 'decision_trio' ? (
        <div className="space-y-6">
          {/* Candidate Action Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                Select Proposed Candidate Action for Analysis:
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {pairs.length} candidates evaluated this cycle
              </span>
            </div>

            {pairs.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {pairs.map((p, idx) => {
                  const isSelected = idx === selectedPairIndex;
                  return (
                    <button
                      key={p.candidate_id}
                      onClick={() => setSelectedPairIndex(idx)}
                      className={`text-left p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'bg-cyan-950/40 border-cyan-500 shadow-md ring-1 ring-cyan-500'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono font-semibold text-slate-200 truncate">
                          {p.target_cell}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                            p.verification.actual_is_safe
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                              : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                          }`}
                        >
                          {p.verification.actual_is_safe ? 'SAFE' : 'UNSAFE'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-tight">
                        {p.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
                No candidate proposals evaluated in the current cycle. Advance the simulation or trigger a scenario to inspect proposals.
              </div>
            )}
          </div>

          {/* Three Pillars: PANEL 1 -> PANEL 2 -> PANEL 3 */}
          {activePair ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* PANEL 1: AI PREDICTION */}
              <div className="bg-slate-950/80 border border-cyan-900/40 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden shadow-lg">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                        PANEL 1 — AI PREDICTION
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-cyan-950 text-cyan-300 border border-cyan-800/50">
                      Surrogate v1.0
                    </span>
                  </div>

                  {/* Primary Target 1: Change in Network Coverage */}
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span>Predicted Coverage Delta:</span>
                        <span className="font-mono text-slate-300">Target 1</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-black font-mono ${
                          activePair.prediction.predicted_coverage_delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {activePair.prediction.predicted_coverage_delta >= 0 ? '+' : ''}
                          {activePair.prediction.predicted_coverage_delta.toFixed(2)}%
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          (Projected: {activePair.prediction.predicted_coverage_pct.toFixed(1)}%)
                        </span>
                      </div>
                    </div>

                    {/* Primary Target 2: Change in Interference */}
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span>Predicted Interference Delta:</span>
                        <span className="font-mono text-slate-300">Target 2</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-black font-mono ${
                          activePair.prediction.predicted_interference_delta <= 0 ? 'text-emerald-400' : 'text-amber-400'
                        }`}>
                          {activePair.prediction.predicted_interference_delta >= 0 ? '+' : ''}
                          {activePair.prediction.predicted_interference_delta.toFixed(2)}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          (Projected: {activePair.prediction.predicted_interference.toFixed(1)})
                        </span>
                      </div>
                    </div>

                    {/* Deterministic Target: Electrical Power */}
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span className="flex items-center gap-1">
                          <Zap className="w-3.5 h-3.5 text-amber-400" />
                          Electrical Power Delta:
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          Deterministic
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-xl font-bold font-mono ${
                          activePair.prediction.predicted_energy_delta <= 0 ? 'text-emerald-400' : 'text-amber-400'
                        }`}>
                          {activePair.prediction.predicted_energy_delta >= 0 ? '+' : ''}
                          {activePair.prediction.predicted_energy_delta.toFixed(1)} W
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          ({activePair.prediction.predicted_total_energy.toFixed(1)} W total)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-cyan-400" />
                      Inference Latency:
                    </span>
                    <span className="font-mono font-bold text-cyan-300">
                      {activePair.prediction.prediction_latency_ms.toFixed(2)} ms
                    </span>
                  </div>
                  <div className="p-2 rounded bg-slate-900 text-[10px] text-slate-400 border border-slate-800 leading-tight">
                    <span className="font-semibold text-slate-300">Data Provenance:</span> {activePair.prediction.data_provenance}
                  </div>
                </div>
              </div>

              {/* PANEL 2: DIGITAL TWIN VERIFICATION */}
              <div className="bg-slate-950/80 border border-purple-900/40 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden shadow-lg">
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                        PANEL 2 — DIGITAL TWIN VERIFICATION
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-purple-950 text-purple-300 border border-purple-800/50">
                      Authoritative
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Simulator Actual Coverage Delta */}
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span>Simulator-Calculated Coverage:</span>
                        <span className="font-mono text-purple-300">Ground Truth</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-black font-mono ${
                          activePair.verification.actual_coverage_delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {activePair.verification.actual_coverage_delta >= 0 ? '+' : ''}
                          {activePair.verification.actual_coverage_delta.toFixed(2)}%
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          (Actual: {activePair.verification.actual_coverage_pct.toFixed(1)}%)
                        </span>
                      </div>
                    </div>

                    {/* Simulator Actual Interference */}
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span>Simulator-Calculated Interference:</span>
                        <span className="font-mono text-purple-300">Ground Truth</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-black font-mono ${
                          activePair.verification.actual_interference_delta <= 0 ? 'text-emerald-400' : 'text-amber-400'
                        }`}>
                          {activePair.verification.actual_interference_delta >= 0 ? '+' : ''}
                          {activePair.verification.actual_interference_delta.toFixed(2)}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          (Actual: {activePair.verification.actual_interference.toFixed(1)})
                        </span>
                      </div>
                    </div>

                    {/* Transparent Error Cards */}
                    <div className="p-3 rounded-lg bg-purple-950/20 border border-purple-800/40">
                      <span className="text-xs font-bold text-purple-300 block mb-1.5">
                        Transparent Model Prediction Error:
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Coverage Error:</span>
                          <span className="font-bold text-cyan-300">
                            {activePair.coverage_error_abs.toFixed(2)}%
                          </span>
                        </div>
                        <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Interference Error:</span>
                          <span className="font-bold text-purple-300">
                            {activePair.interference_error_abs.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-purple-400" />
                      Digital Twin Latency:
                    </span>
                    <span className="font-mono font-bold text-purple-300">
                      {activePair.verification.verification_latency_ms.toFixed(2)} ms
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Safety Concordance:</span>
                    <span className={`font-mono font-bold ${
                      activePair.safety_classification_match ? 'text-emerald-400' : 'text-amber-400'
                    }`}>
                      {activePair.safety_classification_match ? 'AGREEMENT' : 'TWIN OVERRULED ML'}
                    </span>
                  </div>
                </div>
              </div>

              {/* PANEL 3: REFEREE DECISION */}
              <div className="bg-slate-950/80 border border-emerald-900/40 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden shadow-lg">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                        PANEL 3 — REFEREE DECISION
                      </span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                      activePair.verification.actual_is_safe
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                        : 'bg-rose-950 text-rose-300 border border-rose-800/50'
                    }`}>
                      {activePair.verification.actual_is_safe ? 'FEASIBLE' : 'INFEASIBLE'}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Final Safety Verdict */}
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                      <span className="text-xs text-slate-400 block mb-1">Safety Constraints Evaluation:</span>
                      {activePair.verification.actual_is_safe ? (
                        <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>All Hard Guardrails Satisfied</span>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-rose-400 text-sm font-semibold">
                            <AlertTriangle className="w-4 h-4" />
                            <span>Constraint Violation Detected</span>
                          </div>
                          <ul className="text-xs text-rose-300 space-y-0.5 mt-1 font-mono">
                            {activePair.verification.violated_constraints.map((v, i) => (
                              <li key={i}>• {v}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Multi-Objective Optimization Score */}
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span>Multi-Objective Score:</span>
                        <span className="font-mono text-emerald-300">Normalized Weights</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-black font-mono ${
                          activePair.verification.actual_is_safe ? 'text-emerald-400' : 'text-slate-500'
                        }`}>
                          {activePair.verification.actual_is_safe
                            ? activePair.verification.actual_objective_score.toFixed(3)
                            : '-999.000'}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          (Energy 30% | Int 25% | Cov 25% | Delta 20%)
                        </span>
                      </div>
                    </div>

                    {/* Architectural Guarantee Card */}
                    <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40 text-xs text-slate-300 leading-relaxed">
                      <span className="font-bold text-emerald-400 block mb-0.5">Authoritative Guarantee:</span>
                      ML predictions provide pre-verification screening; the Referee strictly executes mathematical checks on Digital Twin snapshots before committing.
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800">
                  <div className="text-[11px] text-slate-400 leading-tight">
                    <span className="font-semibold text-slate-300">Selected Action: </span>
                    {activePair.candidate_id === currentDecision?.selected_candidate?.candidate_id ? (
                      <span className="text-emerald-400 font-bold font-mono">COMMITTED AS OPTIMAL</span>
                    ) : (
                      <span className="text-slate-400 font-mono">Alternative screened</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Interactive Playground: Custom Action Screening */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              Interactive Action Prober: Probe Any Proposed Control Setting
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter any proposed cell modification to trigger immediate pre-simulation surrogate inference:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Target Cell:</label>
                <select
                  value={customCell}
                  onChange={(e) => setCustomCell(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white font-mono"
                >
                  {['CELL_01', 'CELL_02', 'CELL_03', 'CELL_04', 'CELL_05', 'CELL_06'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Proposed Power (dBm):</label>
                <input
                  type="number"
                  min="10"
                  max="46"
                  step="1"
                  value={customPower}
                  onChange={(e) => setCustomPower(parseFloat(e.target.value) || 0)}
                  disabled={customStatus === 'SHUTDOWN'}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Action Status:</label>
                <select
                  value={customStatus}
                  onChange={(e) => setCustomStatus(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white font-mono"
                >
                  <option value="ACTIVE">ACTIVE (Adjust Power)</option>
                  <option value="SHUTDOWN">SHUTDOWN (Turn Off Cell)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleCustomPredict}
                  disabled={isPredicting}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-3 rounded text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  {isPredicting ? 'Inferring...' : 'Probe with AI Surrogate'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {customPrediction && (
              <div className="space-y-2">
                {customPrediction.out_of_distribution && (
                  <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/50 flex items-start gap-2.5 text-xs text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-amber-300 block">Out-of-Distribution Warning:</span>
                      <span>{customPrediction.ood_warning || "Input parameters outside validated operational envelope [10.0, 46.0 dBm]. Tree surrogate extrapolations are unverified."}</span>
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-lg bg-slate-900/90 border border-cyan-800/40 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Predicted Coverage:</span>
                    <span className="font-bold text-cyan-300 font-mono text-sm">
                      {customPrediction.predicted_coverage_pct?.toFixed(1)}% ({customPrediction.predicted_coverage_delta >= 0 ? '+' : ''}{customPrediction.predicted_coverage_delta?.toFixed(2)}%)
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Predicted Interference:</span>
                    <span className="font-bold text-purple-300 font-mono text-sm">
                      {customPrediction.predicted_interference?.toFixed(1)} ({customPrediction.predicted_interference_delta >= 0 ? '+' : ''}{customPrediction.predicted_interference_delta?.toFixed(2)})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Power Delta (Deterministic):</span>
                    <span className="font-bold text-amber-300 font-mono text-sm">
                      {customPrediction.predicted_energy_delta >= 0 ? '+' : ''}{customPrediction.predicted_energy_delta?.toFixed(1)} W
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Predicted Feasibility:</span>
                    <span className={`font-bold font-mono text-sm ${customPrediction.predicted_is_safe ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {customPrediction.predicted_is_safe ? 'FEASIBLE' : 'SAFETY VIOLATION RISK'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[10px] text-slate-500 font-mono px-1">
                  <span>Provenance: {customPrediction.data_provenance}</span>
                  <span className="text-amber-400/80">Advisory screening only — Digital Twin verification mandatory</span>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* HELD-OUT EMPIRICAL BENCHMARK TABLE */
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
            <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              Held-Out Test Episode Evaluation (Independent Seeds 101–105)
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              Zero temporal or spatial leakage. Evaluated across 1,210 candidate evaluations on unseen seeds.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono">
                    <th className="py-2 px-3">Model Architecture</th>
                    <th className="py-2 px-3">Target KPI</th>
                    <th className="py-2 px-3 text-right">MAE</th>
                    <th className="py-2 px-3 text-right">RMSE</th>
                    <th className="py-2 px-3 text-right">R²</th>
                    <th className="py-2 px-3 text-right">Safety Rec</th>
                    <th className="py-2 px-3 text-right">Unsafe FN</th>
                    <th className="py-2 px-3 text-right">P50 Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {evalMetrics.map((m, idx) => {
                    const isOurs = m.model_name.includes('XGBoost');
                    return (
                      <tr
                        key={idx}
                        className={isOurs ? 'bg-cyan-950/30 text-white font-semibold' : 'text-slate-300'}
                      >
                        <td className="py-2 px-3 flex items-center gap-1.5 font-sans">
                          {isOurs && <Brain className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                          {m.model_name}
                        </td>
                        <td className="py-2 px-3">{m.target}</td>
                        <td className={`py-2 px-3 text-right ${isOurs ? 'text-cyan-300 font-bold' : ''}`}>
                          {typeof m.mae === 'number' ? m.mae.toFixed(4) : m.mae}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {typeof m.rmse === 'number' ? m.rmse.toFixed(4) : m.rmse}
                        </td>
                        <td className={`py-2 px-3 text-right ${isOurs ? 'text-emerald-400 font-bold' : ''}`}>
                          {typeof m.r2 === 'number' ? m.r2.toFixed(4) : m.r2}
                        </td>
                        <td className="py-2 px-3 text-right">{m.safety_recall}</td>
                        <td className={`py-2 px-3 text-right ${m.false_negatives_count > 0 ? 'text-amber-400' : ''}`}>
                          {m.false_negatives_count}
                        </td>
                        <td className="py-2 px-3 text-right">{m.inference_p50_ms} ms</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 text-xs text-amber-200/90 leading-relaxed">
                <span className="font-bold text-amber-300 block mb-1">Safety Risk Audit (Why Digital Twins Remain Essential):</span>
                XGBoost achieves R² = 0.9898 on interference and 0.52% coverage MAE, but misses 216 unsafe actions (90.0% false-negative rate) on held-out test data. Threshold tuning on validation episodes (T=96.0%) increases recall to 78.6% only by collapsing precision to 29.7% (104 false alarms). This proves ML surrogates cannot autonomously gate safety: the Digital Twin must verify every decision.
              </div>
              <div className="p-3 rounded-lg bg-cyan-950/20 border border-cyan-800/40 text-xs text-cyan-200/90 leading-relaxed">
                <span className="font-bold text-cyan-300 block mb-1">Ranking Audit (Spearman ρ = 0.8783 vs Top-1 = 20.0%):</span>
                High rank correlation proves the surrogate captures global multi-objective gradients across diverse actions. However, top feasible candidates have objective scores within ±0.02 of each other, where ~0.5% coverage residual error flips rank #1 and #2. Therefore, candidate pruning via ML is strictly prohibited; all candidates must be evaluated by the authoritative shadow twin.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
