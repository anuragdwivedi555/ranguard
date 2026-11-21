import React, { useState, useEffect, useCallback } from 'react';
import { api } from './services/api';
import {
  NetworkState,
  ControllerCommand,
  RefereeDecision,
  ConflictReport,
  BenchmarkComparison,
  CandidateAction,
  MLStatus,
} from './types';
import { Header } from './components/Header';
import { KpiCards } from './components/KpiCards';
import { NetworkTopology } from './components/NetworkTopology';
import { ControllerCommands } from './components/ControllerCommands';
import { ConflictPanel } from './components/ConflictPanel';
import { ShadowSimulation } from './components/ShadowSimulation';
import { VerdictBanner } from './components/VerdictBanner';
import { ScenarioControls } from './components/ScenarioControls';
import { BaselineComparison } from './components/BaselineComparison';
import { DecisionHistory } from './components/DecisionHistory';

export default function App() {
  const [networkState, setNetworkState] = useState<NetworkState | null>(null);
  const [commands, setCommands] = useState<ControllerCommand[]>([]);
  const [currentDecision, setCurrentDecision] = useState<RefereeDecision | null>(null);
  const [history, setHistory] = useState<RefereeDecision[]>([]);
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkComparison | null>(null);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [mlStatus, setMlStatus] = useState<MLStatus | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Load state and evaluate current cycle
  const refreshNetworkData = useCallback(async () => {
    try {
      const state = await api.getNetworkState();
      setNetworkState(state);
      setIsBackendHealthy(true);

      const cmds = await api.getControllerCommands();
      setCommands(cmds);

      if (cmds.length > 0) {
        const dec = await api.evaluateProposals(cmds);
        setCurrentDecision(dec);
      } else {
        // Evaluate empty state
        const dec = await api.evaluateProposals([]);
        setCurrentDecision(dec);
      }

      const hist = await api.getRefereeHistory(20);
      setHistory(hist);

      try {
        const ml = await api.getMLStatus();
        setMlStatus(ml);
      } catch (e) {
        // ML route optional fallback
      }
    } catch (err) {
      console.error('Failed to refresh network state:', err);
      setIsBackendHealthy(false);
    }
  }, []);

  useEffect(() => {
    refreshNetworkData();
  }, [refreshNetworkData]);

  // Handler: Reset Simulation
  const handleReset = async () => {
    setIsLoading(true);
    try {
      await api.resetSimulation(42);
      await refreshNetworkData();
      showNotification('Simulation reset to deterministic initial seed (42).');
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Step Cycle
  const handleStep = async () => {
    setIsLoading(true);
    try {
      await api.stepSimulation();
      await refreshNetworkData();
      showNotification('Advanced simulation by 1 cycle.');
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Arbitrate current proposals
  const handleEvaluate = async () => {
    setIsLoading(true);
    try {
      const dec = await api.evaluateProposals(commands);
      setCurrentDecision(dec);
      showNotification(`Referee evaluated proposals: Verdict = ${dec.verdict}`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Commit Decision
  const handleCommit = async () => {
    if (!currentDecision) return;
    setIsLoading(true);
    try {
      const res = await api.commitDecision(currentDecision);
      await refreshNetworkData();
      showNotification(`Committed: ${res.message}`);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Commit failed.';
      showNotification(`Error: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Run Scenario
  const handleRunScenario = async (scenario: 'CELL_SHUTDOWN' | 'TRAFFIC_SPIKE' | 'PING_PONG') => {
    setIsLoading(true);
    try {
      const res = await api.runScenario(scenario);
      await refreshNetworkData();
      if (res.decision) {
        setCurrentDecision(res.decision);
      }
      showNotification(`Executed Scenario: ${res.scenario} -> ${res.decision?.verdict || 'DONE'}`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Run Benchmark
  const handleRunBenchmark = async () => {
    setIsLoading(true);
    try {
      const bench = await api.runBenchmarkComparison(42, 4);
      setBenchmarkData(bench);
      showNotification('3-Policy benchmark completed with measured results.');
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Toggle Predictive ML Advisory
  const handleToggleML = async () => {
    setIsLoading(true);
    try {
      const targetState = !(mlStatus?.ml_enabled ?? true);
      const updated = await api.toggleML(targetState);
      setMlStatus(updated);
      await refreshNetworkData();
      showNotification(`Predictive ML Advisory toggled ${updated.ml_enabled ? 'ON' : 'OFF'}.`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Derive active conflicts from evaluated decision or command pairs
  const conflicts: ConflictReport[] = [];
  if (commands.length > 1 && networkState) {
    const byCell: Record<string, ControllerCommand[]> = {};
    for (const c of commands) {
      if (!byCell[c.target_cell]) byCell[c.target_cell] = [];
      byCell[c.target_cell].push(c);
    }
    for (const [cid, cellCmds] of Object.entries(byCell)) {
      if (cellCmds.length > 1) {
        conflicts.push({
          conflict_id: `CONF-${cid}`,
          conflict_type: 'DIRECT',
          involved_controllers: Array.from(new Set(cellCmds.map((c) => c.controller_id))),
          affected_cells: [cid],
          conflicting_commands: cellCmds,
          affected_kpis: ['COVERAGE', 'ENERGY', 'SINR'],
          severity: cellCmds.some((c) => c.action_type === 'SHUTDOWN') ? 'CRITICAL' : 'HIGH',
          explanation: `Direct collision on ${cid}: Multiple controllers proposed conflicting actions simultaneously.`,
        });
      }
    }
  }

  // Shadow candidates from current decision
  const candidates: CandidateAction[] = [];
  if (currentDecision?.selected_candidate) {
    candidates.push(currentDecision.selected_candidate);
  }
  if (currentDecision?.rejected_alternatives) {
    for (const alt of currentDecision.rejected_alternatives) {
      candidates.push({
        candidate_id: alt.candidate_id,
        description: alt.description,
        target_cell: '',
        proposed_power: 0,
        proposed_status: '',
        joint_actions: {},
        predicted_metrics: {
          coverage_percentage: alt.is_safe ? 96.0 : 88.0,
          avg_sinr_db: 15.0,
          min_sinr_db: 1.0,
          avg_rsrp_dbm: -75.0,
          total_energy: 65.0,
          interference_level: 25.0,
          active_cells: 5,
          total_cells: 6,
          connected_users: 90,
          uncovered_users: 10,
          cell_utilization: 0.5,
          safety_violations: alt.violated_constraints,
        },
        is_safe: alt.is_safe,
        violated_constraints: alt.violated_constraints,
        objective_score: alt.objective_score,
        energy_score: 0,
        interference_score: 0,
        coverage_score: 0,
        change_score: 0,
        explanation: alt.is_safe ? 'Safe alternative' : 'Hard safety breached',
      });
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0d14] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Header */}
      <Header
        cycle={networkState?.cycle || 1}
        stateVersion={networkState?.state_version || 1}
        isBackendHealthy={isBackendHealthy}
        mlEnabled={mlStatus?.ml_enabled ?? true}
        onToggleML={handleToggleML}
        onReset={handleReset}
        onStep={handleStep}
        onRunBenchmark={handleRunBenchmark}
        isLoading={isLoading}
      />

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-4 right-4 z-50 bg-cyan-950 text-cyan-200 border border-cyan-500/50 px-4 py-2.5 rounded-lg shadow-xl font-mono text-xs flex items-center gap-2 animate-bounce">
          <span className="w-2 h-2 rounded-full bg-cyan-400" />
          {notification}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-4">
        {/* Row 1: KPI Overview Cards */}
        <KpiCards metrics={networkState?.metrics || null} />

        {/* Row 2: Prominent Arbitration Verdict Banner */}
        <VerdictBanner
          decision={currentDecision}
          onCommit={handleCommit}
          isLoading={isLoading}
        />

        {/* Row 3: Network Topology (Left) + Controllers & Conflicts (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Topology */}
          <div className="lg:col-span-7">
            <NetworkTopology
              cells={networkState?.cells || {}}
              users={networkState?.users || []}
              selectedCellId={selectedCellId}
              onSelectCell={setSelectedCellId}
            />
          </div>

          {/* Controllers & Conflicts Stack */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <ControllerCommands
              commands={commands}
              onEvaluate={handleEvaluate}
              isLoading={isLoading}
            />
            <ConflictPanel conflicts={conflicts} />
          </div>
        </div>

        {/* Row 4: Shadow Simulation Candidates */}
        <ShadowSimulation
          candidates={candidates}
          selectedCandidateId={currentDecision?.selected_candidate?.candidate_id}
        />

        {/* Row 5: Mandatory Demonstration Scenarios */}
        <ScenarioControls
          onRunScenario={handleRunScenario}
          isLoading={isLoading}
        />

        {/* Row 6: 3-Policy Comparative Benchmark */}
        <BaselineComparison
          comparisonData={benchmarkData}
          onRefresh={handleRunBenchmark}
          isLoading={isLoading}
        />

        {/* Row 7: Decision Audit History */}
        <DecisionHistory history={history} />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/60 py-4 px-6 text-center text-xs font-mono text-slate-500">
        RANGUARD v1.0.0 — Autonomous Mobile Network Conflict-Resolution Referee | Team: Arigato Algorithms | Problem Statement: SW-31
      </footer>
    </div>
  );
}
