import { api } from '../services/api';
import {
  BenchmarkComparison,
  Cell,
  ControllerCommand,
  NetworkMetrics,
  NetworkState,
  RefereeDecision,
} from '../types';
import fixturesJson from '../data/scenarioFixtures.json';
import reviewFixturesJson from '../data/reviewFixtures.json';
import { DEFAULT_NETWORK_STATE } from '../data/defaultData';

export type ScenarioId = 'CELL_SHUTDOWN' | 'TRAFFIC_SPIKE' | 'PING_PONG';

export interface PingPongCycle {
  cycle: number;
  command: ControllerCommand;
  verdict: RefereeDecision['verdict'];
  reason: string;
  resulting_power: number;
  coverage: number;
  stability_reversals: number;
  delayed_count: number;
}

export interface ScenarioRun {
  id: ScenarioId;
  runId: string;
  description: string;
  commands: ControllerCommand[];
  decision: RefereeDecision | null;
  cycles: PingPongCycle[];
  reversalsSuppressed: number;
  before: NetworkState;
  after: NetworkState;
  beforeMetrics: NetworkMetrics;
  afterMetrics: NetworkMetrics;
  focusCell: string;
  source: 'live' | 'offline';
  startedAt: number;
}

export interface ConflictInfo {
  kind: 'DIRECT' | 'NEIGHBOR' | 'REVERSAL';
  cells: string[];
  controllers: string[];
  text: string;
}

const fixtures = fixturesJson as unknown as Record<ScenarioId, { result: any; after: NetworkState }> & {
  benchmark: BenchmarkComparison;
};

export const OFFLINE_BENCHMARK: BenchmarkComparison = fixtures.benchmark;
export const BASELINE_ENERGY = DEFAULT_NETWORK_STATE.metrics.total_energy;

export const SCENARIOS: Record<
  ScenarioId,
  { title: string; short: string; blurb: string; focus: string; tag: string }
> = {
  CELL_SHUTDOWN: {
    title: 'Cell Shutdown',
    short: 'Energy tries to switch off Cell 3',
    blurb: 'The Energy controller wants to power off a whole tower to save electricity. Is that safe for the 100 users?',
    focus: 'CELL_03',
    tag: 'Primary demo',
  },
  TRAFFIC_SPIKE: {
    title: 'Traffic Spike',
    short: 'Demand surges around Cell 2',
    blurb: 'A crowd arrives near Cell 2. Coverage wants more power, Interference wants less, Energy trims a neighbour.',
    focus: 'CELL_02',
    tag: '3 controllers clash',
  },
  PING_PONG: {
    title: 'Ping-Pong',
    short: 'Controllers flip-flop Cell 3',
    blurb: 'Energy and Coverage keep reversing each other every cycle. Without a referee the radio flaps back and forth.',
    focus: 'CELL_03',
    tag: 'Stability test',
  },
};

export const CONTROLLER_META: Record<string, { label: string; color: string; soft: string }> = {
  ENERGY: { label: 'Energy', color: '#34d399', soft: 'rgba(52,211,153,0.14)' },
  COVERAGE: { label: 'Coverage', color: '#38bdf8', soft: 'rgba(56,189,248,0.14)' },
  INTERFERENCE: { label: 'Interference', color: '#c084fc', soft: 'rgba(192,132,252,0.14)' },
};

export const VERDICT_META: Record<string, { color: string; bg: string; label: string; meaning: string }> = {
  APPROVE: { color: '#34d399', bg: 'rgba(52,211,153,0.12)', label: 'APPROVE', meaning: 'Executed as submitted' },
  MODIFY: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: 'MODIFY', meaning: 'Replaced with a safer coordinated action' },
  DELAY: { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: 'DELAY', meaning: 'Postponed to keep the radio stable' },
  REJECT: { color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: 'REJECT', meaning: 'Blocked as unsafe' },
};

/** Coverage radius (scene units) from transmit power using a log-distance path-loss model (n = 3.5). */
export function powerToRadius(powerDbm: number, status: string = 'ACTIVE'): number {
  if (status === 'SHUTDOWN' || status === 'INACTIVE' || powerDbm <= 0) return 0;
  return 7 * Math.pow(10, (powerDbm - 38) / 35);
}

export type Health = 'healthy' | 'warning' | 'unsafe' | 'off';

export function cellHealth(cell: Cell, contested: boolean): Health {
  if (cell.status === 'SHUTDOWN' || cell.status === 'INACTIVE') return 'off';
  if (cell.current_load >= 0.9) return 'unsafe';
  if (contested || cell.current_load >= 0.75 || cell.status === 'SLEEP') return 'warning';
  return 'healthy';
}

export const HEALTH_COLOR: Record<Health, string> = {
  healthy: '#34d399',
  warning: '#fbbf24',
  unsafe: '#f87171',
  off: '#64748b',
};

export function describeCommand(c: ControllerCommand): string {
  const cell = prettyCell(c.target_cell);
  if (c.action_type === 'SHUTDOWN') return `Shut down ${cell}`;
  if (c.action_type === 'SLEEP') return `Put ${cell} to sleep`;
  const dir = c.delta > 0 ? 'Raise' : 'Lower';
  return `${dir} ${cell} to ${fmt(c.proposed_value, 1)} dBm`;
}

export function prettyCell(id: string): string {
  return id.replace('CELL_0', 'Cell ').replace('CELL_', 'Cell ');
}

export function fmt(n: number | undefined | null, d = 1): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return Number(n).toFixed(d);
}

/** Detect direct (same cell, opposite direction) and neighbour (adjacent cells, opposite direction) conflicts. */
export function detectConflicts(commands: ControllerCommand[], cells: Record<string, Cell>): ConflictInfo[] {
  const out: ConflictInfo[] = [];
  const byCell: Record<string, ControllerCommand[]> = {};
  commands.forEach((c) => (byCell[c.target_cell] ||= []).push(c));

  Object.entries(byCell).forEach(([cell, list]) => {
    const up = list.filter((c) => c.delta > 0);
    const down = list.filter((c) => c.delta < 0);
    if (up.length && down.length) {
      out.push({
        kind: 'DIRECT',
        cells: [cell],
        controllers: [...new Set(list.map((c) => c.controller_id))],
        text: `${up.map((c) => CONTROLLER_META[c.controller_id].label).join(', ')} wants ${prettyCell(cell)} UP while ${down
          .map((c) => CONTROLLER_META[c.controller_id].label)
          .join(', ')} wants it DOWN`,
      });
    }
  });

  for (let i = 0; i < commands.length; i++) {
    for (let j = i + 1; j < commands.length; j++) {
      const a = commands[i];
      const b = commands[j];
      if (a.target_cell === b.target_cell) continue;
      const adjacent = cells[a.target_cell]?.neighbors?.includes(b.target_cell);
      if (adjacent && Math.sign(a.delta) !== Math.sign(b.delta) && a.delta !== 0 && b.delta !== 0) {
        out.push({
          kind: 'NEIGHBOR',
          cells: [a.target_cell, b.target_cell],
          controllers: [a.controller_id, b.controller_id],
          text: `${prettyCell(a.target_cell)} and ${prettyCell(b.target_cell)} are neighbours — opposite power moves shift edge users and interference`,
        });
      }
    }
  }
  return out;
}

export function countReversals(values: number[]): number {
  let rev = 0;
  let lastSign = 0;
  for (let i = 1; i < values.length; i++) {
    const s = Math.sign(values[i] - values[i - 1]);
    if (s !== 0) {
      if (lastSign !== 0 && s !== lastSign) rev++;
      lastSign = s;
    }
  }
  return rev;
}

function newRunId() {
  return Math.random().toString(36).slice(2, 8);
}

function buildRun(
  id: ScenarioId,
  result: any,
  before: NetworkState,
  after: NetworkState,
  source: 'live' | 'offline',
): ScenarioRun {
  const cycles: PingPongCycle[] = result.cycles ?? [];
  const commands: ControllerCommand[] =
    result.incoming_commands ?? (result.incoming_command ? [result.incoming_command] : cycles.map((c) => c.command));
  return {
    id,
    runId: newRunId(),
    description: result.description,
    commands,
    decision: result.decision ?? null,
    cycles,
    reversalsSuppressed: result.total_reversals_suppressed ?? 0,
    before,
    after,
    beforeMetrics: result.initial_metrics ?? before.metrics,
    afterMetrics: result.post_commit_metrics ?? after.metrics,
    focusCell: SCENARIOS[id].focus,
    source,
    startedAt: Date.now(),
  };
}

/** Runs a scenario against the live backend (reset → run → read state). Falls back to recorded seed-42 outputs. */
export async function runScenario(id: ScenarioId): Promise<ScenarioRun> {
  try {
    await api.resetSimulation(42);
    const before = await api.getNetworkState();
    const result = await api.runScenario(id);
    const after = await api.getNetworkState();
    return buildRun(id, result, before, after, 'live');
  } catch {
    const fx = fixtures[id];
    return buildRun(id, fx.result, DEFAULT_NETWORK_STATE, fx.after, 'offline');
  }
}

export async function loadBenchmark(): Promise<{ data: BenchmarkComparison; live: boolean }> {
  try {
    const data = await api.runBenchmarkComparison(42, 4);
    await api.resetSimulation(42).catch(() => undefined);
    return { data, live: true };
  } catch {
    return { data: OFFLINE_BENCHMARK, live: false };
  }
}

export async function resetNetwork(): Promise<{ state: NetworkState; live: boolean }> {
  try {
    await api.resetSimulation(42);
    return { state: await api.getNetworkState(), live: true };
  } catch {
    return { state: DEFAULT_NETWORK_STATE, live: false };
  }
}


/* ───────────────────────── Operator review (shadow forks) ───────────────────────── */

export type ReviewScenarioId = 'CELL_SHUTDOWN' | 'TRAFFIC_SPIKE';
export const isReviewScenario = (id: ScenarioId): id is ReviewScenarioId => id !== 'PING_PONG';

export interface GuardrailCheck {
  key: string;
  label: string;
  rule: string;
  value: string;
  passed: boolean;
}
export interface ScoreTerm {
  key: 'energy' | 'interference' | 'coverage' | 'change';
  label: string;
  weight: number;
  score: number;
  raw: number;
  formula: string;
  contribution: number;
}
export interface ForkChange {
  cell_id: string;
  from_dbm: number;
  to_dbm: number;
  from_status: string;
  to_status: string;
}
export interface ReviewCandidate {
  candidate_id: string;
  label: string;
  rank: number;
  origin: string;
  description: string;
  changes: ForkChange[];
  predicted_metrics: NetworkMetrics;
  deltas: { coverage: number; energy_pct: number; sinr: number; interference: number };
  is_safe: boolean;
  violated_constraints: string[];
  checks: GuardrailCheck[];
  score: number | null;
  score_terms: ScoreTerm[];
  advisory_penalty: number;
  sim_ms: number;
  is_recommended: boolean;
}
export interface ReviewData {
  state_version: number;
  cycle: number;
  baseline: NetworkMetrics;
  weights: Record<'energy' | 'interference' | 'coverage' | 'change', number>;
  conflicts: Array<{ conflict_type: string; severity: string; explanation: string; affected_cells: string[]; involved_controllers: string[] }>;
  advisory: any;
  stability: { delayed: boolean; message: string };
  candidates: ReviewCandidate[];
  recommended_id: string | null;
  recommendation: { candidate_id: string; reasons: string[] } | null;
  compute_ms: number;
}
export interface PreparedRun {
  id: ReviewScenarioId;
  description: string;
  commands: ControllerCommand[];
  before: NetworkState;
  source: 'live' | 'offline';
}
export interface CommitOutcome {
  after: NetworkState;
  decision: RefereeDecision;
  metrics: NetworkMetrics;
  wasOverride: boolean;
  message: string;
}

const reviewFx = reviewFixturesJson as unknown as Record<
  ReviewScenarioId,
  { prepare: any; before: NetworkState; review: ReviewData; outcomes: Record<string, any> }
>;

export const ORIGIN_LABEL: Record<string, string> = {
  BASELINE: 'Baseline',
  ENERGY: 'Energy proposal',
  COVERAGE: 'Coverage proposal',
  INTERFERENCE: 'Interference proposal',
  REFEREE_COORDINATED: 'RANGUARD compromise',
};

export async function prepareScenario(id: ReviewScenarioId): Promise<PreparedRun> {
  try {
    const prep = await api.prepareScenario(id);
    const before = await api.getNetworkState();
    return { id, description: prep.description, commands: prep.commands, before, source: 'live' };
  } catch {
    const fx = reviewFx[id];
    return { id, description: fx.prepare.description, commands: fx.prepare.commands, before: fx.before, source: 'offline' };
  }
}

export async function runShadow(run: PreparedRun): Promise<ReviewData> {
  if (run.source === 'live') return (await api.shadowReview(run.commands)) as ReviewData;
  return reviewFx[run.id].review;
}

export async function commitChoice(run: PreparedRun, candidateId: string): Promise<CommitOutcome> {
  if (run.source === 'live') {
    const res = await api.commitCandidate(run.commands, candidateId);
    const after = await api.getNetworkState();
    return { after, decision: res.decision, metrics: res.metrics, wasOverride: res.was_override, message: res.message };
  }
  const o = reviewFx[run.id].outcomes[candidateId];
  return { after: o.after, decision: o.decision, metrics: o.metrics, wasOverride: o.was_override, message: o.message };
}

/* ───────────────────────── helpers for the workbench ───────────────────────── */

export const TERM_COLOR: Record<string, string> = {
  energy: '#2dd4bf',
  interference: '#c084fc',
  coverage: '#60a5fa',
  change: '#f5b942',
};

export const prettyText = (s: string) => s.replace(/CELL_0?(\d+)/g, 'Cell $1');

/** Human readable trade-offs of choosing `c` instead of the recommended fork `best`. */
export function tradeoffs(c: ReviewCandidate, best: ReviewCandidate): Array<{ text: string; good: boolean }> {
  const out: Array<{ text: string; good: boolean }> = [];
  const dCov = c.predicted_metrics.coverage_percentage - best.predicted_metrics.coverage_percentage;
  const dEn = c.deltas.energy_pct - best.deltas.energy_pct;
  const dInt = c.deltas.interference - best.deltas.interference;
  if (c.score !== null && best.score !== null) {
    out.push({ text: `Objective score ${(c.score - best.score).toFixed(3)} vs recommended`, good: c.score >= best.score });
  }
  if (Math.abs(dCov) >= 0.05) out.push({ text: `Coverage ${dCov > 0 ? '+' : ''}${dCov.toFixed(1)} pts`, good: dCov > 0 });
  if (Math.abs(dEn) >= 0.05) out.push({ text: `Energy ${dEn > 0 ? '+' : ''}${dEn.toFixed(1)} % (${dEn > 0 ? 'uses more' : 'saves more'})`, good: dEn < 0 });
  if (Math.abs(dInt) >= 0.5) out.push({ text: `Interference ${dInt > 0 ? '+' : ''}${dInt.toFixed(0)} units`, good: dInt < 0 });
  return out;
}

export function changeLabel(ch: ForkChange): string {
  if (ch.to_status === 'SHUTDOWN') return `${prettyCell(ch.cell_id)} switched off`;
  const d = ch.to_dbm - ch.from_dbm;
  return `${prettyCell(ch.cell_id)}  ${fmt(ch.from_dbm, 1)} → ${fmt(ch.to_dbm, 1)} dBm (${d > 0 ? '+' : ''}${fmt(d, 1)} dB)`;
}
