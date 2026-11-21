import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  BatteryCharging,
  Brain,
  Check,
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
    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-bold tracking-wide cr-mono ${className}`}
    style={{ color: solid ? '#20120a' : color, background: solid ? color : `${color}1f`, border: `1px solid ${color}40` }}
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
        {hint && <div className="text-[13px] text-slate-400 leading-tight mt-0.5">{hint}</div>}
      </div>
    </div>
    {right}
  </div>
);

/* ───────────── KPI strip ───────────── */

interface KpiProps {
  history: NetworkMetrics[];
  committed: NetworkMetrics;
  predicted: NetworkMetrics | null;
  reversals: number;
  reversalsBlocked: number;
  decisions: number;
  unsafeBlocked: number;
}

const Spark: React.FC<{ values: number[]; color: string; className?: string; wide?: boolean }> = ({ values, color, className = '', wide }) => {
  const w = wide ? 240 : 54;
  const h = wide ? 32 : 18;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 4) + 2},${h - 3 - ((v - lo) / span) * (h - 6)}`);
  const last = pts[pts.length - 1].split(',');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={wide ? undefined : w} height={wide ? undefined : h} preserveAspectRatio="none" className={className} aria-hidden>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} />
    </svg>
  );
};

const KpiTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  digits?: number;
  unit?: string;
  sub?: React.ReactNode;
  info?: string;
  spark?: number[];
  align?: 'left' | 'right';
  predicted?: number | null;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
  meter?: { value: number; threshold?: number; max: number };
}> = ({ icon, label, value, digits = 1, unit, sub, info, spark, align = 'left', predicted, tone = 'neutral', meter }) => {
  const v = useAnimatedNumber(value);
  const toneColor = tone === 'good' ? '#4ade80' : tone === 'warn' ? '#f5b942' : tone === 'bad' ? '#f87171' : '#e2e8f0';
  return (
    <div className="group px-3.5 py-2.5 min-w-0 relative cursor-help transition-colors hover:bg-white/[0.04] first:rounded-l-[14px] last:rounded-r-[14px]" tabIndex={0}>
      <div className="flex items-center gap-1.5 text-slate-400">
        {icon}
        <span className="text-[13px] font-medium truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-[22px] leading-none font-bold tracking-tight tabular-nums" style={{ color: toneColor }}>
          {v.toFixed(digits)}
        </span>
        {unit && <span className="text-[12.5px] text-slate-400 font-medium">{unit}</span>}
      </div>
      {predicted !== undefined && predicted !== null ? (
        <div className="mt-1 flex items-center gap-1.5 text-[12px] cr-fade-in">
          <span className="px-1 rounded bg-violet-500/15 text-violet-300 border border-violet-400/30 font-semibold text-[10.5px]">PREDICTED</span>
          <span className="cr-mono text-violet-200">
            {predicted.toFixed(digits)}
            {unit ? ` ${unit}` : ''}
          </span>
        </div>
      ) : (
        <div className="mt-1 text-[12px] text-slate-500 truncate">{sub}</div>
      )}
      {spark && spark.length >= 2 && <Spark values={spark} color={toneColor} className="absolute right-3 top-3 opacity-80" />}
      {info && (
        <div
          className={`pointer-events-none absolute top-full z-40 mt-2 w-[270px] rounded-xl border border-orange-300/25 bg-[#241d3d] p-3 shadow-2xl opacity-0 translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0 group-focus:opacity-100 ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <div className="text-[13px] font-semibold text-slate-100">{label}</div>
          <div className="text-[12.5px] text-slate-300 leading-snug mt-1">{info}</div>
          {spark && spark.length >= 2 && (
            <div className="mt-2 pt-2 border-t border-white/10">
              <Spark values={spark} color={toneColor} className="w-full h-8" wide />
              <div className="text-[11.5px] text-slate-400 mt-1">Trend across {spark.length} committed states this session</div>
            </div>
          )}
        </div>
      )}
      {meter && (
        <div className="absolute left-3.5 right-3.5 bottom-0 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
          <div className="cr-bar h-full rounded-full" style={{ width: `${Math.min(100, (meter.value / meter.max) * 100)}%`, background: toneColor }} />
          {meter.threshold !== undefined && <div className="absolute top-0 bottom-0 w-[2px] bg-rose-400" style={{ left: `${(meter.threshold / meter.max) * 100}%` }} />}
        </div>
      )}
    </div>
  );
};

export const KpiStrip: React.FC<KpiProps> = ({ history, committed, predicted, reversals, reversalsBlocked, decisions, unsafeBlocked }) => {
  const energyPct = (committed.total_energy / BASELINE_ENERGY) * 100;
  const cov = committed.coverage_percentage;
  return (
    <div className="cr-panel relative z-20 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 divide-x divide-y xl:divide-y-0 divide-white/[0.07]">
      <KpiTile
        icon={<Signal className="w-3.5 h-3.5" />}
        label="Coverage"
        spark={history.map((m) => m.coverage_percentage)}
        value={cov}
        unit="%"
        tone={cov >= 95 ? 'good' : 'bad'}
        predicted={predicted?.coverage_percentage}
        meter={{ value: cov - 80, threshold: 15, max: 20 }}
        sub="min 95%"
        info="Share of users with acceptable signal (RSRP ≥ −95 dBm and SINR ≥ 0 dB). Safety rule: must stay at or above 95%."
      />
      <KpiTile
        icon={<BatteryCharging className="w-3.5 h-3.5" />}
        label="Energy"
        spark={history.map((m) => (m.total_energy / BASELINE_ENERGY) * 100)}
        value={energyPct}
        unit="%"
        predicted={predicted ? (predicted.total_energy / BASELINE_ENERGY) * 100 : null}
        sub={`${fmt(committed.total_energy, 1)} u`}
        tone={energyPct < 99.5 ? 'good' : 'neutral'}
        info={`Relative network energy use compared with every tower running at the initial power (${fmt(committed.total_energy, 1)} units now).`}
      />
      <KpiTile
        icon={<Activity className="w-3.5 h-3.5" />}
        label="Avg SINR"
        spark={history.map((m) => m.avg_sinr_db)}
        value={committed.avg_sinr_db}
        unit="dB"
        predicted={predicted?.avg_sinr_db}
        sub={`worst ${fmt(committed.min_sinr_db, 1)} dB`}
        info={`Average signal-to-interference-plus-noise ratio across connected users. The worst single user is at ${fmt(committed.min_sinr_db, 1)} dB (safety floor −5 dB).`}
      />
      <KpiTile
        icon={<RotateCcw className="w-3.5 h-3.5" />}
        label="Reversals"
        align="right"
        value={reversals}
        digits={0}
        tone={reversals === 0 ? 'good' : 'warn'}
        sub={reversalsBlocked ? `${reversalsBlocked} damped` : 'flip-flops'}
        info="Power changes that went back in the opposite direction on the same tower (amplifier wear, handoff storms). The referee damps these with a 3-cycle cooldown and 1 dB hysteresis."
      />
      <KpiTile icon={<GitCompare className="w-3.5 h-3.5" />} label="Decisions"
        align="right" value={decisions} digits={0} sub="this session" info="Arbitration decisions committed in this session." />
      <KpiTile
        icon={<Radio className="w-3.5 h-3.5" />}
        label="Active cells"
        align="right"
        value={committed.active_cells}
        digits={0}
        unit={`/ ${committed.total_cells}`}
        sub={`${committed.connected_users - committed.uncovered_users}/${committed.connected_users} users`}
        info={`${committed.connected_users - committed.uncovered_users} of ${committed.connected_users} users are adequately served by ${committed.active_cells} active towers.`}
      />
      <KpiTile
        icon={<ShieldCheck className="w-3.5 h-3.5" />}
        label="Violations"
        align="right"
        value={committed.safety_violations.length}
        digits={0}
        tone={committed.safety_violations.length ? 'bad' : 'good'}
        sub={unsafeBlocked ? `${unsafeBlocked} blocked` : 'safety'}
        info={unsafeBlocked ? `${unsafeBlocked} unsafe candidate actions were blocked by the guardrails this session. Live-network violations: ${committed.safety_violations.length}.` : 'Active hard safety violations on the live network.'}
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
          <button onClick={onSkip} className="text-[12.5px] font-semibold text-slate-300 hover:text-white px-2 py-1 rounded-md bg-white/[0.05] border border-white/10">
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
            <span className="w-6 h-6 rounded-full grid place-items-center text-[12px] cr-mono text-slate-500 border border-white/10">{i + 1}</span>
            <span className="text-[13.5px] text-slate-500">{t}</span>
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
                <div className="text-[13.5px] font-semibold text-slate-100 flex items-center gap-2">
                  {s.title}
                  {done && <span className="text-[11px] font-bold tracking-wider" style={{ color }}>{s.tone === 'bad' ? 'FLAGGED' : 'DONE'}</span>}
                </div>
                {!pending && <div className={`text-[13px] text-slate-400 mt-0.5 leading-snug ${active ? 'cr-shimmer rounded' : 'cr-fade-in'}`}>{s.output}</div>}
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
      <div className="flex items-center gap-4 text-[12px] text-slate-400 mb-3">
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
                <span className="text-[13.5px] font-semibold text-slate-200">{r.label}</span>
                <span className={`cr-mono text-[13px] font-bold ${committed ? (good ? 'text-emerald-300' : 'text-rose-300') : 'text-slate-500'}`}>
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
                  <span className="cr-mono text-[12px] text-slate-400 w-14 text-right">{bar.show && bar.v !== undefined ? bar.v.toFixed(1) : '—'}</span>
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
            <div className="text-[12px] cr-mono text-slate-500 pt-0.5 w-6">C{c.cycle}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-semibold" style={{ color: meta.color }}>
                  {meta.label}: {describeCommand(c.command)}
                </span>
                <Chip color={m.color}>{c.verdict}</Chip>
              </div>
              <div className="text-[12.5px] text-slate-400 leading-snug mt-0.5 line-clamp-2">{c.reason}</div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

/* ───────────── Policy benchmark ───────────── */

const POLICIES = [
  { key: 'no_referee', label: 'No referee', sub: 'Executes every command', color: '#f87171' },
  { key: 'fixed_priority', label: 'Fixed priority', sub: 'Coverage > Interference > Energy', color: '#a78bfa' },
  { key: 'ranguard', label: 'RANGUARD', sub: 'Shadow simulation + guardrails', color: '#ff9a3d' },
] as const;

const METRICS = [
  { key: 'coverage', label: 'Coverage', get: (p: any) => p.coverage_pct, unit: '%', d: 1, best: 'max' },
  { key: 'energy', label: 'Energy used', get: (p: any) => p.total_energy, unit: ' u', d: 1, best: 'min' },
  { key: 'interference', label: 'Interference', get: (p: any) => p.interference, unit: '', d: 0, best: 'min' },
  { key: 'sinr', label: 'Avg SINR', get: (p: any) => p.avg_sinr_db, unit: ' dB', d: 1, best: 'max' },
  { key: 'reversals', label: 'Power flip-flops', get: (p: any) => p.control_reversals, unit: '', d: 0, best: 'min' },
  { key: 'violations', label: 'Safety violations', get: (p: any) => p.safety_violations, unit: '', d: 0, best: 'min' },
  { key: 'latency', label: 'Decision time', get: (p: any) => p.median_latency_ms, unit: ' ms', d: 2, best: 'none' },
] as const;

const ImpactCard: React.FC<{ title: string; big: string; sub: string; tone: 'good' | 'bad' | 'flat'; detail: string }> = ({ title, big, sub, tone, detail }) => {
  const c = tone === 'good' ? '#4ade80' : tone === 'bad' ? '#f87171' : '#d3cbe4';
  return (
    <div className="cr-lift relative min-w-0 overflow-hidden rounded-xl border border-white/[0.1] bg-white/[0.035] px-4 py-3.5 hover:border-orange-300/40 group">
      <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40" style={{ background: c }} />
      <div className="text-[13px] font-medium text-slate-300">{title}</div>
      <div className="text-[24px] sm:text-[30px] leading-none font-extrabold tracking-tight mt-1.5 break-words" style={{ color: c }}>
        {big}
      </div>
      <div className="text-[13px] text-slate-200 mt-1.5">{sub}</div>
      <div className="text-[12.5px] text-slate-400 cr-mono mt-0.5">{detail}</div>
    </div>
  );
};

export const PolicyBenchmark: React.FC<{
  data: BenchmarkComparison | null;
  live: boolean;
  busy?: boolean;
  seed?: number;
  cycles?: number;
  onRerun?: (seed: number, cycles: number) => void;
}> = ({ data, live, busy, seed = 42, cycles = 4, onRerun }) => {
  const [hoverMetric, setHoverMetric] = useState<string | null>(null);
  if (!data) return null;
  const P = data.policies as Record<string, any>;
  const no = P.no_referee;
  const rg = P.ranguard;
  const pct = (a: number, b: number) => (a === 0 ? 0 : ((b - a) / a) * 100);
  const eDelta = pct(no.total_energy, rg.total_energy);
  const iDelta = pct(no.interference, rg.interference);
  const rDelta = pct(no.control_reversals, rg.control_reversals);
  const tone = (d: number): 'good' | 'bad' | 'flat' => (Math.abs(d) < 0.05 ? 'flat' : d < 0 ? 'good' : 'bad');
  const sgn = (d: number) => (Math.abs(d) < 0.05 ? '±0%' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}%`);

  // who leads each metric (ties: everyone at the best value leads, unless all three are equal)
  const info = METRICS.map((m) => {
    const vals = POLICIES.map((p) => m.get(P[p.key]) as number);
    const best = m.best === 'max' ? Math.max(...vals) : m.best === 'min' ? Math.min(...vals) : null;
    const allEqual = vals.every((v) => v === vals[0]);
    return { m, vals, best, allEqual };
  });
  const scored = info.filter((i) => i.best !== null);
  const leads = POLICIES.map((_, pi) => scored.filter((i) => !i.allEqual && i.vals[pi] === i.best).length);
  const contested = scored.filter((i) => !i.allEqual).length;

  // honest one-sentence verdict
  const better: string[] = [];
  const worse: string[] = [];
  const note = (d: number, name: string, unit: string) => {
    if (Math.abs(d) < 0.5) return;
    (d < 0 ? better : worse).push(`${Math.abs(d).toFixed(1)}% ${d < 0 ? 'less' : 'more'} ${name}${unit}`);
  };
  note(eDelta, 'energy', '');
  note(iDelta, 'interference', '');
  note(rDelta, 'power flip-flopping', '');
  const verdict =
    `Over ${data.cycles_evaluated} cycles (seed ${data.seed}), RANGUARD used ` +
    (better.length ? better.join(', ').replace(/, ([^,]*)$/, ' and $1') : 'about the same resources') +
    ` than running every command unchecked` +
    (worse.length ? `, but had ${worse.join(' and ')}` : '') +
    (rg.safety_violations === 0 ? ' — with zero safety violations and coverage held at ' : ' — but recorded safety violations; coverage was ') +
    `${fmt(rg.coverage_pct, 1)}%.`;

  return (
    <div className="cr-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-sky-400/15 border border-sky-300/30 text-sky-300 grid place-items-center">
            <Sparkles className="w-[18px] h-[18px]" />
          </div>
          <div>
            <h2 className="text-[17px] font-semibold text-slate-100 leading-tight">Does a referee really help?</h2>
            <p className="text-[13.5px] text-slate-300 mt-0.5">The same controller disturbances replayed under three policies.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {[
            { label: 'Seed', opts: [42, 7, 123], cur: seed, run: (v: number) => onRerun?.(v, cycles) },
            { label: 'Cycles', opts: [4, 8], cur: cycles, run: (v: number) => onRerun?.(seed, v) },
          ].map((g) => (
            <div key={g.label} className="flex items-center gap-2">
              <span className="text-[13px] text-slate-400">{g.label}</span>
              <div className="inline-flex rounded-lg border border-white/15 bg-white/[0.04] p-0.5">
                {g.opts.map((o) => (
                  <button
                    key={o}
                    disabled={!live || busy}
                    onClick={() => g.run(o)}
                    title={live ? `Re-run with ${g.label.toLowerCase()} ${o}` : 'Needs the live engine to re-run'}
                    className={`px-2.5 py-1 rounded-md text-[13px] font-semibold cr-mono transition-colors disabled:cursor-not-allowed ${
                      g.cur === o ? 'bg-sky-400 text-slate-900' : 'text-slate-200 hover:bg-white/10 disabled:text-slate-500'
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <span className={`text-[12px] font-bold cr-mono px-2 py-1 rounded-md border ${busy ? 'text-slate-300 border-white/15 cr-pulse' : live ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10' : 'text-slate-300 border-white/15 bg-white/[0.04]'}`}>
            {busy ? 'RE-RUNNING…' : live ? 'MEASURED LIVE' : 'RECORDED'}
          </span>
        </div>
      </div>

      {/* plain-language verdict */}
      <div className="mt-4 rounded-xl border border-orange-300/25 bg-orange-400/[0.07] px-4 py-3 text-[15px] leading-relaxed text-slate-100">
        <span className="font-bold text-sky-200">In short: </span>
        {verdict}
      </div>

      {/* headline impact */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        <ImpactCard title="Energy" big={sgn(eDelta)} tone={tone(eDelta)} sub="vs no referee" detail={`${fmt(no.total_energy, 1)} → ${fmt(rg.total_energy, 1)} u`} />
        <ImpactCard title="Interference" big={sgn(iDelta)} tone={tone(iDelta)} sub="vs no referee" detail={`${fmt(no.interference, 0)} → ${fmt(rg.interference, 0)}`} />
        <ImpactCard title="Power flip-flops" big={sgn(rDelta)} tone={tone(rDelta)} sub="vs no referee" detail={`${no.control_reversals} → ${rg.control_reversals} reversals`} />
        <ImpactCard
          title="Safety violations"
          big={`${rg.safety_violations}`}
          tone={rg.safety_violations === 0 ? 'good' : 'bad'}
          sub={`coverage held at ${fmt(rg.coverage_pct, 1)}%`}
          detail={`floor 95% · ${data.cycles_evaluated} cycles · seed ${data.seed}`}
        />
      </div>

      {/* scoreboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5 min-w-0">
        {POLICIES.map((p, pi) => {
          const isRg = p.key === 'ranguard';
          return (
            <div
              key={p.key}
              className={`relative min-w-0 rounded-2xl border p-4 transition-colors ${
                isRg ? 'border-orange-300/50 bg-gradient-to-b from-orange-400/[0.12] to-orange-400/[0.03] shadow-[0_18px_50px_-28px_rgba(255,154,61,0.7)]' : 'border-white/[0.1] bg-white/[0.025]'
              }`}
            >
              {isRg && <span className="absolute -top-2.5 right-4 text-[11.5px] font-extrabold tracking-wide px-2.5 py-0.5 rounded-full bg-sky-400 text-slate-900">RECOMMENDED</span>}
              <div className="flex items-start gap-2.5">
                <span className="mt-1 w-3.5 h-3.5 rounded-md shrink-0" style={{ background: p.color }} />
                <div className="min-w-0">
                  <div className="text-[16px] font-bold text-slate-100 leading-tight">{p.label}</div>
                  <div className="text-[13px] text-slate-400 leading-snug">{p.sub}</div>
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-[32px] leading-none font-extrabold tracking-tight" style={{ color: p.color }}>{leads[pi]}</span>
                <span className="text-[13.5px] text-slate-300">of {contested} metrics led</span>
              </div>

              <div className="mt-3 divide-y divide-white/[0.07] rounded-xl border border-white/[0.08] overflow-hidden">
                {info.map(({ m, vals, best, allEqual }) => {
                  const v = vals[pi];
                  const isLead = best !== null && !allEqual && v === best;
                  const change = pct(vals[0], v);
                  const hasChange = pi > 0 && m.best !== 'none' && Math.abs(change) >= 0.05 && vals[0] !== 0;
                  const good = m.best === 'max' ? change > 0 : change < 0;
                  return (
                    <div
                      key={m.key}
                      onMouseEnter={() => setHoverMetric(m.key)}
                      onMouseLeave={() => setHoverMetric(null)}
                      className={`flex items-center gap-2 px-3 py-2 text-[14px] transition-colors ${hoverMetric === m.key ? 'bg-white/[0.09]' : ''}`}
                    >
                      <span className="w-[18px] shrink-0 grid place-items-center">
                        {isLead ? <Check className="w-4 h-4 text-emerald-400" strokeWidth={3} /> : <span className="w-1.5 h-1.5 rounded-full bg-white/20" />}
                      </span>
                      <span className="text-slate-300 flex-1 min-w-0 truncate">{m.label}</span>
                      {hasChange && (
                        <span className={`text-[12px] font-bold cr-mono px-1.5 py-0.5 rounded ${good ? 'text-emerald-300 bg-emerald-400/10' : 'text-rose-300 bg-rose-400/10'}`}>
                          {change > 0 ? '+' : '−'}
                          {Math.abs(change).toFixed(1)}%
                        </span>
                      )}
                      <span className={`cr-mono tabular-nums w-[78px] text-right ${isLead ? 'font-bold text-emerald-300' : 'text-slate-100'}`}>
                        {Number(v).toFixed(m.d)}
                        <span className="text-slate-400 font-normal">{m.unit}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[12.5px] text-slate-400 mt-3">
        ✓ marks the best value on a metric (lower is better for energy, interference, flip-flops and violations; higher for coverage and SINR). Chips show change versus “No referee”. Decision time is for reference only.
      </p>
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
      <div className="text-[13.5px] text-slate-500 py-6 text-center">No decisions yet.</div>
    ) : (
      <div className="space-y-2 max-h-[330px] overflow-y-auto pr-1">
        {entries.map((e) => {
          const m = VERDICT_META[e.verdict] ?? VERDICT_META.APPROVE;
          return (
            <div key={e.id} className="cr-fade-in flex gap-3 items-start rounded-xl px-3 py-2 border border-white/[0.06] bg-white/[0.015]">
              <Chip color={m.color}>{e.verdict}</Chip>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-slate-200">{SCENARIOS[e.scenario].title}</div>
                <div className="text-[12.5px] text-slate-400 leading-snug line-clamp-2">{e.summary}</div>
              </div>
              <div className="text-[11.5px] cr-mono text-slate-500 shrink-0">{new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
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
    <div className="cr-pop w-[250px] rounded-2xl bg-[#15122a]/85 backdrop-blur-md border border-white/10 p-4 shadow-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
          <span className="font-semibold text-slate-100">{prettyCell(cell.cell_id)}</span>
          <span className="text-[11.5px] cr-mono text-slate-400">{cell.status}</span>
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
            <div className="text-[11px] uppercase tracking-wider text-slate-500">{k}</div>
            <div className="text-[14px] font-semibold cr-mono text-slate-100">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-[12px] text-slate-400 mb-1">
          <span>Load</span>
          <span className="cr-mono">{(cell.current_load * 100).toFixed(0)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="cr-bar h-full rounded-full" style={{ width: `${cell.current_load * 100}%`, background: cell.current_load > 0.75 ? '#fbbf24' : '#34d399' }} />
        </div>
      </div>
      <div className="mt-3 text-[12px] text-slate-400">
        Neighbours: <span className="text-slate-200">{cell.neighbors.map(prettyCell).join(', ')}</span>
      </div>
      <div className="mt-1 text-[12px] text-slate-500">
        Power range {cell.min_tx_power}–{cell.max_tx_power} dBm
      </div>
    </div>
  );
};

export const StageIcons = { CheckCircle2, AlertTriangle, Layers, ShieldCheck, Sparkles, Cpu, XCircle, Ban, Brain, Activity };


/* ───────────── Insights: tabs combine two long panels into one ───────────── */

export const InsightsPanel: React.FC<{
  bench: BenchmarkComparison | null;
  live: boolean;
  log: LogEntry[];
  busy?: boolean;
  seed?: number;
  cycles?: number;
  onRerun?: (seed: number, cycles: number) => void;
}> = ({ bench, live, log, busy, seed, cycles, onRerun }) => {
  const [tab, setTab] = useState<'policy' | 'history'>('policy');
  return (
    <div>
      <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5 mb-3 text-[13.5px] font-medium">
        {([
          ['policy', 'Policy comparison'],
          ['history', `Decision history${log.length ? ` (${log.length})` : ''}`],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-md transition-colors ${tab === k ? 'bg-sky-400 text-slate-900 font-semibold' : 'text-slate-300 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'policy' ? <PolicyBenchmark data={bench} live={live} busy={busy} seed={seed} cycles={cycles} onRerun={onRerun} /> : <DecisionLog entries={log} />}
    </div>
  );
};
