import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Cpu,
  GitFork,
  PlayCircle,
  RotateCcw,
  Star,
  Users,
  Zap,
} from 'lucide-react';
import { ControllerCommand } from '../types';
import {
  CommitOutcome,
  CONTROLLER_META,
  ConflictInfo,
  describeCommand,
  fmt,
  prettyText,
  ReviewCandidate,
  ReviewData,
  ScenarioId,
  SCENARIOS,
  tradeoffs,
  VERDICT_META,
} from './model';

/* ───────── header stepper ───────── */

export const STEPS = ['Scenario', 'Proposals', 'Shadow simulation', 'Decision', 'Result'];

export const Stepper: React.FC<{ step: number; canGo?: (i: number) => boolean; onStep?: (i: number) => void }> = ({ step, canGo, onStep }) => (
  <ol className="hidden lg:flex items-center gap-1.5">
    {STEPS.map((s, i) => {
      const done = i < step;
      const active = i === step;
      const clickable = !!canGo?.(i);
      return (
        <React.Fragment key={s}>
          <li>
            <button
              disabled={!clickable}
              onClick={() => onStep?.(i)}
              title={clickable ? `Go back to “${s}”` : undefined}
              className={`flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full text-[13px] font-medium transition-colors ${active ? 'bg-sky-400/15 text-sky-200' : done ? 'text-slate-200' : 'text-slate-400'} ${clickable ? 'hover:bg-white/[0.08] cursor-pointer' : 'cursor-default'}`}
            >
              <span
                className={`w-5 h-5 rounded-full grid place-items-center text-[12px] font-bold ${
                  done ? 'bg-emerald-400/90 text-slate-900' : active ? 'bg-sky-400 text-slate-900' : 'bg-white/[0.09] text-slate-300'
                }`}
              >
                {done ? <Check className="w-3 h-3" strokeWidth={3.5} /> : i + 1}
              </span>
              {s}
            </button>
          </li>
          {i < STEPS.length - 1 && <span className={`w-5 h-px ${done ? 'bg-emerald-400/50' : 'bg-white/15'}`} />}
        </React.Fragment>
      );
    })}
  </ol>
);

/* ───────── shared card chrome ───────── */

const StepCard: React.FC<{ step: number; title: string; blurb: string; children: React.ReactNode; right?: React.ReactNode }> = ({ step, title, blurb, children, right }) => (
  <div className="cr-panel p-4 flex flex-col gap-3 cr-fade-in">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[13px] font-semibold text-sky-300">
          Step {step + 1} of {STEPS.length}
        </div>
        <h2 className="text-[16px] font-semibold text-slate-100 leading-tight mt-0.5">{title}</h2>
        <p className="text-[13.5px] text-slate-400 leading-snug mt-1">{blurb}</p>
      </div>
      {right}
    </div>
    {children}
  </div>
);

const PrimaryButton: React.FC<{ onClick: () => void; disabled?: boolean; children: React.ReactNode; tone?: 'primary' | 'warn' }> = ({ onClick, disabled, children, tone = 'primary' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full h-11 rounded-lg font-semibold text-[14px] flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-wait ${
      tone === 'warn' ? 'bg-amber-400 hover:bg-amber-300 text-slate-900' : 'bg-sky-400 hover:bg-sky-300 text-slate-900'
    }`}
  >
    {children}
  </button>
);

/* ───────── step 1 · scenario ───────── */

const SCENARIO_ICON: Record<ScenarioId, React.ReactNode> = {
  CELL_SHUTDOWN: <Zap className="w-4 h-4" />,
  TRAFFIC_SPIKE: <Users className="w-4 h-4" />,
  PING_PONG: <RotateCcw className="w-4 h-4" />,
};

export const ScenarioStep: React.FC<{ busy: boolean; onRun: (id: ScenarioId) => void }> = ({ busy, onRun }) => (
  <StepCard step={0} title="Choose a situation to test" blurb="Each one makes the Energy, Coverage and Interference controllers ask for tower power changes. Hover a card for details.">
    <div className="space-y-2">
      {(Object.keys(SCENARIOS) as ScenarioId[]).map((id) => {
        const s = SCENARIOS[id];
        return (
          <button
            key={id}
            disabled={busy}
            onClick={() => onRun(id)}
            className="w-full text-left rounded-lg border border-white/[0.09] bg-white/[0.02] hover:bg-white/[0.05] hover:border-sky-400/50 px-3.5 py-2.5 transition-colors group disabled:opacity-60"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-white/[0.06] text-sky-300 grid place-items-center">{SCENARIO_ICON[id]}</span>
                <div>
                  <div className="text-[14px] font-semibold text-slate-100">{s.title}</div>
                  <div className="text-[13px] text-slate-500">{s.tag}</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-sky-300 transition-colors" />
            </div>
            <div className="text-[13.5px] text-slate-400 mt-1.5 leading-snug">{s.short}</div>
            <div className="max-h-0 overflow-hidden opacity-0 transition-all duration-300 group-hover:max-h-28 group-hover:opacity-100 group-focus-visible:max-h-28 group-focus-visible:opacity-100">
              <div className="text-[13px] text-slate-500 mt-1.5 leading-snug">
                {s.blurb}
                {id === 'PING_PONG' && ' Runs automatically over 6 cycles — no choice needed.'}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  </StepCard>
);

/* ───────── step 2 · proposals ───────── */

export const ProposalsStep: React.FC<{
  description: string;
  commands: ControllerCommand[];
  conflicts: ConflictInfo[];
  onNext: () => void;
  busy: boolean;
}> = ({ description, commands, conflicts, onNext, busy }) => (
  <StepCard step={1} title="Controllers send their requests" blurb="Only proposals so far — nothing is applied to the towers.">
    <div className="text-[13px] text-slate-400 line-clamp-1 hover:line-clamp-none" title={prettyText(description)}>{prettyText(description)}</div>
    <div className="space-y-2">
      {commands.map((c) => {
        const meta = CONTROLLER_META[c.controller_id];
        return (
          <div key={c.command_id} className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-1 h-8 rounded-full shrink-0" style={{ background: meta.color }} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold" style={{ color: meta.color }}>
                    {meta.label} controller
                  </div>
                  <div className="text-[13.5px] font-semibold text-slate-100">{describeCommand(c)}</div>
                </div>
              </div>
              <div className={`cr-mono text-[14px] font-bold shrink-0 ${c.delta > 0 ? 'text-sky-300' : 'text-emerald-300'}`}>
                {c.action_type === 'SHUTDOWN' ? 'OFF' : `${c.delta > 0 ? '+' : '−'}${Math.abs(c.delta).toFixed(1)} dB`}
              </div>
            </div>
            <div className="text-[13px] text-slate-400 mt-1 leading-snug line-clamp-1 hover:line-clamp-none" title={prettyText(c.reason)}>{prettyText(c.reason)}</div>
          </div>
        );
      })}
    </div>
    {conflicts.length > 0 ? (
      <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.07] px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-amber-300">
          <AlertTriangle className="w-4 h-4" /> {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} found
        </div>
        <ul className="mt-1 space-y-0.5 text-[13px] text-amber-100/85 leading-snug">
          {conflicts.slice(0, 3).map((c, i) => (
            <li key={i}>• {c.text}</li>
          ))}
        </ul>
      </div>
    ) : (
      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-[13.5px] text-slate-300">
        Only one controller is asking, but switching a tower off could still hurt users — worth testing first.
      </div>
    )}
    <PrimaryButton onClick={onNext} disabled={busy}>
      <GitFork className="w-4 h-4" /> Run shadow simulation
    </PrimaryButton>
  </StepCard>
);

/* ───────── step 3 · simulating ───────── */

export const SimulatingStep: React.FC<{ revealed: number; total: number }> = ({ revealed, total }) => (
  <StepCard step={2} title="Testing every option safely" blurb="Each option is tried on a private copy of the network. The real network is not touched.">
    <div>
      <div className="flex justify-between text-[13px] text-slate-400 mb-1.5">
        <span>Forks simulated</span>
        <span className="cr-mono text-slate-200">
          {Math.min(revealed, total)} / {total || '…'}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="cr-bar h-full rounded-full bg-sky-400" style={{ width: total ? `${(Math.min(revealed, total) / total) * 100}%` : '8%' }} />
      </div>
    </div>
    <div className="text-[13px] text-slate-400 leading-snug">Clone network → apply action → recalculate signal &amp; energy → check guardrails → score.</div>
  </StepCard>
);

/* ───────── step 4 · decision ───────── */

const Reasons: React.FC<{ reasons: string[] }> = ({ reasons }) => {
  const [all, setAll] = React.useState(false);
  const shown = all ? reasons : reasons.slice(0, 4);
  return (
    <>
      <ul className="mt-2 space-y-1">
        {shown.map((r) => (
          <li key={r} className="flex items-start gap-2 text-[13.5px] text-slate-300 leading-snug">
            <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" strokeWidth={3} />
            {r}
          </li>
        ))}
      </ul>
      {reasons.length > 4 && (
        <button onClick={() => setAll((a) => !a)} className="mt-1.5 text-[13px] font-medium text-sky-300 hover:text-sky-200">
          {all ? 'Show fewer' : `Show all ${reasons.length} reasons`}
        </button>
      )}
    </>
  );
};

export const DecisionStep: React.FC<{
  review: ReviewData;
  chosenId: string | null;
  onChoose: (id: string) => void;
  onApply: () => void;
  busy: boolean;
}> = ({ review, chosenId, onChoose, onApply, busy }) => {
  const best = review.candidates.find((c) => c.is_recommended) ?? null;
  const chosen = review.candidates.find((c) => c.candidate_id === chosenId) ?? null;
  const override = !!(best && chosen && best.candidate_id !== chosen.candidate_id);
  const trade = override && chosen && best ? tradeoffs(chosen, best) : [];
  return (
    <StepCard step={3} title="You decide what goes live" blurb="RANGUARD recommends the safest, most useful option. You can accept it or pick another safe fork.">
      {best ? (
        <div className="rounded-lg border border-sky-400/40 bg-sky-400/[0.07] px-3.5 py-3">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-sky-300">
            <Star className="w-3.5 h-3.5" fill="currentColor" /> RANGUARD recommends
          </div>
          <div className="text-[14.5px] font-semibold text-slate-100 mt-1 leading-snug">
            Fork {best.label} — {prettyText(best.description)}
          </div>
          <Reasons reasons={review.recommendation?.reasons ?? []} />
        </div>
      ) : (
        <div className="rounded-lg border border-rose-400/35 bg-rose-500/[0.07] px-3.5 py-3 text-[14px] text-rose-100">No safe option exists — RANGUARD rejects every proposal.</div>
      )}

      <div>
        <div className="text-[13px] font-medium text-slate-400 mb-1.5">Your selection</div>
        <div className="flex flex-wrap gap-1.5">
          {review.candidates.map((c) => {
            const active = c.candidate_id === chosenId;
            return (
              <button
                key={c.candidate_id}
                disabled={!c.is_safe}
                onClick={() => onChoose(c.candidate_id)}
                title={c.is_safe ? prettyText(c.description) : 'Blocked by safety guardrails'}
                className={`h-9 px-3 rounded-lg border text-[14px] font-semibold flex items-center gap-1.5 transition-colors ${
                  !c.is_safe
                    ? 'border-white/[0.06] text-slate-600 line-through cursor-not-allowed'
                    : active
                      ? 'border-sky-400 bg-sky-400 text-slate-900'
                      : 'border-white/15 text-slate-200 hover:border-sky-300'
                }`}
              >
                Fork {c.label}
                {c.is_recommended && <Star className="w-3 h-3" fill="currentColor" />}
              </button>
            );
          })}
        </div>
        {chosen && <div className="text-[13.5px] text-slate-300 mt-2 leading-snug">{prettyText(chosen.description)}</div>}
      </div>

      {override && (
        <div className="rounded-lg border border-amber-400/35 bg-amber-400/[0.07] px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-amber-300">
            <AlertTriangle className="w-4 h-4" /> You are overriding the recommendation
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {trade.map((t) => (
              <span key={t.text} className={`text-[13px] px-1.5 py-0.5 rounded border ${t.good ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10' : 'text-amber-200 border-amber-400/30 bg-amber-400/10'}`}>
                {t.text}
              </span>
            ))}
          </div>
          <div className="text-[13px] text-amber-100/70 mt-1.5">The choice is still safe — guardrails are re-checked when you apply it, and it is logged as an operator override.</div>
        </div>
      )}
      {review.stability.delayed && (
        <div className="rounded-lg border border-sky-400/30 bg-sky-400/[0.06] px-3 py-2 text-[13px] text-sky-100/90 leading-snug">
          Stability engine would normally delay this: {review.stability.message}
        </div>
      )}

      <PrimaryButton onClick={onApply} disabled={busy || !chosen} tone={override ? 'warn' : 'primary'}>
        <CheckCircle2 className="w-4 h-4" />
        {busy ? 'Applying…' : chosen ? `Apply Fork ${chosen.label} to live network` : 'Select a fork'}
      </PrimaryButton>
    </StepCard>
  );
};

/* ───────── step 5 · result ───────── */

export const ResultStep: React.FC<{
  outcome: CommitOutcome;
  applied: ReviewCandidate | undefined;
  before: { coverage_percentage: number; total_energy: number; avg_sinr_db: number };
  onAgain: () => void;
}> = ({ outcome, applied, before, onAgain }) => {
  const v = VERDICT_META[outcome.decision.verdict];
  const keptAsIs = applied?.candidate_id === 'CAND-STATUS-QUO';
  const m = outcome.metrics;
  const rows = [
    { k: 'Coverage', a: before.coverage_percentage, b: m.coverage_percentage, u: '%', up: true },
    { k: 'Energy', a: before.total_energy, b: m.total_energy, u: ' u', up: false },
    { k: 'Avg SINR', a: before.avg_sinr_db, b: m.avg_sinr_db, u: ' dB', up: true },
  ];
  return (
    <StepCard step={4} title="Applied to the live network" blurb={outcome.wasOverride ? 'You overrode the recommendation. The action was re-checked and committed.' : 'The recommended action matches your choice and is now live.'}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-2.5 py-1 rounded-md text-[13.5px] font-bold cr-mono" style={{ color: keptAsIs ? '#94a3b8' : v.color, background: keptAsIs ? 'rgba(148,163,184,0.12)' : v.bg, border: `1px solid ${keptAsIs ? '#94a3b855' : v.color + '55'}` }}>
          {keptAsIs ? 'NO CHANGE' : v.label}
        </span>
        <span className="text-[13.5px] text-slate-300">{applied ? `Fork ${applied.label} — ${prettyText(applied.description)}` : prettyText(outcome.decision.reason)}</span>
      </div>
      <div className="rounded-lg border border-white/[0.07] overflow-hidden text-[14px]">
        {rows.map((r, i) => {
          const d = r.b - r.a;
          const good = Math.abs(d) < 0.005 ? null : r.up ? d > 0 : d < 0;
          return (
            <div key={r.k} className={`grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2 items-center ${i % 2 ? 'bg-white/[0.02]' : ''}`}>
              <span className="text-slate-400">{r.k}</span>
              <span className="cr-mono text-slate-500">{fmt(r.a, 1)}</span>
              <span className="text-slate-600">→</span>
              <span className={`cr-mono font-semibold ${good === null ? 'text-slate-200' : good ? 'text-emerald-400' : 'text-rose-400'}`}>
                {fmt(r.b, 1)}
                {r.u}
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-[13px] text-slate-500">These are measured values from the live network after the change, not predictions.</div>
      <PrimaryButton onClick={onAgain}>
        <PlayCircle className="w-4 h-4" /> Try another scenario
      </PrimaryButton>
    </StepCard>
  );
};

export const IdleHint = Cpu;
