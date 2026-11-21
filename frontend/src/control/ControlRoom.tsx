import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CheckCircle2, Clapperboard, MousePointerClick, Moon, ShieldCheck, Sun, X } from 'lucide-react';
import { BenchmarkComparison, Cell, NetworkState } from '../types';
import { DEFAULT_NETWORK_STATE } from '../data/defaultData';
import { api } from '../services/api';
import {
  CommitOutcome,
  CONTROLLER_META,
  countReversals,
  detectConflicts,
  fmt,
  isReviewScenario,
  loadBenchmark,
  OFFLINE_BENCHMARK,
  prepareScenario,
  prettyText,
  PreparedRun,
  resetNetwork,
  ReviewData,
  runScenario,
  runShadow,
  commitChoice,
  ScenarioId,
  ScenarioRun,
  SCENARIOS,
  VERDICT_META,
} from './model';
import { Ghost, TowerField } from './scene/TowerField';
import {
  CellInspector,
  DecisionLog,
  KpiCompare,
  KpiStrip,
  LogEntry,
  PingPongLog,
  PingPongTimeline,
  PipelineStage,
  PolicyBenchmark,
  RefereePipeline,
} from './panels';
import { DecisionStep, ProposalsStep, ResultStep, ScenarioStep, SimulatingStep, Stepper } from './workflow';
import { ShadowWorkbench } from './workbench';

const STAGE_MS = 1100;
const FORK_MS = 520;

type Phase = 'idle' | 'proposals' | 'simulating' | 'decision' | 'done' | 'pingpong';

interface Props {
  onOpenStory: () => void;
  onOpenMath: () => void;
}

export const ControlRoom: React.FC<Props> = ({ onOpenStory, onOpenMath }) => {
  const [base, setBase] = useState<NetworkState>(DEFAULT_NETWORK_STATE);
  const [phase, setPhase] = useState<Phase>('idle');
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState<'checking' | 'live' | 'offline'>('checking');
  const [night, setNight] = useState(false);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState({ decisions: 0, unsafeBlocked: 0, reversalsBlocked: 0, reversals: 0 });
  const [bench, setBench] = useState<{ data: BenchmarkComparison; live: boolean }>({ data: OFFLINE_BENCHMARK, live: false });

  // operator-review flow
  const [scenarioId, setScenarioId] = useState<ScenarioId | null>(null);
  const [prepared, setPrepared] = useState<PreparedRun | null>(null);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<CommitOutcome | null>(null);

  // ping-pong flow
  const [ping, setPing] = useState<ScenarioRun | null>(null);
  const [pingStage, setPingStage] = useState(-1);

  /* ── boot ── */
  useEffect(() => {
    (async () => {
      try {
        await api.checkHealth();
        setBackend('live');
        setBench(await loadBenchmark());
        setBase((await resetNetwork()).state);
      } catch {
        setBackend('offline');
      }
    })();
  }, []);

  const fail = (e: any) => setError(e?.response?.data?.detail ?? e?.message ?? 'Something went wrong');

  /* ───────── review flow ───────── */
  const startReview = useCallback(async (id: ScenarioId) => {
    if (!isReviewScenario(id)) return;
    setBusy(true);
    setError(null);
    setSelectedCell(null);
    setReview(null);
    setOutcome(null);
    setChosenId(null);
    setInspectedId(null);
    setRevealed(0);
    setPing(null);
    setScenarioId(id);
    try {
      const prep = await prepareScenario(id);
      setPrepared(prep);
      setBackend(prep.source);
      setPhase('proposals');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, []);

  const runSimulation = useCallback(async () => {
    if (!prepared) return;
    setBusy(true);
    setError(null);
    try {
      const r = await runShadow(prepared);
      setReview(r);
      setRevealed(0);
      setPhase('simulating');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [prepared]);

  // reveal the forks one by one, then hand control to the operator
  useEffect(() => {
    if (phase !== 'simulating' || !review) return;
    if (revealed >= review.candidates.length) {
      const t = setTimeout(() => {
        setChosenId(review.recommended_id);
        setInspectedId(review.recommended_id ?? review.candidates[0]?.candidate_id ?? null);
        setPhase('decision');
      }, 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRevealed((n) => n + 1), revealed === 0 ? 700 : FORK_MS);
    return () => clearTimeout(t);
  }, [phase, review, revealed]);

  const choose = useCallback((id: string) => {
    setChosenId(id);
    setInspectedId(id);
  }, []);

  const apply = useCallback(async () => {
    if (!prepared || !chosenId || !review) return;
    setBusy(true);
    setError(null);
    try {
      const o = await commitChoice(prepared, chosenId);
      setOutcome(o);
      setBase(o.after);
      setPhase('done');
      const cand = review.candidates.find((c) => c.candidate_id === chosenId);
      setStats((s) => ({ ...s, decisions: s.decisions + 1, unsafeBlocked: s.unsafeBlocked + review.candidates.filter((c) => !c.is_safe).length }));
      setLog((l) => [
        {
          id: o.decision.decision_id,
          time: Date.now(),
          scenario: prepared.id,
          verdict: o.decision.verdict,
          summary: `${prettyText(cand?.description ?? o.decision.reason)}${o.wasOverride ? ' · operator override' : ' · matches recommendation'}`,
          source: prepared.source,
        },
        ...l,
      ]);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [prepared, chosenId, review]);

  /* ───────── ping-pong flow (automatic) ───────── */
  const startPing = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSelectedCell(null);
    setReview(null);
    setPrepared(null);
    setOutcome(null);
    setScenarioId('PING_PONG');
    setPingStage(-1);
    try {
      const r = await runScenario('PING_PONG');
      setBackend(r.source);
      setPing(r);
      setPhase('pingpong');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, []);

  const pingMax = ping ? ping.cycles.length : -1;
  const pingRunning = phase === 'pingpong' && !!ping && pingStage < pingMax;
  const pingDone = phase === 'pingpong' && !!ping && pingStage >= pingMax;

  useEffect(() => {
    if (!pingRunning) return;
    const t = setTimeout(() => setPingStage((s) => s + 1), pingStage < 0 ? 300 : STAGE_MS);
    return () => clearTimeout(t);
  }, [pingRunning, pingStage]);

  const loggedPing = useRef<string | null>(null);
  useEffect(() => {
    if (!ping || !pingDone || loggedPing.current === ping.runId) return;
    loggedPing.current = ping.runId;
    setBase(ping.after);
    const powers = [ping.cycles[0]?.command.current_value ?? 38, ...ping.cycles.map((c) => c.resulting_power)];
    const last = ping.cycles[ping.cycles.length - 1];
    setStats((s) => ({
      ...s,
      decisions: s.decisions + ping.cycles.length,
      reversalsBlocked: s.reversalsBlocked + ping.reversalsSuppressed,
      reversals: s.reversals + countReversals(powers),
    }));
    setLog((l) => [
      {
        id: ping.runId,
        time: Date.now(),
        scenario: 'PING_PONG',
        verdict: 'DELAY',
        summary: `${ping.cycles.length} cycles arbitrated; ${ping.reversalsSuppressed} flip-flops damped; Cell 3 held at ${fmt(last?.resulting_power, 1)} dBm`,
        source: ping.source,
      },
      ...l,
    ]);
  }, [pingDone, ping]);

  const handleRun = (id: ScenarioId) => (id === 'PING_PONG' ? startPing() : startReview(id));

  const reset = useCallback(async () => {
    setBusy(true);
    setPhase('idle');
    setPrepared(null);
    setReview(null);
    setOutcome(null);
    setPing(null);
    setPingStage(-1);
    setScenarioId(null);
    setSelectedCell(null);
    setError(null);
    const r = await resetNetwork();
    setBase(r.state);
    setBackend(r.live ? 'live' : 'offline');
    setStats({ decisions: 0, unsafeBlocked: 0, reversalsBlocked: 0, reversals: 0 });
    setLog([]);
    setBusy(false);
  }, []);

  const backToStart = useCallback(() => {
    setPhase('idle');
    setPrepared(null);
    setReview(null);
    setOutcome(null);
    setPing(null);
    setScenarioId(null);
    setSelectedCell(null);
  }, []);

  /* ───────── derived data for the scene ───────── */
  const inspected = review?.candidates.find((c) => c.candidate_id === inspectedId) ?? null;
  const chosen = review?.candidates.find((c) => c.candidate_id === chosenId) ?? null;
  const focusCell = scenarioId ? SCENARIOS[scenarioId].focus : null;

  const conflicts = useMemo(() => (prepared ? detectConflicts(prepared.commands, prepared.before.cells) : []), [prepared]);

  const view = useMemo(() => {
    const empty = { state: base, ghosts: [] as Ghost[], contested: [] as string[], spike: null as string | null };
    if (phase === 'pingpong' && ping) {
      const idx = Math.min(pingStage, ping.cycles.length - 1);
      const cells: Record<string, Cell> = JSON.parse(JSON.stringify(ping.before.cells));
      const shown = pingDone ? ping.cycles[ping.cycles.length - 1].resulting_power : idx >= 0 ? ping.cycles[idx].resulting_power : ping.cycles[0].command.current_value;
      cells[ping.focusCell].tx_power_dbm = shown;
      const cyc = idx >= 0 && !pingDone ? ping.cycles[idx] : null;
      return {
        state: { ...ping.before, cells },
        ghosts: cyc
          ? [{ cellId: ping.focusCell, powerDbm: cyc.command.proposed_value, color: CONTROLLER_META[cyc.command.controller_id].color, label: `Cycle ${cyc.cycle}: ${CONTROLLER_META[cyc.command.controller_id].label} → ${fmt(cyc.command.proposed_value, 0)} dBm · ${cyc.verdict}` }]
          : [],
        contested: pingDone ? [] : [ping.focusCell],
        spike: null,
      };
    }
    if (!prepared) return empty;
    const spike = prepared.id === 'TRAFFIC_SPIKE' ? 'CELL_02' : null;
    if (phase === 'done' && outcome) return { ...empty, state: outcome.after, spike };
    if (phase === 'decision' && inspected) {
      const color = inspected.is_safe ? '#60a5fa' : '#f87171';
      return {
        state: prepared.before,
        ghosts: inspected.changes.map((ch) => ({
          cellId: ch.cell_id,
          powerDbm: ch.to_status === 'SHUTDOWN' ? 0 : ch.to_dbm,
          color,
          label: `Fork ${inspected.label}: ${ch.to_status === 'SHUTDOWN' ? 'switched off' : `${fmt(ch.to_dbm, 1)} dBm`}${inspected.is_safe ? '' : ' · blocked'}`,
        })),
        contested: [],
        spike,
      };
    }
    // proposals / simulating: show what each controller asked for
    return {
      state: prepared.before,
      ghosts: prepared.commands.map((c) => ({
        cellId: c.target_cell,
        powerDbm: c.action_type === 'SHUTDOWN' ? 0 : c.proposed_value,
        color: CONTROLLER_META[c.controller_id].color,
        label: `${CONTROLLER_META[c.controller_id].label}: ${c.action_type === 'SHUTDOWN' ? 'shut down' : `${fmt(c.proposed_value, 1)} dBm`}`,
      })),
      contested: [...new Set(prepared.commands.map((c) => c.target_cell))],
      spike,
    };
  }, [base, phase, prepared, ping, pingStage, pingDone, inspected, outcome]);

  /* ───────── ping-pong pipeline stages ───────── */
  const pingStages: PipelineStage[] = useMemo(() => {
    if (!ping) return [];
    const list: PipelineStage[] = ping.cycles.map((c) => ({
      key: `c${c.cycle}`,
      title: `Cycle ${c.cycle} · ${CONTROLLER_META[c.command.controller_id].label} → ${fmt(c.command.proposed_value, 0)} dBm`,
      icon: <span className="text-[10px] font-bold cr-mono">{c.cycle}</span>,
      tone: c.verdict === 'APPROVE' ? 'ok' : 'warn',
      output: (
        <span>
          <b style={{ color: VERDICT_META[c.verdict].color }}>{c.verdict}</b> — {c.reason.replace('Decision postponed by Stability Engine: ', '')}
        </span>
      ),
    }));
    const last = ping.cycles[ping.cycles.length - 1];
    list.push({
      key: 'final',
      title: 'Network stabilised',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      tone: 'ok',
      output: `Cell 3 held at ${fmt(last.resulting_power, 1)} dBm · coverage ${fmt(last.coverage, 1)}% · ${ping.reversalsSuppressed} flip-flops damped`,
    });
    return list;
  }, [ping]);

  /* ───────── KPIs ───────── */
  const liveMetrics = phase === 'done' && outcome ? outcome.metrics : phase === 'pingpong' && ping ? (pingDone ? ping.afterMetrics : ping.beforeMetrics) : prepared && phase !== 'idle' ? prepared.before.metrics : base.metrics;
  const predictedMetrics = phase === 'decision' && chosen ? chosen.predicted_metrics : null;

  const step = phase === 'idle' ? 0 : phase === 'proposals' ? 1 : phase === 'simulating' ? 2 : phase === 'decision' ? 3 : phase === 'done' ? 4 : pingDone ? 4 : 2;

  const sceneTitle =
    phase === 'idle'
      ? 'Live network — all controllers idle'
      : phase === 'pingpong'
        ? 'Controllers flip-flop Cell 3'
        : prepared
          ? SCENARIOS[prepared.id].short
          : '';
  const sceneSub =
    phase === 'proposals'
      ? 'Dashed rings show what each controller asked for'
      : phase === 'simulating'
        ? 'Testing every option on a private copy'
        : phase === 'decision'
          ? inspected
            ? `Previewing Fork ${inspected.label} — dashed ring is the predicted coverage`
            : 'Pick an action'
          : phase === 'done'
            ? 'Decision applied — network updated'
            : phase === 'pingpong'
              ? pingDone
                ? 'Stabilised — network updated'
                : `Cycle ${Math.max(1, pingStage + 1)} of ${ping?.cycles.length ?? 6}`
              : 'Pick a scenario on the right to begin';

  const selected = selectedCell ? view.state.cells[selectedCell] : null;
  const showWorkbench = !!prepared && (phase === 'simulating' || phase === 'decision' || phase === 'done');

  return (
    <div className="cr-root min-h-screen text-slate-100">
      {/* ───────── Header ───────── */}
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#0a0f1a]/95 backdrop-blur">
        <div className="max-w-[1500px] mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-sky-400 grid place-items-center">
              <ShieldCheck className="w-[18px] h-[18px] text-slate-900" strokeWidth={2.4} />
            </div>
            <div className="leading-tight">
              <div className="font-bold tracking-tight text-[15.5px]">RANGUARD</div>
              <div className="text-[11px] text-slate-400">Network controller arbitration</div>
            </div>
          </div>

          <Stepper step={step} />

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`hidden sm:flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1 rounded-full border ${
                backend === 'live' ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10' : 'text-slate-300 border-white/10 bg-white/[0.04]'
              }`}
              title={backend === 'offline' ? 'Backend not reachable — replaying recorded seed-42 engine outputs' : 'Connected to the FastAPI engine'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${backend === 'live' ? 'bg-emerald-400' : 'bg-slate-400'}`} />
              {backend === 'live' ? 'Live engine' : backend === 'offline' ? 'Offline replay' : 'Connecting…'}
            </span>
            <button onClick={onOpenMath} className="flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/[0.06] text-slate-300">
              <BookOpen className="w-3.5 h-3.5" /> <span className="hidden md:inline">Math</span>
            </button>
            <button onClick={onOpenStory} className="flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/[0.06] text-slate-300">
              <Clapperboard className="w-3.5 h-3.5" /> <span className="hidden md:inline">3D story</span>
            </button>
            <button onClick={reset} disabled={busy} className="text-[12.5px] font-medium px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/[0.06] text-slate-300 disabled:opacity-50" title="Reset network to seed 42 and clear session stats">
              Reset
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-4 md:px-6 py-5 space-y-4">
        {error && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-rose-400/35 bg-rose-500/10 px-4 py-2.5 text-[13px] text-rose-100">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <KpiStrip
          committed={liveMetrics}
          predicted={predictedMetrics}
          reversals={stats.reversals}
          reversalsBlocked={stats.reversalsBlocked}
          decisions={stats.decisions}
          unsafeBlocked={stats.unsafeBlocked}
        />

        {/* ───────── Scene + workflow ───────── */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          <div className="xl:col-span-8 xl:sticky xl:top-[72px]">
            <div className="cr-panel overflow-hidden relative h-[440px] md:h-[560px] !p-0">
              <TowerField
                cells={view.state.cells}
                users={view.state.users}
                focusCell={selectedCell ?? focusCell}
                selectedCell={selectedCell}
                onSelectCell={setSelectedCell}
                contested={view.contested}
                ghosts={view.ghosts}
                spikeCell={view.spike}
                night={night}
                autoRotate={phase === 'idle' && !selectedCell}
              />

              <div className="absolute top-4 left-4 max-w-[62%] pointer-events-none">
                <div className="rounded-lg bg-[#0a0f1a]/85 border border-white/10 px-3.5 py-2.5">
                  <div className="text-[11px] text-slate-400">Simulated network · 6 towers · {view.state.users.length} users</div>
                  <div className="text-[14.5px] font-semibold text-slate-100 mt-0.5">{sceneTitle}</div>
                  <div className="text-[12px] text-slate-400 mt-0.5">{sceneSub}</div>
                </div>
              </div>

              <div className="absolute top-4 right-4">
                {selected ? (
                  <CellInspector cell={selected} contested={view.contested.includes(selected.cell_id)} onClose={() => setSelectedCell(null)} />
                ) : (
                  <div className="hidden md:flex items-center gap-1.5 text-[11.5px] text-slate-300 rounded-lg bg-[#0a0f1a]/80 border border-white/10 px-2.5 py-1.5 pointer-events-none">
                    <MousePointerClick className="w-3.5 h-3.5" /> Click a tower · drag to orbit · scroll to zoom
                  </div>
                )}
              </div>

              <div className="absolute bottom-4 left-4 rounded-lg bg-[#0a0f1a]/85 border border-white/10 px-3 py-2 text-[11px] text-slate-300 flex flex-wrap gap-x-3.5 gap-y-1 max-w-[calc(100%-80px)] pointer-events-none">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />Healthy</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Warning</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400" />Unsafe</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-1 rounded-full bg-sky-100" />User</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-1 rounded-full bg-rose-500" />Uncovered</span>
                <span className="flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-slate-200" />Proposed coverage</span>
              </div>

              <button
                onClick={() => setNight((n) => !n)}
                className="absolute bottom-4 right-4 w-9 h-9 grid place-items-center rounded-lg bg-[#0a0f1a]/85 border border-white/10 hover:bg-white/10 text-slate-200"
                title={night ? 'Daylight' : 'Night'}
                aria-label="Toggle night mode"
              >
                {night ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="xl:col-span-4 flex flex-col gap-4">
            {phase === 'idle' && <ScenarioStep busy={busy} onRun={handleRun} />}
            {phase === 'proposals' && prepared && (
              <ProposalsStep description={prepared.description} commands={prepared.commands} conflicts={conflicts} onNext={runSimulation} busy={busy} />
            )}
            {phase === 'simulating' && <SimulatingStep revealed={revealed} total={review?.candidates.length ?? 0} />}
            {phase === 'decision' && review && <DecisionStep review={review} chosenId={chosenId} onChoose={choose} onApply={apply} busy={busy} />}
            {phase === 'done' && outcome && (
              <ResultStep
                outcome={outcome}
                applied={review?.candidates.find((c) => c.candidate_id === chosenId)}
                before={prepared!.before.metrics}
                onAgain={backToStart}
              />
            )}
            {phase === 'pingpong' && ping && (
              <>
                <RefereePipeline stages={pingStages} current={pingStage} running={pingRunning} onSkip={() => setPingStage(pingMax)} source={ping.source} />
                {pingDone && (
                  <button onClick={backToStart} className="w-full h-11 rounded-lg font-semibold text-[14px] bg-sky-400 hover:bg-sky-300 text-slate-900">
                    Try another scenario
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ───────── Shadow simulation workbench ───────── */}
        {showWorkbench && (
          <ShadowWorkbench
            review={review}
            revealed={revealed}
            total={review?.candidates.length ?? 0}
            chosenId={chosenId}
            inspectedId={inspectedId}
            appliedId={phase === 'done' ? chosenId : null}
            locked={phase === 'done'}
            onChoose={choose}
            onInspect={setInspectedId}
          />
        )}

        {phase === 'pingpong' && ping && pingStage >= 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 cr-fade-in">
            <div className="lg:col-span-7">
              <PingPongTimeline cycles={ping.cycles} revealed={pingStage} reversalsSuppressed={ping.reversalsSuppressed} />
            </div>
            <div className="lg:col-span-5">
              <PingPongLog cycles={ping.cycles} revealed={Math.min(pingStage, ping.cycles.length - 1)} />
            </div>
          </div>
        )}

        {phase === 'done' && outcome && prepared ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7">
                <KpiCompare before={prepared.before.metrics} predicted={chosen?.predicted_metrics ?? null} after={outcome.metrics} committed />
              </div>
              <div className="lg:col-span-5">
                <DecisionLog entries={log} />
              </div>
            </div>
            <PolicyBenchmark data={bench.data} live={bench.live} />
          </>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8">
              <PolicyBenchmark data={bench.data} live={bench.live} />
            </div>
            <div className="lg:col-span-4">
              <DecisionLog entries={log} />
            </div>
          </div>
        )}

        <footer className="pt-2 pb-6 text-center text-[11.5px] text-slate-500">
          RANGUARD v1.0 · Conflict-resolution referee for mobile network controllers · Team Arigato Algorithms · SW-31
        </footer>
      </main>
    </div>
  );
};
