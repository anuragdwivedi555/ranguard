import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  BatteryCharging,
  Brain,
  CheckCircle2,
  Clock3,
  Cpu,
  GitCompare,
  Layers,
  Radio,
  RotateCcw,
  ShieldCheck,
  Signal,
  Sparkles,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import { BenchmarkComparison, CandidateAction, Cell, ControllerCommand, NetworkMetrics, RefereeDecision } from '../types';
import {
  BASELINE_ENERGY,
  cellHealth,
  CONTROLLER_META,
  ConflictInfo,
  countReversals,
  describeCommand,
  fmt,
  HEALTH_COLOR,
  PingPongCycle,
  prettyCell,
  ScenarioId,
  ScenarioRun,
  SCENARIOS,
  VERDICT_META,
} from './model';

/* ───────────── helpers ───────────── */

export function useAnimatedNumber(value: number, duration = 900) {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      const v = a + (value - a) * e;
      setDisplay(v);
      from.current = v;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

const Chip: React.FC<{ color: string; children: React.ReactNode; solid?: boolean; className?: string }> = ({ color, children, solid, className = '' }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide cr-mono ${className}`}
    style={{ color: solid ? '#0b0f19' : color, background: solid ? color : `${color}1f`, border: `1px solid ${color}40` }}
  >
    {children}
  </span>
);

export const PanelTitle: React.FC<{ icon: React.ReactNode; title: string; hint?: string; right?: React.ReactNode }> = ({ icon, title, hint, right }) => (
  <div className="flex items-start justify-between gap-3 mb-3">
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 grid place-items-center text-sky-300">{icon}</div>
      <div>
        <div className="text-[13.5px] font-semibold text-slate-100 leading-tight">{title}</div>
        {hint && <div className="text-[11.5px] text-slate-400 leading-tight mt-0.5">{hint}</div>}
      </div>
    </div>
    {right}
  </div>
);

/* ───────────── KPI strip ───────────── */

interface KpiProps {
  committed: NetworkMetrics;
  predicted: NetworkMetrics | null;
  reversals: number;
  reversalsBlocked: number;
  decisions: number;
  unsafeBlocked: number;
}

const KpiTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  digits?: number;
  unit?: string;
  sub?: React.ReactNode;
  predicted?: number | null;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
  meter?: { value: number; threshold?: number; max: number };
}> = ({ icon, label, value, digits = 1, unit, sub, predicted, tone = 'neutral', meter }) => {
  const v = useAnimatedNumber(value);
  const toneColor = tone === 'good' ? '#34d399' : tone === 'warn' ? '#fbbf24' : tone === 'bad' ? '#f87171' : '#e2e8f0';
  return (
    <div className="cr-panel px-4 py-3 relative overflow-hidden min-w-0">
      <div className="flex items-center gap-1.5 text-slate-400">
        {icon}
        <span className="cr-label truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1 mt-1.5">
        <span className="text-[26px] font-bold tracking-tight tabular-nums" style={{ color: toneColor }}>
          {v.toFixed(digits)}
        </span>
        {unit && <span className="text-xs text-slate-400 font-medium">{unit}</span>}
      </div>
      {predicted !== undefined && predicted !== null ? (
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] cr-fade-in">
          <span className="px-1.5 py-[1px] rounded bg-violet-500/15 text-violet-300 border border-violet-400/30 font-semibold text-[9.5px] tracking-wider">PREDICTED</span>
          <span className="cr-mono text-violet-200">
            {predicted.toFixed(digits)}
            {unit ? ` ${unit}` : ''}
          </span>
        </div>
      ) : (
        <div className="mt-0.5 text-[11px] text-slate-500 truncate">{sub}</div>
      )}
      {meter && (
        <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] relative overflow-hidden">
          <div className="cr-bar h-full rounded-full" style={{ width: `${Math.min(100, (meter.value / meter.max) * 100)}%`, background: toneColor }} />
          {meter.threshold !== undefined && (
            <div className="absolute top-0 bottom-0 w-[2px] bg-rose-400" style={{ left: `${(meter.threshold / meter.max) * 100}%` }} title="Safety threshold" />
          )}
        </div>
      )}
    </div>
  );
};

export const KpiStrip: React.FC<KpiProps> = ({ committed, predicted, reversals, reversalsBlocked, decisions, unsafeBlocked }) => {
  const energyPct = (committed.total_energy / BASELINE_ENERGY) * 100;
  const cov = committed.coverage_percentage;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
      <KpiTile
        icon={<Signal className="w-3.5 h-3.5" />}
        label="Coverage"
        value={cov}
        unit="%"
        tone={cov >= 95 ? 'good' : 'bad'}
        predicted={predicted?.coverage_percentage}
        meter={{ value: cov - 80, threshold: 15, max: 20 }}
        sub="min. 95% required"
      />
      <KpiTile
        icon={<BatteryCharging className="w-3.5 h-3.5" />}
        label="Energy"
        value={energyPct}
        unit="%"
        predicted={predicted ? (predicted.total_energy / BASELINE_ENERGY) * 100 : null}
        sub={`${fmt(committed.total_energy, 1)} units vs always-on`}
        tone={energyPct < 99.5 ? 'good' : 'neutral'}
      />
      <KpiTile
        icon={<Activity className="w-3.5 h-3.5" />}
        label="Avg SINR"
        value={committed.avg_sinr_db}
        unit="dB"
        predicted={predicted?.avg_sinr_db}
        sub={`worst user ${fmt(committed.min_sinr_db, 1)} dB`}
      />
      <KpiTile
        icon={<RotateCcw className="w-3.5 h-3.5" />}
        label="Reversals"
        value={reversals}
        digits={0}
        tone={reversals === 0 ? 'good' : 'warn'}
        sub={reversalsBlocked ? `${reversalsBlocked} flip-flops damped` : 'power flip-flops executed'}
      />
      <KpiTile icon={<GitCompare className="w-3.5 h-3.5" />} label="Decisions" value={decisions} digits={0} sub="arbitrations this session" />
      <KpiTile
        icon={<Radio className="w-3.5 h-3.5" />}
        label="Active cells"
        value={committed.active_cells}
        digits={0}
        unit={`/ ${committed.total_cells}`}
        sub={`${committed.connected_users - committed.uncovered_users} of ${committed.connected_users} users served`}
      />
      <KpiTile
        icon={<ShieldCheck className="w-3.5 h-3.5" />}
        label="Safety violations"
        value={committed.safety_violations.length}
        digits={0}
        tone={committed.safety_violations.length ? 'bad' : 'good'}
        sub={unsafeBlocked ? `${unsafeBlocked} unsafe actions blocked` : 'on the live network'}
      />
    </div>
  );
};

/* ───────────── Referee pipeline ───────────── */

export interface PipelineStage {
  key: string;
  title: string;
  icon: React.ReactNode;
  output: React.ReactNode;
  tone?: 'ok' | 'warn' | 'bad';
}

export const RefereePipeline: React.FC<{ stages: PipelineStage[]; current: number; running: boolean; onSkip: () => void; source?: 'live' | 'offline' }> = ({
  stages,
  current,
  running,
  onSkip,
  source,
}) => (
  <div className="cr-panel p-4">
    <PanelTitle
      icon={<ShieldCheck className="w-4 h-4" />}
      title="RANGUARD referee"
      hint="Intercept → Predict → Simulate → Validate → Arbitrate"
      right={
        running ? (
          <button onClick={onSkip} className="text-[11px] font-semibold text-slate-300 hover:text-white px-2 py-1 rounded-md bg-white/[0.05] border border-white/10">
            Skip ▸▸
          </button>
        ) : source ? (
          <Chip color={source === 'live' ? '#34d399' : '#94a3b8'}>{source === 'live' ? 'LIVE ENGINE' : 'RECORDED RUN'}</Chip>
        ) : null
      }
    />
    {stages.length === 0 ? (
      <div className="space-y-2">
        {['Commands received', 'Conflict detection', 'Shadow simulation', 'Safety validation', 'Joint optimization', 'Final verdict'].map((t, i) => (
          <div key={t} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <span className="w-6 h-6 rounded-full grid place-items-center text-[10.5px] cr-mono text-slate-500 border border-white/10">{i + 1}</span>
            <span className="text-[12.5px] text-slate-500">{t}</span>
          </div>
        ))}
      </div>
    ) : (
      <ol className="relative">
        {stages.map((s, i) => {
          const done = i < current || (!running && i <= current);
          const active = running && i === current;
          const pending = i > current;
          const color = s.tone === 'bad' ? '#f87171' : s.tone === 'warn' ? '#fbbf24' : '#34d399';
          return (
            <li key={s.key} className="relative pl-10 pb-3 last:pb-0">
              {i < stages.length - 1 && (
                <span className="absolute left-[13px] top-7 bottom-0 w-[2px] rounded" style={{ background: done ? `${color}70` : 'rgba(255,255,255,0.07)', transition: 'background 0.5s' }} />
              )}
              <span
                className={`absolute left-0 top-0.5 w-7 h-7 rounded-full grid place-items-center border transition-all duration-500 ${active ? 'scale-110' : ''}`}
                style={{
                  borderColor: pending ? 'rgba(255,255,255,0.1)' : active ? '#fbbf24' : color,
                  background: pending ? 'transparent' : active ? 'rgba(251,191,36,0.15)' : `${color}22`,
                  color: pending ? '#64748b' : active ? '#fbbf24' : color,
                }}
              >
                {active ? <span className="w-3.5 h-3.5 rounded-full border-2 border-sky-300 border-t-transparent cr-spin" /> : s.icon}
              </span>
              <div className={`transition-opacity duration-500 ${pending ? 'opacity-35' : 'opacity-100'}`}>
                <div className="text-[12.5px] font-semibold text-slate-100 flex items-center gap-2">
                  {s.title}
                  {done && <span className="text-[9.5px] font-bold tracking-wider" style={{ color }}>{s.tone === 'bad' ? 'FLAGGED' : 'DONE'}</span>}
                </div>
                {!pending && <div className={`text-[11.5px] text-slate-400 mt-0.5 leading-snug ${active ? 'cr-shimmer rounded' : 'cr-fade-in'}`}>{s.output}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    )}
  </div>
);

/* ───────────── Before / predicted / after ───────────── */

export const KpiCompare: React.FC<{ before: NetworkMetrics; predicted: NetworkMetrics | null; after: NetworkMetrics; committed: boolean }> = ({
  before,
  predicted,
  after,
  committed,
}) => {
  const rows = [
    { label: 'Coverage', unit: '%', b: before.coverage_percentage, p: predicted?.coverage_percentage, a: after.coverage_percentage, min: 85, max: 100, threshold: 95, better: 'up' },
    { label: 'Energy', unit: '%', b: (before.total_energy / BASELINE_ENERGY) * 100, p: predicted ? (predicted.total_energy / BASELINE_ENERGY) * 100 : undefined, a: (after.total_energy / BASELINE_ENERGY) * 100, min: 80, max: 105, better: 'down' },
    { label: 'Avg SINR', unit: 'dB', b: before.avg_sinr_db, p: predicted?.avg_sinr_db, a: after.avg_sinr_db, min: 15, max: 25, better: 'up' },
    { label: 'Interference', unit: '', b: before.interference_level, p: predicted?.interference_level, a: after.interference_level, min: 150, max: 320, better: 'down' },
  ] as const;
  const pct = (v: number, min: number, max: number) => Math.max(2, Math.min(100, ((v - min) / (max - min)) * 100));
  return (
    <div className="cr-panel p-4 h-full">
      <PanelTitle
        icon={<GitCompare className="w-4 h-4" />}
        title="KPI comparison"
        hint="Before · predicted by shadow sim · measured after commit"
      />
      <div className="flex items-center gap-4 text-[10.5px] text-slate-400 mb-3">
        <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-slate-500" />Before</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-violet-400" />Predicted</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-emerald-400" />After (measured)</span>
      </div>
      <div className="space-y-4">
        {rows.map((r) => {
          const delta = r.a - r.b;
          const good = r.better === 'up' ? delta >= 0 : delta <= 0;
          return (
            <div key={r.label}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[12.5px] font-semibold text-slate-200">{r.label}</span>
                <span className={`cr-mono text-[11.5px] font-bold ${committed ? (good ? 'text-emerald-300' : 'text-rose-300') : 'text-slate-500'}`}>
                  {committed ? `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} ${r.unit}` : '…'}
                </span>
              </div>
              {[
                { v: r.b, c: '#64748b', show: true },
                { v: r.p, c: '#a78bfa', show: r.p !== undefined },
                { v: r.a, c: '#34d399', show: committed },
              ].map((bar, i) => (
                <div key={i} className="flex items-center gap-2 h-[14px]">
                  <div className="flex-1 h-[7px] rounded-full bg-white/[0.04] relative overflow-hidden">
                    <div className="cr-bar h-full rounded-full" style={{ width: bar.show && bar.v !== undefined ? `${pct(bar.v, r.min, r.max)}%` : '0%', background: bar.c }} />
                    {'threshold' in r && r.threshold && (
                      <div className="absolute top-0 bottom-0 w-[2px] bg-rose-400/80" style={{ left: `${pct(r.threshold, r.min, r.max)}%` }} />
                    )}
                  </div>
                  <span className="cr-mono text-[10.5px] text-slate-400 w-14 text-right">{bar.show && bar.v !== undefined ? bar.v.toFixed(1) : '—'}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ───────────── Ping-pong timeline ───────────── */

export const PingPongTimeline: React.FC<{ cycles: PingPongCycle[]; revealed: number; reversalsSuppressed: number }> = ({ cycles, revealed, reversalsSuppressed }) => {
  const start = cycles[0]?.command.current_value ?? 38;
  // unrefereed: every command is executed exactly as submitted
  const raw: number[] = [start];
  cycles.forEach((c) => raw.push(raw[raw.length - 1] + c.command.delta));
  const ref: number[] = [start, ...cycles.map((c) => c.resulting_power)];
  const rawRev = countReversals(raw);
  const refRev = countReversals(ref);
  const W = 560;
  const H = 200;
  const pad = { l: 40, r: 34, t: 16, b: 30 };
  const all = [...raw, ...ref];
  const lo = Math.floor(Math.min(...all) - 1);
  const hi = Math.ceil(Math.max(...all) + 1);
  const x = (i: number) => pad.l + (i / cycles.length) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const shown = Math.min(cycles.length, revealed + 1);
  const path = (arr: number[]) =>
    arr
      .slice(0, shown + 1)
      .map((v, i) => (i === 0 ? `M${x(i)},${y(v)}` : `H${x(i)}V${y(v)}`))
      .join('');

  return (
    <div className="cr-panel p-4 h-full">
      <PanelTitle
        icon={<RotateCcw className="w-4 h-4" />}
        title="Cell 3 power over time"
        hint="Same commands, with and without the referee"
        right={
          <div className="flex gap-2">
            <Chip color="#f87171">No referee: {rawRev} reversals</Chip>
            <Chip color="#34d399">RANGUARD: {refRev}</Chip>
          </div>
        }
      />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
          .filter((v) => v % 2 === 0)
          .map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="rgba(148,163,184,0.10)" />
              <text x={pad.l - 8} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#64748b" fontFamily="JetBrains Mono">
                {v}
              </text>
            </g>
          ))}
        <text x={pad.l - 30} y={pad.t - 4} fontSize="9.5" fill="#64748b">dBm</text>
        <path d={path(raw)} fill="none" stroke="#f87171" strokeWidth="2" strokeDasharray="5 4" style={{ transition: 'd 0.5s' }} />
        <path d={path(ref)} fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" />
        {cycles.slice(0, shown).map((c, i) => {
          const m = VERDICT_META[c.verdict];
          return (
            <g key={c.cycle} className="cr-fade-in">
              <circle cx={x(i + 1)} cy={y(ref[i + 1])} r="4" fill="#34d399" />
              <rect x={x(i + 1) - 26} y={H - 24} width="52" height="16" rx="4" fill={m.bg} stroke={`${m.color}66`} />
              <text x={x(i + 1)} y={H - 13} textAnchor="middle" fontSize="9" fontWeight="700" fill={m.color} fontFamily="JetBrains Mono">
                {c.verdict}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5">
          <div className="cr-label">Cycles</div>
          <div className="text-lg font-bold text-slate-100">{cycles.length}</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5">
          <div className="cr-label">Delayed</div>
          <div className="text-lg font-bold text-sky-300">{cycles[cycles.length - 1]?.delayed_count ?? 0}</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5">
          <div className="cr-label">Flip-flops damped</div>
          <div className="text-lg font-bold text-emerald-300">{reversalsSuppressed}</div>
        </div>
      </div>
    </div>
  );
};

export const PingPongLog: React.FC<{ cycles: PingPongCycle[]; revealed: number }> = ({ cycles, revealed }) => (
  <div className="cr-panel p-4 h-full">
    <PanelTitle icon={<Clock3 className="w-4 h-4" />} title="Cycle-by-cycle decisions" hint="Cooldown (3 cycles) + 1 dB hysteresis" />
    <div className="space-y-2">
      {cycles.slice(0, revealed + 1).map((c) => {
        const m = VERDICT_META[c.verdict];
        const meta = CONTROLLER_META[c.command.controller_id];
        return (
          <div key={c.cycle} className="cr-fade-in flex gap-3 rounded-xl px-3 py-2 border border-white/[0.06] bg-white/[0.015]">
            <div className="text-[10.5px] cr-mono text-slate-500 pt-0.5 w-6">C{c.cycle}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-semibold" style={{ color: meta.color }}>
                  {meta.label}: {describeCommand(c.command)}
                </span>
                <Chip color={m.color}>{c.verdict}</Chip>
              </div>
              <div className="text-[11px] text-slate-400 leading-snug mt-0.5 line-clamp-2">{c.reason}</div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

/* ───────────── Policy benchmark ───────────── */

export const PolicyBenchmark: React.FC<{ data: BenchmarkComparison | null; live: boolean }> = ({ data, live }) => {
  if (!data) return null;
  const cols = [
    { key: 'no_referee', label: 'No referee', sub: 'execute everything', color: '#f87171' },
    { key: 'fixed_priority', label: 'Fixed priority', sub: 'Coverage > Interf. > Energy', color: '#fbbf24' },
    { key: 'ranguard', label: 'RANGUARD', sub: 'shadow sim + guardrails', color: '#34d399' },
  ] as const;
  const rows = [
    { label: 'Coverage', f: (p: any) => p.coverage_pct, unit: '%', best: 'max', d: 1 },
    { label: 'Energy', f: (p: any) => p.total_energy, unit: 'u', best: 'min', d: 1 },
    { label: 'Interference', f: (p: any) => p.interference, unit: '', best: 'min', d: 0 },
    { label: 'Avg SINR', f: (p: any) => p.avg_sinr_db, unit: 'dB', best: 'max', d: 1 },
    { label: 'Reversals', f: (p: any) => p.control_reversals, unit: '', best: 'min', d: 0 },
    { label: 'Safety violations', f: (p: any) => p.safety_violations, unit: '', best: 'min', d: 0 },
    { label: 'Decision time', f: (p: any) => p.median_latency_ms, unit: 'ms', best: 'none', d: 2 },
  ] as const;
  return (
    <div className="cr-panel p-4">
      <PanelTitle
        icon={<Sparkles className="w-4 h-4" />}
        title="Why a referee? — policy comparison"
        hint={`Same seed (${data.seed}), same commands, ${data.cycles_evaluated} cycles`}
        right={<Chip color={live ? '#34d399' : '#94a3b8'}>{live ? 'MEASURED LIVE' : 'RECORDED'}</Chip>}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[520px]">
          <thead>
            <tr>
              <th className="text-left font-medium text-slate-500 pb-2" />
              {cols.map((c) => (
                <th key={c.key} className="text-left pb-2 px-2">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-100">
                    <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                    {c.label}
                  </div>
                  <div className="text-[10.5px] font-normal text-slate-500">{c.sub}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const vals = cols.map((c) => r.f((data.policies as any)[c.key]));
              const bestVal = r.best === 'max' ? Math.max(...vals) : r.best === 'min' ? Math.min(...vals) : null;
              return (
                <tr key={r.label} className="border-t border-white/[0.05]">
                  <td className="py-2 text-slate-400">{r.label}</td>
                  {vals.map((v, i) => {
                    const isBest = bestVal !== null && v === bestVal && vals.filter((x) => x === bestVal).length < 3;
                    return (
                      <td key={i} className="py-2 px-2">
                        <span className={`cr-mono ${isBest ? 'text-emerald-300 font-bold' : 'text-slate-200'}`}>
                          {Number(v).toFixed(r.d)}
                          {r.unit && <span className="text-slate-500 font-normal"> {r.unit}</span>}
                        </span>
                        {isBest && <span className="ml-1 text-[9px] text-emerald-400">▲ best</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ───────────── Decision log ───────────── */

export interface LogEntry {
  id: string;
  time: number;
  scenario: ScenarioId;
  verdict: string;
  summary: string;
  source: 'live' | 'offline';
}

export const DecisionLog: React.FC<{ entries: LogEntry[] }> = ({ entries }) => (
  <div className="cr-panel p-4 h-full">
    <PanelTitle icon={<Clock3 className="w-4 h-4" />} title="Decision history" hint="Every arbitration this session" />
    {entries.length === 0 ? (
      <div className="text-[12.5px] text-slate-500 py-6 text-center">No decisions yet.</div>
    ) : (
      <div className="space-y-2 max-h-[330px] overflow-y-auto pr-1">
        {entries.map((e) => {
          const m = VERDICT_META[e.verdict] ?? VERDICT_META.APPROVE;
          return (
            <div key={e.id} className="cr-fade-in flex gap-3 items-start rounded-xl px-3 py-2 border border-white/[0.06] bg-white/[0.015]">
              <Chip color={m.color}>{e.verdict}</Chip>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold text-slate-200">{SCENARIOS[e.scenario].title}</div>
                <div className="text-[11px] text-slate-400 leading-snug line-clamp-2">{e.summary}</div>
              </div>
              <div className="text-[10px] cr-mono text-slate-500 shrink-0">{new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

/* ───────────── Cell inspector (scene overlay) ───────────── */

export const CellInspector: React.FC<{ cell: Cell; contested: boolean; onClose: () => void }> = ({ cell, contested, onClose }) => {
  const h = cellHealth(cell, contested);
  const color = HEALTH_COLOR[h];
  return (
    <div className="cr-pop w-[250px] rounded-2xl bg-[#0b1120]/85 backdrop-blur-md border border-white/10 p-4 shadow-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
          <span className="font-semibold text-slate-100">{prettyCell(cell.cell_id)}</span>
          <span className="text-[10px] cr-mono text-slate-400">{cell.status}</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white">
          <XCircle className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        {[
          ['Tx power', `${fmt(cell.tx_power_dbm, 1)} dBm`],
          ['Users', `${cell.connected_users_count}`],
          ['Energy', `${fmt(cell.energy_consumption, 1)} u`],
          ['Interference', `${fmt(cell.total_interference_caused, 0)}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-white/[0.04] px-2.5 py-1.5">
            <div className="text-[9.5px] uppercase tracking-wider text-slate-500">{k}</div>
            <div className="text-[13px] font-semibold cr-mono text-slate-100">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-[10.5px] text-slate-400 mb-1">
          <span>Load</span>
          <span className="cr-mono">{(cell.current_load * 100).toFixed(0)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="cr-bar h-full rounded-full" style={{ width: `${cell.current_load * 100}%`, background: cell.current_load > 0.75 ? '#fbbf24' : '#34d399' }} />
        </div>
      </div>
      <div className="mt-3 text-[10.5px] text-slate-400">
        Neighbours: <span className="text-slate-200">{cell.neighbors.map(prettyCell).join(', ')}</span>
      </div>
      <div className="mt-1 text-[10.5px] text-slate-500">
        Power range {cell.min_tx_power}–{cell.max_tx_power} dBm
      </div>
    </div>
  );
};

export const StageIcons = { CheckCircle2, AlertTriangle, Layers, ShieldCheck, Sparkles, Cpu, XCircle, Ban, Brain, Activity };
