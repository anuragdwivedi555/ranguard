import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Brain, Check, CheckCircle2, Cpu, Info, ShieldCheck, X } from 'lucide-react';
import { RefereeDecision, PredictionVerificationPair, DecisionIntelligenceAudit } from '../types';
import { api } from '../services/api';

interface AIRiskLensProps {
  currentDecision: RefereeDecision | null;
  /** Candidate that was actually committed (used when no full decision object is supplied). */
  selectedCandidateId?: string | null;
  onSelectCandidate?: (candidateId: string) => void;
}

const AI_COLOR = '#a78bfa';
const TWIN_COLOR = '#60a5fa';
const REF_COLOR = '#4ade80';

const prettyCell = (id: string) => (id === 'ALL' ? 'All cells' : id.replace(/CELL_0?(\d+)/, 'Cell $1'));
const prettyText = (s: string) => s.replace(/CELL_0?(\d+)/g, 'Cell $1');
const sgn = (n: number | undefined | null, d = 2) => (n === undefined || n === null || Number.isNaN(n) ? '—' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`);
const toNum = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isNaN(n) ? null : n;
};
const num = (n: unknown, d = 2) => (typeof n === 'number' && !Number.isNaN(n) ? n.toFixed(d) : n === undefined || n === null ? '—' : String(n));

const Pill: React.FC<{ tone: 'good' | 'bad' | 'warn' | 'muted' | 'accent'; children: React.ReactNode }> = ({ tone, children }) => {
  const c = { good: '#4ade80', bad: '#f87171', warn: '#f5b942', muted: '#b3aac9', accent: '#ff9a3d' }[tone];
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap" style={{ color: c, background: `${c}1a`, border: `1px solid ${c}38` }}>
      {children}
    </span>
  );
};

const Panel: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode; accent?: string; children: React.ReactNode; className?: string }> = ({ title, subtitle, right, accent, children, className = '' }) => (
  <section className={`rounded-2xl border border-white/[0.1] bg-white/[0.03] overflow-hidden ${className}`}>
    <header className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-white/[0.07]">
      <div className="flex items-start gap-3">
        {accent && <span className="mt-1.5 w-1 h-9 rounded-full shrink-0" style={{ background: accent }} />}
        <div>
          <h3 className="text-[16px] font-semibold text-slate-100 leading-tight">{title}</h3>
          {subtitle && <p className="text-[13.5px] text-slate-400 mt-0.5 leading-snug">{subtitle}</p>}
        </div>
      </div>
      {right}
    </header>
    <div className="p-5">{children}</div>
  </section>
);

/* ───────────────────────────── main component ───────────────────────────── */

export const AIRiskLens: React.FC<AIRiskLensProps> = ({ currentDecision, selectedCandidateId = null }) => {
  const [tab, setTab] = useState<'decision' | 'evidence'>('decision');
  const [selectedPairIndex, setSelectedPairIndex] = useState<number>(0);
  const [evalMetrics, setEvalMetrics] = useState<any[]>([]);
  const [evalState, setEvalState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
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
    api
      .getIntelligenceEvaluation()
      .then((res) => {
        if (res && Array.isArray(res.metrics) && res.metrics.length) {
          setEvalMetrics(res.metrics);
          setEvalState('ready');
        } else setEvalState('unavailable');
      })
      .catch(() => setEvalState('unavailable'));

    api.getDecisionIntelligenceStatus().then((res) => res && setLensEnabled(!!res.enabled)).catch(() => {});

    if (!currentDecision?.decision_intelligence) {
      api
        .getLatestIntelligenceAudit()
        .then((res) => {
          if (res && res.cycle !== undefined) setLocalAudit(res);
        })
        .catch(() => {});
    }
  }, [currentDecision]);

  const handleToggleLens = async () => {
    try {
      const res = await api.toggleDecisionIntelligence(!lensEnabled);
      setLensEnabled(!!res.enabled);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCustomPredict = async () => {
    setIsPredicting(true);
    try {
      setCustomPrediction(await api.predictCandidateOutcome(customCell, customPower, customStatus));
    } catch (e) {
      console.error(e);
    } finally {
      setIsPredicting(false);
    }
  };

  const activePair = pairs.length > 0 ? pairs[Math.min(selectedPairIndex, pairs.length - 1)] : null;
  const committedId = currentDecision?.selected_candidate?.candidate_id ?? selectedCandidateId;

  // open on the option that was actually committed, when it is part of this audit
  useEffect(() => {
    const i = pairs.findIndex((p) => p.candidate_id === committedId);
    if (i >= 0) setSelectedPairIndex(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit?.decision_id, committedId]);

  return (
    <div className="space-y-5">
      {/* ── flow + controls ── */}
      <div className="rounded-2xl border border-white/[0.1] bg-white/[0.03] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <ol className="flex flex-wrap items-stretch gap-2">
            {[
              { n: 1, t: 'AI predicts', d: 'A fast model estimates each option', c: AI_COLOR },
              { n: 2, t: 'Digital twin verifies', d: 'The simulator calculates the real result', c: TWIN_COLOR },
              { n: 3, t: 'Referee decides', d: 'Safety limits and scoring pick the action', c: REF_COLOR },
            ].map((s, i) => (
              <React.Fragment key={s.n}>
                <li className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <span className="w-7 h-7 rounded-full grid place-items-center text-[13px] font-bold text-slate-900" style={{ background: s.c }}>
                    {s.n}
                  </span>
                  <span>
                    <span className="block text-[14px] font-semibold text-slate-100 leading-tight">{s.t}</span>
                    <span className="block text-[12.5px] text-slate-400 leading-tight">{s.d}</span>
                  </span>
                </li>
                {i < 2 && <ArrowRight className="w-4 h-4 text-slate-500 self-center hidden sm:block" />}
              </React.Fragment>
            ))}
          </ol>

          <button
            onClick={handleToggleLens}
            className="cr-lift flex items-center gap-3 rounded-xl border border-white/12 bg-black/20 hover:border-orange-300/45 px-3.5 py-2.5 text-left"
            aria-pressed={lensEnabled}
            title="Toggle AI screening during referee arbitration"
          >
            <span>
              <span className="block text-[13.5px] font-semibold text-slate-100 leading-tight">AI screening</span>
              <span className="block text-[12.5px] text-slate-400 leading-tight">{lensEnabled ? 'On — audits every decision' : 'Off — digital twin only'}</span>
            </span>
            <span className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${lensEnabled ? 'bg-sky-400' : 'bg-white/20'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${lensEnabled ? 'left-[22px]' : 'left-0.5'}`} />
            </span>
          </button>
        </div>

        <div className="mt-4 inline-flex rounded-lg border border-white/15 bg-white/[0.04] p-0.5 text-[14px] font-medium">
          {([
            ['decision', 'This decision'],
            ['evidence', 'Model evidence'],
          ] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-md transition-colors ${tab === k ? 'bg-sky-400 text-slate-900 font-semibold' : 'text-slate-200 hover:bg-white/10'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'decision' ? (
        <DecisionTab
          pairs={pairs}
          audit={audit}
          activePair={activePair}
          selectedIndex={selectedPairIndex}
          onSelect={setSelectedPairIndex}
          committedId={committedId}
          prober={{ customCell, setCustomCell, customPower, setCustomPower, customStatus, setCustomStatus, customPrediction, isPredicting, run: handleCustomPredict }}
        />
      ) : (
        <EvidenceTab metrics={evalMetrics} state={evalState} />
      )}
    </div>
  );
};

/* ───────────────────────────── tab: this decision ───────────────────────────── */

const DecisionTab: React.FC<{
  pairs: PredictionVerificationPair[];
  audit?: DecisionIntelligenceAudit;
  activePair: PredictionVerificationPair | null;
  selectedIndex: number;
  onSelect: (i: number) => void;
  committedId: string | null | undefined;
  prober: any;
}> = ({ pairs, audit, activePair, selectedIndex, onSelect, committedId, prober }) => (
  <div className="space-y-5">
    <Panel
      title="Options screened this cycle"
      subtitle="Pick an option to compare the AI’s prediction with the digital twin’s measurement."
      right={audit ? <Pill tone="muted">{pairs.length} options · cycle {audit.cycle}</Pill> : undefined}
    >
      {pairs.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {pairs.map((p, idx) => {
            const active = idx === selectedIndex;
            const committed = p.candidate_id === committedId;
            return (
              <button
                key={p.candidate_id}
                onClick={() => onSelect(idx)}
                className={`cr-lift text-left rounded-xl border p-3.5 ${active ? 'border-orange-300/60 bg-orange-400/[0.08]' : 'border-white/[0.09] bg-white/[0.025] hover:border-white/25'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14.5px] font-semibold text-slate-100">{prettyCell(p.target_cell)}</span>
                  <span className="flex items-center gap-1.5">
                    {committed && <Pill tone="accent">Committed</Pill>}
                    {p.verification.actual_is_safe ? <Pill tone="good">Safe</Pill> : <Pill tone="bad">Unsafe</Pill>}
                  </span>
                </div>
                <p className="text-[13.5px] text-slate-300 leading-snug mt-1.5 line-clamp-2">{prettyText(p.description)}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center">
          <Info className="w-5 h-5 mx-auto text-slate-400 mb-2" />
          <p className="text-[14.5px] text-slate-200 font-medium">No audit available yet</p>
          <p className="text-[13.5px] text-slate-400 mt-1 max-w-[520px] mx-auto">Turn AI screening on, then run a scenario from the main page. Each option gets an AI prediction and a digital-twin check, shown here side by side.</p>
        </div>
      )}
    </Panel>

    {activePair && (
      <div className="grid lg:grid-cols-12 gap-5">
        {/* prediction vs measurement */}
        <Panel
          className="lg:col-span-7"
          accent={AI_COLOR}
          title="Prediction vs measurement"
          subtitle={`${prettyCell(activePair.target_cell)} · what the AI expected against what the digital twin calculated`}
        >
          <div className="rounded-xl border border-white/[0.08] overflow-hidden text-[14px]">
            <div className="grid grid-cols-[1.25fr_1fr_1fr_0.8fr] gap-2 px-4 py-2.5 bg-white/[0.04] text-[12.5px] font-semibold">
              <span className="text-slate-400">Metric</span>
              <span style={{ color: AI_COLOR }} className="flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" />AI</span>
              <span style={{ color: TWIN_COLOR }} className="flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5" />Twin</span>
              <span className="text-slate-400 text-right">Gap</span>
            </div>
            {[
              {
                k: 'Coverage change',
                ai: `${sgn(activePair.prediction.predicted_coverage_delta)} pts`,
                tw: `${sgn(activePair.verification.actual_coverage_delta)} pts`,
                gap: `${num(activePair.coverage_error_abs)} pts`,
                warn: activePair.coverage_error_abs >= 1,
              },
              {
                k: 'Coverage after',
                ai: `${num(activePair.prediction.predicted_coverage_pct, 1)} %`,
                tw: `${num(activePair.verification.actual_coverage_pct, 1)} %`,
                gap: `${num(Math.abs(activePair.prediction.predicted_coverage_pct - activePair.verification.actual_coverage_pct))} pts`,
              },
              {
                k: 'Interference change',
                ai: sgn(activePair.prediction.predicted_interference_delta),
                tw: sgn(activePair.verification.actual_interference_delta),
                gap: num(activePair.interference_error_abs),
              },
              {
                k: 'Interference after',
                ai: num(activePair.prediction.predicted_interference, 1),
                tw: num(activePair.verification.actual_interference, 1),
                gap: num(Math.abs(activePair.prediction.predicted_interference - activePair.verification.actual_interference)),
              },
              {
                k: 'Power change',
                ai: `${sgn(activePair.prediction.predicted_energy_delta, 1)} W`,
                tw: `${sgn(activePair.verification.actual_energy_delta, 1)} W`,
                gap: `${num(Math.abs(activePair.prediction.predicted_energy_delta - activePair.verification.actual_energy_delta), 1)} W`,
                note: 'deterministic physics model',
              },
              {
                k: 'Compute time',
                ai: `${num(activePair.prediction.prediction_latency_ms)} ms`,
                tw: `${num(activePair.verification.verification_latency_ms)} ms`,
                gap: '',
              },
            ].map((r, i) => (
              <div key={r.k} className={`grid grid-cols-[1.25fr_1fr_1fr_0.8fr] gap-2 px-4 py-2.5 items-baseline border-t border-white/[0.06] ${i % 2 ? 'bg-white/[0.015]' : ''}`}>
                <span className="text-slate-200">
                  {r.k}
                  {r.note && <span className="block text-[12px] text-slate-500">{r.note}</span>}
                </span>
                <span className="cr-mono text-slate-100">{r.ai}</span>
                <span className="cr-mono text-slate-100">{r.tw}</span>
                <span className={`cr-mono text-right ${r.warn ? 'text-amber-300 font-semibold' : 'text-slate-400'}`}>{r.gap}</span>
              </div>
            ))}
          </div>
          <p className="text-[12.5px] text-slate-500 mt-3 leading-snug">Data provenance: {activePair.prediction.data_provenance}</p>
        </Panel>

        {/* referee verdict */}
        <Panel
          className="lg:col-span-5"
          accent={REF_COLOR}
          title="Referee verdict"
          subtitle="Decided from the digital twin’s numbers, never the AI’s"
          right={activePair.verification.actual_is_safe ? <Pill tone="good">Feasible</Pill> : <Pill tone="bad">Infeasible</Pill>}
        >
          <div className="space-y-4">
            <div>
              <div className="text-[12.5px] font-semibold text-slate-400 mb-1.5">Safety guardrails</div>
              {activePair.verification.actual_is_safe ? (
                <div className="flex items-center gap-2 text-emerald-300 text-[14.5px] font-semibold">
                  <CheckCircle2 className="w-5 h-5" /> All hard limits satisfied
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 text-rose-300 text-[14.5px] font-semibold">
                    <AlertTriangle className="w-5 h-5" /> Limit violated
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {activePair.verification.violated_constraints.map((v, i) => (
                      <li key={i} className="text-[13px] text-rose-100/90 leading-snug pl-3 border-l-2 border-rose-400/50">{prettyText(v)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="border-t border-white/[0.07] pt-4">
              <div className="text-[12.5px] font-semibold text-slate-400 mb-1">Objective score</div>
              <div className="flex items-baseline gap-2">
                {activePair.verification.actual_is_safe && activePair.verification.actual_objective_score !== 0 ? (
                  <span className="text-[30px] leading-none font-extrabold cr-mono text-emerald-300">{activePair.verification.actual_objective_score.toFixed(3)}</span>
                ) : activePair.verification.actual_is_safe ? (
                  <span className="text-[15px] font-semibold text-slate-200">Scored by the referee after verification</span>
                ) : (
                  <span className="text-[15px] font-semibold text-slate-400">Not scored — disqualified</span>
                )}
              </div>
              <p className="text-[12.5px] text-slate-400 mt-1.5 leading-snug">Weights: energy 30% · interference 25% · coverage 25% · smallest change 20%. Unsafe options are disqualified before scoring.</p>
            </div>

            <div className="border-t border-white/[0.07] pt-4 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[12.5px] font-semibold text-slate-400 mb-1">AI vs twin on safety</div>
                {activePair.safety_classification_match ? (
                  <span className="flex items-center gap-1.5 text-[14px] text-emerald-300 font-semibold"><Check className="w-4 h-4" strokeWidth={3} />Agreed</span>
                ) : (
                  <span className="flex items-center gap-1.5 text-[14px] text-amber-300 font-semibold"><X className="w-4 h-4" strokeWidth={3} />Twin overruled AI</span>
                )}
              </div>
              <div>
                <div className="text-[12.5px] font-semibold text-slate-400 mb-1">Outcome</div>
                {activePair.candidate_id === committedId ? <Pill tone="accent">Committed as optimal</Pill> : <Pill tone="muted">Alternative screened</Pill>}
              </div>
            </div>

            {activePair.is_false_negative_risk && (
              <div className="rounded-lg border border-amber-400/35 bg-amber-400/[0.08] px-3 py-2 text-[13px] text-amber-100 leading-snug">
                The AI judged this option safe, but the twin found a violation. This is the case the digital twin exists to catch.
              </div>
            )}
          </div>
        </Panel>
      </div>
    )}

    <Prober p={prober} />
  </div>
);

const Prober: React.FC<{ p: any }> = ({ p }) => {
  const field = 'w-full bg-white/[0.06] border border-white/15 rounded-lg px-3 py-2 text-[14px] text-slate-100 focus:outline-none focus:border-orange-300/60 disabled:opacity-50';
  const c = p.customPrediction;
  return (
    <Panel title="Try any action" subtitle="Ask the AI model for a quick estimate of a setting you choose. It is an advisory preview only — the digital twin still has the final say.">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.2fr_auto] gap-3 items-end">
        <label className="block">
          <span className="text-[13px] font-medium text-slate-300 block mb-1">Tower</span>
          <select value={p.customCell} onChange={(e) => p.setCustomCell(e.target.value)} className={field}>
            {['CELL_01', 'CELL_02', 'CELL_03', 'CELL_04', 'CELL_05', 'CELL_06'].map((x) => (
              <option key={x} value={x} className="bg-[#1a1730]">{prettyCell(x)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-slate-300 block mb-1">Power (dBm)</span>
          <input type="number" min={10} max={46} step={1} value={p.customPower} onChange={(e) => p.setCustomPower(parseFloat(e.target.value) || 0)} disabled={p.customStatus === 'SHUTDOWN'} className={`${field} cr-mono`} />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-slate-300 block mb-1">Action</span>
          <select value={p.customStatus} onChange={(e) => p.setCustomStatus(e.target.value)} className={field}>
            <option value="ACTIVE" className="bg-[#1a1730]">Adjust power</option>
            <option value="SHUTDOWN" className="bg-[#1a1730]">Switch tower off</option>
          </select>
        </label>
        <button onClick={p.run} disabled={p.isPredicting} className="cr-lift h-[42px] px-5 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-900 font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-60">
          {p.isPredicting ? 'Predicting…' : 'Run prediction'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {c && (
        <div className="mt-4 space-y-3 cr-fade-in">
          {c.out_of_distribution && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-400/40 bg-amber-400/[0.08] px-3.5 py-2.5 text-[13.5px] text-amber-100">
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-200">Outside the validated range. </span>
                {c.ood_warning || 'Inputs fall outside 10–46 dBm, so the model’s estimate is unverified.'}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {[
              { k: 'Predicted coverage', v: `${num(c.predicted_coverage_pct, 1)} %`, s: `${sgn(c.predicted_coverage_delta)} pts` },
              { k: 'Predicted interference', v: num(c.predicted_interference, 1), s: sgn(c.predicted_interference_delta) },
              { k: 'Power change', v: `${sgn(c.predicted_energy_delta, 1)} W`, s: 'deterministic model' },
              { k: 'Predicted feasibility', v: c.predicted_is_safe ? 'Feasible' : 'Violation risk', s: c.predicted_is_safe ? 'within limits' : 'twin must verify', tone: c.predicted_is_safe ? 'text-emerald-300' : 'text-rose-300' },
            ].map((t) => (
              <div key={t.k} className="rounded-xl border border-white/[0.09] bg-white/[0.03] px-3.5 py-3">
                <div className="text-[12.5px] text-slate-400">{t.k}</div>
                <div className={`text-[19px] font-bold cr-mono mt-0.5 ${t.tone ?? 'text-slate-100'}`}>{t.v}</div>
                <div className="text-[12.5px] text-slate-500 cr-mono">{t.s}</div>
              </div>
            ))}
          </div>
          <p className="text-[12.5px] text-slate-500">Provenance: {c.data_provenance} · Advisory screening only.</p>
        </div>
      )}
    </Panel>
  );
};

/* ───────────────────────────── tab: model evidence ───────────────────────────── */

const EvidenceTab: React.FC<{ metrics: any[]; state: 'loading' | 'ready' | 'unavailable' }> = ({ metrics, state }) => {
  const ours = useMemo(() => {
    const rows = metrics.filter((m) => String(m.model_name).includes('XGBoost'));
    const cov = rows.find((m) => String(m.target).toLowerCase().includes('coverage'));
    const inter = rows.find((m) => String(m.target).toLowerCase().includes('interference'));
    const notes = String(cov?.notes ?? '');
    return {
      cov,
      inter,
      spearman: parseFloat(notes.match(/Spearman rho:\s*([\d.]+)/)?.[1] ?? ''),
      top1: parseFloat(notes.match(/Top-1 rank match:\s*([\d.]+)%/)?.[1] ?? ''),
    };
  }, [metrics]);

  if (state !== 'ready') {
    return (
      <Panel title="Model evidence" subtitle="Held-out evaluation of the AI model">
        <div className="rounded-xl border border-dashed border-white/15 px-4 py-10 text-center">
          <Info className="w-5 h-5 mx-auto text-slate-400 mb-2" />
          <p className="text-[14.5px] text-slate-200 font-medium">{state === 'loading' ? 'Loading evaluation results…' : 'Evaluation results are unavailable'}</p>
          {state === 'unavailable' && <p className="text-[13.5px] text-slate-400 mt-1">They load from the backend. Start it and reopen this window.</p>}
        </div>
      </Panel>
    );
  }

  const recall = toNum(ours.cov?.safety_recall);
  const fnRate = recall !== null ? Math.round((1 - recall) * 100) : null;
  const missed = ours.cov?.false_negatives_count;
  const stats = [
    { k: 'Interference accuracy', v: ours.inter ? `R² ${num(ours.inter.r2)}` : '—', s: ours.inter ? `average error ${num(ours.inter.mae, 1)} units` : '', tone: 'text-emerald-300' },
    { k: 'Coverage accuracy', v: ours.cov ? `±${num(ours.cov.mae)} pts` : '—', s: ours.cov ? `typical error, R² ${num(ours.cov.r2)}` : '', tone: 'text-emerald-300' },
    { k: 'Ranking agreement', v: Number.isNaN(ours.spearman) ? '—' : `ρ ${ours.spearman.toFixed(2)}`, s: Number.isNaN(ours.top1) ? '' : `but best option matched only ${ours.top1.toFixed(0)}% of the time`, tone: 'text-sky-300' },
    { k: 'Unsafe options missed', v: toNum(missed) !== null ? `${toNum(missed)}` : '—', s: fnRate !== null ? `${fnRate}% of unsafe cases went undetected` : '', tone: 'text-amber-300' },
  ];

  const bestBy = (target: string, key: 'mae' | 'r2') => {
    const rows = metrics.filter((m) => m.target === target && typeof m[key] === 'number');
    if (!rows.length) return null;
    return (key === 'mae' ? Math.min : Math.max)(...rows.map((m) => m[key] as number));
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.k} className="rounded-2xl border border-white/[0.1] bg-white/[0.03] px-4 py-3.5">
            <div className="text-[13px] font-medium text-slate-400">{s.k}</div>
            <div className={`text-[26px] leading-none font-extrabold tracking-tight mt-2 cr-mono ${s.tone}`}>{s.v}</div>
            <div className="text-[13px] text-slate-400 mt-2 leading-snug">{s.s}</div>
          </div>
        ))}
      </div>

      <Panel
        title="How the model compares"
        subtitle="Held-out test episodes on independent seeds 101–105 · 1,210 candidate evaluations · no training/test leakage"
        right={<Pill tone="muted">Simulated 3GPP TR 36.814 environment</Pill>}
      >
        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[760px] text-[14px] text-left">
            <thead>
              <tr className="text-[12.5px] text-slate-400 border-b border-white/10">
                <th className="py-2.5 px-3 font-semibold">Model</th>
                <th className="py-2.5 px-3 font-semibold">Predicts</th>
                <th className="py-2.5 px-3 font-semibold text-right">Avg error (MAE)</th>
                <th className="py-2.5 px-3 font-semibold text-right">RMSE</th>
                <th className="py-2.5 px-3 font-semibold text-right">R²</th>
                <th className="py-2.5 px-3 font-semibold text-right">Unsafe recall</th>
                <th className="py-2.5 px-3 font-semibold text-right">Missed</th>
                <th className="py-2.5 px-3 font-semibold text-right">Speed</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m, idx) => {
                const isOurs = String(m.model_name).includes('XGBoost');
                const bestMae = bestBy(m.target, 'mae');
                const bestR2 = bestBy(m.target, 'r2');
                return (
                  <tr key={idx} className={`border-b border-white/[0.06] ${isOurs ? 'bg-orange-400/[0.08]' : idx % 2 ? 'bg-white/[0.015]' : ''}`}>
                    <td className="py-2.5 px-3">
                      <span className={`font-semibold ${isOurs ? 'text-slate-50' : 'text-slate-200'}`}>{String(m.model_name).replace(' (Ours)', '')}</span>
                      {isOurs && <span className="ml-2 align-middle"><Pill tone="accent">RANGUARD model</Pill></span>}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{m.target}</td>
                    <td className={`py-2.5 px-3 text-right cr-mono ${m.mae === bestMae ? 'text-emerald-300 font-bold' : 'text-slate-200'}`}>{num(m.mae, 3)}</td>
                    <td className="py-2.5 px-3 text-right cr-mono text-slate-200">{num(m.rmse, 3)}</td>
                    <td className={`py-2.5 px-3 text-right cr-mono ${m.r2 === bestR2 ? 'text-emerald-300 font-bold' : 'text-slate-200'}`}>{num(m.r2, 3)}</td>
                    <td className="py-2.5 px-3 text-right cr-mono text-slate-200">{toNum(m.safety_recall) !== null ? `${Math.round((toNum(m.safety_recall) as number) * 100)}%` : '—'}</td>
                    <td className={`py-2.5 px-3 text-right cr-mono ${Number(m.false_negatives_count) > 0 ? 'text-amber-300' : 'text-slate-400'}`}>{m.false_negatives_count}</td>
                    <td className="py-2.5 px-3 text-right cr-mono text-slate-300">{num(m.inference_p50_ms, 3)} ms</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[12.5px] text-slate-500 mt-3">Green marks the best value per target. “Unsafe recall” is the share of genuinely unsafe options each model caught; “Missed” counts the ones it let through.</p>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-5">
        <Panel title="A fast model is not a safety gate" accent="#f5b942">
          <p className="text-[14.5px] text-slate-200 leading-relaxed">
            The model is accurate on average: it explains {ours.inter ? `${(ours.inter.r2 * 100).toFixed(0)}%` : 'most'} of the variation in interference and predicts coverage to within {ours.cov ? `${num(ours.cov.mae)} points` : 'a fraction of a point'}. But it missed{' '}
            {missed ?? 'many'} unsafe options{fnRate !== null ? ` (${fnRate}% of them)` : ''} on held-out data.
          </p>
          <p className="text-[14.5px] text-slate-300 leading-relaxed mt-3">
            Making it more cautious helps only partly. On validation episodes, a 96% coverage threshold raises recall to 78.6%, but precision falls to 29.7% and 104 safe options are wrongly rejected.
          </p>
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-emerald-400/30 bg-emerald-400/[0.07] px-3.5 py-2.5 text-[14px] text-emerald-100">
            <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
            So the AI only screens; the digital twin verifies every option before anything is applied.
          </div>
        </Panel>

        <Panel title="Ranking is close, but not decisive" accent={TWIN_COLOR}>
          <p className="text-[14.5px] text-slate-200 leading-relaxed">
            A ranking correlation of {Number.isNaN(ours.spearman) ? 'about 0.9' : `ρ = ${ours.spearman.toFixed(2)}`} shows the model understands the overall trade-offs between options. Yet it picked the same best option as the twin only {Number.isNaN(ours.top1) ? 'a minority of' : `${ours.top1.toFixed(0)}% of`} the time.
          </p>
          <p className="text-[14.5px] text-slate-300 leading-relaxed mt-3">
            The leading safe options usually score within ±0.02 of each other, and a coverage error of about half a point is enough to swap first and second place.
          </p>
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-sky-300/30 bg-sky-400/[0.07] px-3.5 py-2.5 text-[14px] text-sky-100">
            <Info className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" />
            So the AI is never used to prune the candidate list; all options go to the shadow twin.
          </div>
        </Panel>
      </div>
    </div>
  );
};
