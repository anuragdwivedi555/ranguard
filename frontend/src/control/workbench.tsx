import React from 'react';
import { Calculator, Check, CircleDot, GitFork, Lock, ShieldAlert, Star, X } from 'lucide-react';
import {
  changeLabel,
  fmt,
  ORIGIN_LABEL,
  prettyText,
  ReviewCandidate,
  ReviewData,
  TERM_COLOR,
  tradeoffs,
} from './model';

/* ── tiny pieces ── */

const Pill: React.FC<{ tone: 'good' | 'bad' | 'info' | 'muted' | 'warn'; children: React.ReactNode }> = ({ tone, children }) => {
  const c = { good: '#4ade80', bad: '#f87171', info: '#60a5fa', muted: '#94a3b8', warn: '#f5b942' }[tone];
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-[2px] text-[11px] font-semibold" style={{ color: c, background: `${c}1a`, border: `1px solid ${c}33` }}>
      {children}
    </span>
  );
};

const Delta: React.FC<{ value: number; digits?: number; unit?: string; goodWhen: 'up' | 'down' }> = ({ value, digits = 1, unit = '', goodWhen }) => {
  if (Math.abs(value) < Math.pow(10, -digits) / 2) return <span className="text-slate-500">±0</span>;
  const good = goodWhen === 'up' ? value > 0 : value < 0;
  return (
    <span className={good ? 'text-emerald-400' : 'text-rose-400'}>
      {value > 0 ? '+' : '−'}
      {Math.abs(value).toFixed(digits)}
      {unit}
    </span>
  );
};

const ScoreBar: React.FC<{ cand: ReviewCandidate; max: number }> = ({ cand, max }) => {
  if (!cand.is_safe || cand.score === null) {
    return <div className="h-2 rounded bg-[repeating-linear-gradient(45deg,rgba(248,113,113,0.35)_0_4px,transparent_4px_8px)]" />;
  }
  const positives = cand.score_terms.filter((t) => t.contribution > 0);
  return (
    <div className="h-2 rounded bg-white/[0.05] overflow-hidden flex">
      {positives.map((t) => (
        <div key={t.key} className="cr-bar h-full" style={{ width: `${(t.contribution / max) * 100}%`, background: TERM_COLOR[t.key] }} title={`${t.label}: +${t.contribution.toFixed(3)}`} />
      ))}
    </div>
  );
};

/* ── fork row ── */

const ForkRow: React.FC<{
  cand: ReviewCandidate;
  baseline: ReviewData['baseline'];
  maxScore: number;
  chosen: boolean;
  inspected: boolean;
  applied: boolean;
  locked: boolean;
  onChoose: () => void;
  onInspect: () => void;
}> = ({ cand, maxScore, chosen, inspected, applied, locked, onChoose, onInspect }) => {
  const m = cand.predicted_metrics;
  const failed = cand.checks.filter((c) => !c.passed);
  return (
    <div
      onClick={onInspect}
      className={`cr-fade-in relative rounded-lg border px-3.5 py-3 cursor-pointer transition-colors ${
        inspected ? 'border-sky-400/60 bg-sky-400/[0.05]' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
      } ${applied ? '!border-emerald-400/60 !bg-emerald-400/[0.06]' : ''}`}
    >
      <div className="flex items-start gap-3">
        <button
          disabled={!cand.is_safe || locked}
          onClick={(e) => {
            e.stopPropagation();
            onChoose();
          }}
          aria-label={cand.is_safe ? `Select fork ${cand.label}` : 'Blocked by guardrails'}
          className={`mt-0.5 w-5 h-5 shrink-0 rounded-full border grid place-items-center transition-colors ${
            !cand.is_safe ? 'border-white/10 text-slate-600 cursor-not-allowed' : chosen ? 'border-sky-400 bg-sky-400 text-slate-900' : 'border-slate-500 hover:border-sky-300'
          }`}
        >
          {!cand.is_safe ? <Lock className="w-3 h-3" /> : chosen ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : null}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="w-5 h-5 rounded bg-white/[0.08] text-[11px] font-bold grid place-items-center text-slate-200">{cand.label}</span>
            <span className="text-[13.5px] font-semibold text-slate-100">{prettyText(cand.description)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <Pill tone="muted">{ORIGIN_LABEL[cand.origin] ?? cand.origin}</Pill>
            {cand.is_recommended && (
              <Pill tone="info">
                <Star className="w-3 h-3" fill="currentColor" /> Recommended
              </Pill>
            )}
            {cand.is_safe ? (
              <Pill tone="good">
                <Check className="w-3 h-3" /> All guardrails passed
              </Pill>
            ) : (
              <Pill tone="bad">
                <X className="w-3 h-3" /> Blocked · {failed.length} of {cand.checks.length} guardrails failed
              </Pill>
            )}
            {applied && <Pill tone="good">Applied to live network</Pill>}
          </div>

          <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11.5px]">
            {[
              { k: 'Coverage', v: `${fmt(m.coverage_percentage, 1)}%`, d: <Delta value={cand.deltas.coverage} goodWhen="up" unit=" pts" />, bad: !cand.checks.find((c) => c.key === 'coverage')?.passed },
              { k: 'Energy', v: `${fmt(m.total_energy, 1)} u`, d: <Delta value={cand.deltas.energy_pct} goodWhen="down" unit="%" />, bad: false },
              { k: 'Avg SINR', v: `${fmt(m.avg_sinr_db, 1)} dB`, d: <Delta value={cand.deltas.sinr} goodWhen="up" unit=" dB" digits={2} />, bad: false },
              { k: 'Interference', v: fmt(m.interference_level, 0), d: <Delta value={cand.deltas.interference} goodWhen="down" digits={0} />, bad: false },
            ].map((x) => (
              <div key={x.k} className={`rounded-md px-2 py-1.5 ${x.bad ? 'bg-rose-500/10 border border-rose-400/30' : 'bg-white/[0.03] border border-white/[0.05]'}`}>
                <div className="text-slate-500">{x.k}</div>
                <div className="cr-mono text-slate-100 text-[12.5px] font-semibold">{x.v}</div>
                <div className="cr-mono text-[11px]">{x.d}</div>
              </div>
            ))}
          </div>

          <div className="mt-2.5 flex items-center gap-3">
            <div className="flex-1">
              <ScoreBar cand={cand} max={maxScore} />
            </div>
            <div className="cr-mono text-[12.5px] w-[92px] text-right">
              {cand.score !== null ? (
                <>
                  <span className="text-slate-500 text-[11px]">score </span>
                  <span className="font-bold text-slate-100">{cand.score.toFixed(3)}</span>
                </>
              ) : (
                <span className="text-rose-300 text-[11.5px]">not scored</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── calculation inspector ── */

const Section: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, children, right }) => (
  <div className="mt-4 first:mt-0">
    <div className="flex items-center justify-between mb-1.5">
      <div className="text-[11.5px] font-semibold text-slate-400 uppercase tracking-wide">{title}</div>
      {right}
    </div>
    {children}
  </div>
);

export const CalculationInspector: React.FC<{ review: ReviewData; cand: ReviewCandidate | null; best: ReviewCandidate | null }> = ({ review, cand, best }) => {
  if (!cand) {
    return (
      <div className="h-full grid place-items-center text-center px-6 py-10 text-[13px] text-slate-500">
        <div>
          <Calculator className="w-6 h-6 mx-auto mb-2 text-slate-600" />
          Click any fork to see exactly how its numbers and score were calculated.
        </div>
      </div>
    );
  }
  const b = review.baseline;
  const m = cand.predicted_metrics;
  const rows = [
    { k: 'Coverage', from: b.coverage_percentage, to: m.coverage_percentage, unit: '%', d: 1, good: 'up' as const },
    { k: 'Energy', from: b.total_energy, to: m.total_energy, unit: ' u', d: 1, good: 'down' as const },
    { k: 'Average SINR', from: b.avg_sinr_db, to: m.avg_sinr_db, unit: ' dB', d: 2, good: 'up' as const },
    { k: 'Worst-user SINR', from: b.min_sinr_db, to: m.min_sinr_db, unit: ' dB', d: 2, good: 'up' as const },
    { k: 'Interference', from: b.interference_level, to: m.interference_level, unit: '', d: 1, good: 'down' as const },
    { k: 'Active cells', from: b.active_cells, to: m.active_cells, unit: '', d: 0, good: 'up' as const },
  ];
  const trade = best && best.candidate_id !== cand.candidate_id ? tradeoffs(cand, best) : [];
  const total = cand.score_terms.reduce((a, t) => a + t.contribution, 0);
  return (
    <div key={cand.candidate_id} className="cr-fade-in p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11.5px] text-slate-500">Calculation for</div>
          <div className="text-[14.5px] font-semibold text-slate-100 leading-snug">
            Fork {cand.label} — {prettyText(cand.description)}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="cr-mono text-[10.5px] text-slate-500">simulated in</div>
          <div className="cr-mono text-[12px] text-slate-300">{cand.sim_ms.toFixed(2)} ms</div>
        </div>
      </div>

      <Section title="1 · What this fork changes">
        {cand.changes.length === 0 ? (
          <div className="text-[12.5px] text-slate-300">Nothing — the live network is left exactly as it is.</div>
        ) : (
          <div className="space-y-1">
            {cand.changes.map((ch) => (
              <div key={ch.cell_id} className="cr-mono text-[12.5px] text-slate-200 rounded bg-white/[0.04] px-2.5 py-1.5">
                {changeLabel(ch)}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="2 · Recomputed network (live → fork)">
        <div className="rounded-lg border border-white/[0.07] overflow-hidden text-[12.5px]">
          {rows.map((r, i) => {
            const diff = r.to - r.from;
            const good = Math.abs(diff) < 1e-6 ? null : r.good === 'up' ? diff > 0 : diff < 0;
            return (
              <div key={r.k} className={`grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-1.5 items-center ${i % 2 ? 'bg-white/[0.02]' : ''}`}>
                <span className="text-slate-400">{r.k}</span>
                <span className="cr-mono text-slate-500">{fmt(r.from, r.d)}</span>
                <span className="text-slate-600">→</span>
                <span className={`cr-mono font-semibold w-[88px] text-right ${good === null ? 'text-slate-200' : good ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {fmt(r.to, r.d)}
                  {r.unit}
                </span>
              </div>
            );
          })}
        </div>
        <div className="text-[11px] text-slate-500 mt-1.5">
          Signal, interference and load were recalculated for all {m.connected_users} users on an isolated clone of the network.
        </div>
      </Section>

      <Section
        title="3 · Safety guardrails"
        right={cand.is_safe ? <Pill tone="good">PASS</Pill> : <Pill tone="bad">FAIL</Pill>}
      >
        <div className="rounded-lg border border-white/[0.07] overflow-hidden text-[12.5px]">
          {cand.checks.map((c, i) => (
            <div key={c.key} className={`grid grid-cols-[18px_1fr_auto_auto] gap-2.5 px-3 py-1.5 items-center ${i % 2 ? 'bg-white/[0.02]' : ''} ${c.passed ? '' : 'bg-rose-500/[0.07]'}`}>
              {c.passed ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <X className="w-3.5 h-3.5 text-rose-400" />}
              <span className="text-slate-300">{c.label}</span>
              <span className="cr-mono text-slate-500 text-[11.5px]">{c.rule}</span>
              <span className={`cr-mono font-semibold w-[84px] text-right ${c.passed ? 'text-slate-200' : 'text-rose-300'}`}>{c.value}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="4 · Objective score"
        right={cand.score !== null ? <span className="cr-mono text-[12px] text-slate-300">total {cand.score.toFixed(3)}</span> : undefined}
      >
        {!cand.is_safe ? (
          <div className="rounded-lg border border-rose-400/25 bg-rose-500/[0.06] px-3 py-2.5 text-[12.5px] text-rose-100/90 leading-relaxed">
            <div className="flex items-center gap-1.5 font-semibold text-rose-300 mb-1">
              <ShieldAlert className="w-4 h-4" /> Disqualified — never scored
            </div>
            A fork that breaks a hard guardrail cannot be chosen, however good its other numbers look.
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-white/[0.07] overflow-hidden text-[12px]">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-1.5 text-[10.5px] text-slate-500 bg-white/[0.03]">
                <span>Objective · formula</span>
                <span className="w-12 text-right">score</span>
                <span className="w-10 text-right">weight</span>
                <span className="w-14 text-right">points</span>
              </div>
              {cand.score_terms.map((t) => (
                <div key={t.key} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 items-center border-t border-white/[0.05]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-slate-200 font-medium">
                      <span className="w-2 h-2 rounded-sm" style={{ background: TERM_COLOR[t.key] }} />
                      {t.label}
                    </div>
                    <div className="cr-mono text-[10.5px] text-slate-500 mt-0.5 truncate" title={t.formula}>
                      {t.formula} = {t.raw.toFixed(3)}
                      {Math.abs(t.raw) > 1 ? ' → clipped to ±1' : ''}
                    </div>
                  </div>
                  <span className="cr-mono w-12 text-right text-slate-200">{t.score.toFixed(3)}</span>
                  <span className="cr-mono w-10 text-right text-slate-500">×{t.weight.toFixed(2)}</span>
                  <span className="cr-mono w-14 text-right font-semibold text-slate-100">{t.contribution.toFixed(3)}</span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2 border-t border-white/[0.1] bg-white/[0.03]">
                <span className="text-slate-300 font-semibold">Total score</span>
                <span className="cr-mono font-bold text-slate-100">{total.toFixed(3)}</span>
              </div>
            </div>
            {cand.advisory_penalty > 0 && (
              <div className="text-[11.5px] text-violet-300 mt-1.5">ML forecast penalty applied: −{cand.advisory_penalty.toFixed(0)}</div>
            )}
          </>
        )}
      </Section>

      {trade.length > 0 && (
        <Section title="Compared with the recommended fork">
          <div className="flex flex-wrap gap-1.5">
            {trade.map((t) => (
              <Pill key={t.text} tone={t.good ? 'good' : 'warn'}>
                {t.text}
              </Pill>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
};

/* ── workbench ── */

export const ShadowWorkbench: React.FC<{
  review: ReviewData | null;
  revealed: number;
  total: number;
  chosenId: string | null;
  inspectedId: string | null;
  appliedId: string | null;
  locked: boolean;
  onChoose: (id: string) => void;
  onInspect: (id: string) => void;
}> = ({ review, revealed, total, chosenId, inspectedId, appliedId, locked, onChoose, onInspect }) => {
  const cands = review?.candidates ?? [];
  const best = cands.find((c) => c.is_recommended) ?? null;
  const inspected = cands.find((c) => c.candidate_id === inspectedId) ?? null;
  const maxScore = Math.max(0.01, ...cands.map((c) => c.score ?? 0));
  const simulating = !review || revealed < total;
  const b = review?.baseline;

  return (
    <section className="cr-panel overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06]">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-sky-400/10 border border-sky-400/25 text-sky-300 grid place-items-center">
            <GitFork className="w-[18px] h-[18px]" />
          </div>
          <div>
            <h2 className="text-[15.5px] font-semibold text-slate-100">Shadow simulation</h2>
            <p className="text-[12.5px] text-slate-400 max-w-[640px] leading-snug mt-0.5">
              RANGUARD forks the live network into isolated copies, applies one candidate action to each, recalculates every user's signal, then checks the result against the safety limits.
              <span className="text-slate-300"> Nothing here touches the real network until you apply an action.</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone="muted">{total} forks</Pill>
          {review && !simulating && <Pill tone="muted">{review.compute_ms.toFixed(1)} ms total</Pill>}
          {review && <Pill tone="muted">live state v{review.state_version}</Pill>}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start">
        {/* fork list */}
        <div className="p-4 lg:border-r border-white/[0.06]">
          {b && (
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 mb-3 flex flex-wrap items-center gap-x-5 gap-y-1">
              <div className="flex items-center gap-2">
                <CircleDot className="w-4 h-4 text-emerald-400" />
                <span className="text-[13px] font-semibold text-slate-100">Live network (baseline)</span>
              </div>
              <div className="cr-mono text-[11.5px] text-slate-400 flex flex-wrap gap-x-4">
                <span>coverage {fmt(b.coverage_percentage, 1)}%</span>
                <span>energy {fmt(b.total_energy, 1)} u</span>
                <span>SINR {fmt(b.avg_sinr_db, 1)} dB</span>
                <span>interf. {fmt(b.interference_level, 0)}</span>
              </div>
            </div>
          )}
          <div className="relative pl-6 space-y-2.5">
            <span className="absolute left-[9px] top-0 bottom-6 w-px bg-white/15" />
            {Array.from({ length: total }).map((_, i) => {
              const c = cands[i];
              const ready = review && i < revealed && c;
              return (
                <div key={i} className="relative">
                  <span className="absolute -left-[15px] top-6 w-[15px] h-px bg-white/15" />
                  {ready ? (
                    <ForkRow
                      cand={c}
                      baseline={review!.baseline}
                      maxScore={maxScore}
                      chosen={chosenId === c.candidate_id}
                      inspected={inspectedId === c.candidate_id}
                      applied={appliedId === c.candidate_id}
                      locked={locked || simulating}
                      onChoose={() => onChoose(c.candidate_id)}
                      onInspect={() => onInspect(c.candidate_id)}
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed border-white/10 px-4 py-5 flex items-center gap-3 text-[12.5px] text-slate-500">
                      <span className="w-4 h-4 rounded-full border-2 border-sky-300 border-t-transparent cr-spin" />
                      Cloning network and simulating fork {String.fromCharCode(65 + i)}…
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {review && !simulating && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
              <span>Score = </span>
              {Object.entries(review.weights).map(([k, w]) => (
                <span key={k} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm" style={{ background: TERM_COLOR[k] }} />
                  {k === 'change' ? 'smallest change' : k} {Math.round(w * 100)}%
                </span>
              ))}
            </div>
          )}
        </div>

        {/* calculation inspector */}
        <div className="bg-white/[0.012] min-h-[320px] lg:sticky lg:top-[64px] lg:max-h-[calc(100vh-72px)] overflow-y-auto">
          {review && !simulating ? (
            <CalculationInspector review={review} cand={inspected} best={best} />
          ) : (
            <div className="h-full grid place-items-center text-[13px] text-slate-500 py-12">Waiting for simulation to finish…</div>
          )}
        </div>
      </div>
    </section>
  );
};
