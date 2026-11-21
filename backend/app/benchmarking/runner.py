"""Reproducible Benchmark Runner for RANGUARD.

Supports:
- Configurable random seeds
- Configurable simulation cycles
- Scenario selection (CELL_SHUTDOWN, TRAFFIC_SPIKE, PING_PONG)
- Traffic source selection (SYNTHETIC, MILAN_REPLAY)
- Three arbitration policies (NO_REFEREE, FIXED_PRIORITY, RANGUARD)
- Rigorous state isolation, fair comparisons, and structured CSV/JSON exports.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
import time
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from pydantic import BaseModel, Field

from ..simulation.network_engine import NetworkEngine
from ..simulation.traffic_provider import (
    TrafficMode,
    SyntheticTrafficProvider,
    MilanReplayTrafficProvider,
)
from ..controllers.controller_manager import ControllerManager
from ..models.command import ControllerCommand
from ..models.metrics import NetworkMetrics
from ..referee.arbitration_engine import ArbitrationEngine
from ..referee.commit_manager import CommitManager
from ..referee.guardrails import SafetyGuardrails
from ..referee.stability_manager import StabilityManager
from ..simulation.state_manager import StateManager
from ..services.history_service import HistoryService


class PolicyType(str, Enum):
    NO_REFEREE = "NO_REFEREE"
    FIXED_PRIORITY = "FIXED_PRIORITY"
    RANGUARD = "RANGUARD"


class ScenarioType(str, Enum):
    CELL_SHUTDOWN = "CELL_SHUTDOWN"
    TRAFFIC_SPIKE = "TRAFFIC_SPIKE"
    PING_PONG = "PING_PONG"


class BenchmarkConfig(BaseModel):
    """Configuration for reproducible experimental benchmark matrices."""
    seeds: List[int] = Field(default_factory=lambda: [42, 43, 44, 45, 46, 47, 48, 49, 50, 51])
    cycles_per_run: int = Field(default=30)
    scenarios: List[ScenarioType] = Field(
        default_factory=lambda: [
            ScenarioType.CELL_SHUTDOWN,
            ScenarioType.TRAFFIC_SPIKE,
            ScenarioType.PING_PONG,
        ]
    )
    policies: List[PolicyType] = Field(
        default_factory=lambda: [
            PolicyType.NO_REFEREE,
            PolicyType.FIXED_PRIORITY,
            PolicyType.RANGUARD,
        ]
    )
    traffic_mode: TrafficMode = Field(default=TrafficMode.SYNTHETIC)
    milan_data_path: Optional[Path] = None
    results_dir: Path = Field(default=Path("results"))


class RunRecord(BaseModel):
    """Structured record of a single benchmark run."""
    seed: int
    scenario: str
    policy: str
    traffic_source: str
    cycles_completed: int
    mean_coverage_pct: float
    min_coverage_pct: float
    final_coverage_pct: float
    mean_sinr_db: float
    min_sinr_db: float
    mean_power_watts: float
    cumulative_energy_wh: float
    cumulative_energy_joules: float
    mean_cell_utilization: float
    total_interference_index: float
    safety_violations_count: int
    control_reversals_count: int
    between_cycle_reversals_count: int = 0
    within_cycle_reversals_count: int = 0
    proposed_reversals_count: int = 0
    median_arbitration_latency_ms: float
    p95_arbitration_latency_ms: float
    decisions_approved: int = 0
    decisions_modified: int = 0
    decisions_delayed: int = 0
    decisions_rejected: int = 0


class BenchmarkRunner:
    """Orchestrates reproducible multi-run benchmarking across policies and seeds."""

    PRIORITY_HIERARCHY: Dict[str, int] = {
        "COVERAGE": 3,
        "INTERFERENCE": 2,
        "ENERGY": 1,
    }

    def __init__(self, config: Optional[BenchmarkConfig] = None):
        self.config = config or BenchmarkConfig()

    def create_traffic_provider(self, mode: TrafficMode) -> Any:
        if mode == TrafficMode.MILAN_REPLAY:
            return MilanReplayTrafficProvider(data_path=self.config.milan_data_path)
        return SyntheticTrafficProvider()

    def get_scenario_disturbance_commands(
        self,
        scenario: ScenarioType,
        cycle: int,
        cells: Dict[str, Any],
    ) -> List[ControllerCommand]:
        """Generates scenario-specific exogenous disturbance commands."""
        cmds: List[ControllerCommand] = []

        if scenario == ScenarioType.CELL_SHUTDOWN:
            # Cycle 1: Aggressive shutdown intent on CELL_03
            if cycle == 1 and "CELL_03" in cells:
                c3 = cells["CELL_03"]
                cmds.append(
                    ControllerCommand(
                        command_id=f"SCEN-SHUTDOWN-C{cycle}",
                        controller_id="ENERGY",
                        target_cell="CELL_03",
                        action_type="SHUTDOWN",
                        current_value=c3.tx_power_dbm,
                        proposed_value=0.0,
                        delta=-c3.tx_power_dbm,
                        reason="Energy Controller attempts shutdown to cut base power.",
                        priority=8,
                        cycle=cycle,
                    )
                )

        elif scenario == ScenarioType.TRAFFIC_SPIKE:
            # Every 10 cycles, simulate localized traffic burst on CELL_02
            if cycle % 10 == 1 and "CELL_02" in cells and "CELL_05" in cells:
                c2 = cells["CELL_02"]
                c5 = cells["CELL_05"]
                cmds.append(
                    ControllerCommand(
                        command_id=f"SCEN-SPIKE-COV-C{cycle}",
                        controller_id="COVERAGE",
                        target_cell="CELL_02",
                        action_type="POWER_UP",
                        current_value=c2.tx_power_dbm,
                        proposed_value=min(46.0, c2.tx_power_dbm + 3.0),
                        delta=3.0,
                        reason="Coverage boost needed due to edge spike on CELL_02.",
                        priority=7,
                        cycle=cycle,
                    )
                )
                cmds.append(
                    ControllerCommand(
                        command_id=f"SCEN-SPIKE-INT-C{cycle}",
                        controller_id="INTERFERENCE",
                        target_cell="CELL_02",
                        action_type="POWER_DOWN",
                        current_value=c2.tx_power_dbm,
                        proposed_value=max(10.0, c2.tx_power_dbm - 2.0),
                        delta=-2.0,
                        reason="Excessive radiated interference from CELL_02 into adjacent clusters.",
                        priority=6,
                        cycle=cycle,
                    )
                )
                cmds.append(
                    ControllerCommand(
                        command_id=f"SCEN-SPIKE-NRG-C{cycle}",
                        controller_id="ENERGY",
                        target_cell="CELL_05",
                        action_type="POWER_DOWN",
                        current_value=c5.tx_power_dbm,
                        proposed_value=max(10.0, c5.tx_power_dbm - 3.0),
                        delta=-3.0,
                        reason="Trim low-demand CELL_05 power to offset spike load.",
                        priority=5,
                        cycle=cycle,
                    )
                )

        elif scenario == ScenarioType.PING_PONG:
            # Periodic alternating opposite power proposals on CELL_03 every cycle
            if "CELL_03" in cells:
                c3 = cells["CELL_03"]
                if cycle % 2 == 1:
                    cmds.append(
                        ControllerCommand(
                            command_id=f"SCEN-PP-UP-C{cycle}",
                            controller_id="COVERAGE",
                            target_cell="CELL_03",
                            action_type="POWER_UP",
                            current_value=c3.tx_power_dbm,
                            proposed_value=min(46.0, c3.tx_power_dbm + 3.0),
                            delta=3.0,
                            reason="Ping-pong coverage restoration.",
                            priority=7,
                            cycle=cycle,
                        )
                    )
                else:
                    cmds.append(
                        ControllerCommand(
                            command_id=f"SCEN-PP-DOWN-C{cycle}",
                            controller_id="ENERGY",
                            target_cell="CELL_03",
                            action_type="POWER_DOWN",
                            current_value=c3.tx_power_dbm,
                            proposed_value=max(10.0, c3.tx_power_dbm - 4.0),
                            delta=-4.0,
                            reason="Ping-pong energy conservation trim.",
                            priority=6,
                            cycle=cycle,
                        )
                    )

        return cmds

    def run_single_experiment(
        self,
        seed: int,
        scenario: ScenarioType,
        policy: PolicyType,
        cycles: int = 30,
        traffic_mode: TrafficMode = TrafficMode.SYNTHETIC,
    ) -> RunRecord:
        """Executes a single completely isolated benchmark run under fair identical conditions."""
        # Setup independent traffic provider and network engine
        provider = self.create_traffic_provider(traffic_mode)
        net = NetworkEngine(seed=seed, traffic_provider=provider)
        ctrl_mgr = ControllerManager()

        # Telemetry accumulators
        coverage_series: List[float] = []
        sinr_series: List[float] = []
        power_series: List[float] = []
        utilization_series: List[float] = []
        interference_series: List[float] = []
        latencies_ms: List[float] = []
        safety_violations_total: int = 0
        reversals_total: int = 0

        verdict_counts = {"APPROVE": 0, "MODIFY": 0, "DELAY": 0, "REJECT": 0}

        # Policy-specific apparatus
        cell_last_delta: Dict[str, float] = {}
        cell_prev_nonzero_delta: Dict[str, float] = {}
        within_cycle_revs: int = 0
        between_cycle_revs: int = 0
        proposed_revs: int = 0

        if policy == PolicyType.RANGUARD:
            arbitrator = ArbitrationEngine()
            isolated_history = HistoryService()
            commit_mgr = CommitManager(
                arbitrator.guardrails,
                arbitrator.stability_manager,
                history_service=isolated_history,
            )
            state_mgr = StateManager(seed=seed)
            state_mgr.network = net

        # Main execution loop across cycles
        for cycle in range(1, cycles + 1):
            pwr_start = {cid: cell.tx_power_dbm for cid, cell in net.cells.items()}

            # 1. Collect autonomous controller proposals from current state
            autonomous_cmds = ctrl_mgr.generate_all_proposals(
                net.cells, net.users, net.metrics, net.cycle
            )

            # 2. Add scenario disturbance commands
            scenario_cmds = self.get_scenario_disturbance_commands(scenario, cycle, net.cells)

            all_incoming_cmds = scenario_cmds + autonomous_cmds

            # 3. Execute according to chosen policy
            t0 = time.perf_counter()

            if policy == PolicyType.NO_REFEREE:
                # Blind sequential execution of commands in incoming order
                intra_last_delta: Dict[str, float] = {}
                for cmd in all_incoming_cmds:
                    cid = cmd.target_cell
                    if cid in net.cells:
                        delta = cmd.proposed_value - net.cells[cid].tx_power_dbm
                        # Within-cycle reversal tracking (intra-cycle actuator thrashing)
                        if cid in intra_last_delta:
                            prev_d = intra_last_delta[cid]
                            if (prev_d > 0 and delta < 0) or (prev_d < 0 and delta > 0):
                                within_cycle_revs += 1
                        intra_last_delta[cid] = delta

                        if cmd.action_type == "SHUTDOWN":
                            net.apply_action(cid, status="SHUTDOWN", tx_power_dbm=0.0)
                        else:
                            net.apply_action(cid, status="ACTIVE", tx_power_dbm=cmd.proposed_value)

                latencies_ms.append((time.perf_counter() - t0) * 1000.0)

            elif policy == PolicyType.FIXED_PRIORITY:
                # Filter commands: highest priority controller wins per cell
                cmds_by_cell = {}
                for cmd in all_incoming_cmds:
                    cid = cmd.target_cell
                    prio = self.PRIORITY_HIERARCHY.get(cmd.controller_id, 0)
                    if cid not in cmds_by_cell or prio > self.PRIORITY_HIERARCHY.get(cmds_by_cell[cid].controller_id, 0):
                        cmds_by_cell[cid] = cmd

                for cid, winning_cmd in cmds_by_cell.items():
                    if cid in net.cells:
                        if winning_cmd.action_type == "SHUTDOWN":
                            net.apply_action(cid, status="SHUTDOWN", tx_power_dbm=0.0)
                        else:
                            net.apply_action(cid, status="ACTIVE", tx_power_dbm=winning_cmd.proposed_value)

                latencies_ms.append((time.perf_counter() - t0) * 1000.0)

            elif policy == PolicyType.RANGUARD:
                # 5-stage arbitration engine with shadow simulation and guardrails
                decision = arbitrator.arbitrate(net, all_incoming_cmds)
                commit_mgr.commit_decision(decision, state_mgr)
                latencies_ms.append((time.perf_counter() - t0) * 1000.0)

                v = decision.verdict
                if v in verdict_counts:
                    verdict_counts[v] += 1

            # End-of-cycle executed reversal tracking across physical base stations
            for cid, cell in net.cells.items():
                net_delta = round(cell.tx_power_dbm - pwr_start[cid], 2)
                if abs(net_delta) > 0.05:
                    if cid in cell_prev_nonzero_delta:
                        prev_d = cell_prev_nonzero_delta[cid]
                        if (prev_d > 0 and net_delta < 0) or (prev_d < 0 and net_delta > 0):
                            between_cycle_revs += 1
                    cell_prev_nonzero_delta[cid] = net_delta

            # 4. Check safety violations on post-execution state
            if net.metrics.coverage_percentage < 95.0:
                safety_violations_total += 1

            # 5. Record cycle KPIs
            m = net.metrics
            coverage_series.append(m.coverage_percentage)
            sinr_series.append(m.avg_sinr_db)
            power_series.append(m.total_energy)
            utilization_series.append(m.cell_utilization)
            interference_series.append(m.interference_level)

            # Advance cycle: commit_mgr.commit_decision already advances state_mgr.network
            if policy != PolicyType.RANGUARD:
                net.step()

        if policy == PolicyType.RANGUARD:
            proposed_revs = arbitrator.stability_manager.reversal_count

        total_executed_revs = between_cycle_revs + within_cycle_revs

        return RunRecord(
            seed=seed,
            scenario=scenario.value,
            policy=policy.value,
            traffic_source=traffic_mode.value,
            cycles_completed=cycles,
            mean_coverage_pct=round(float(np.mean(coverage_series)), 2),
            min_coverage_pct=round(float(np.min(coverage_series)), 2),
            final_coverage_pct=round(coverage_series[-1], 2),
            mean_sinr_db=round(float(np.mean(sinr_series)), 2),
            min_sinr_db=round(float(np.min(sinr_series)), 2),
            mean_power_watts=round(float(np.mean(power_series)), 2),
            cumulative_energy_wh=round(net.cumulative_energy_wh, 4),
            cumulative_energy_joules=round(net.cumulative_energy_joules, 2),
            mean_cell_utilization=round(float(np.mean(utilization_series)), 3),
            total_interference_index=round(float(np.mean(interference_series)), 2),
            safety_violations_count=safety_violations_total,
            control_reversals_count=total_executed_revs,
            between_cycle_reversals_count=between_cycle_revs,
            within_cycle_reversals_count=within_cycle_revs,
            proposed_reversals_count=proposed_revs,
            median_arbitration_latency_ms=round(float(np.median(latencies_ms)), 2),
            p95_arbitration_latency_ms=round(float(np.percentile(latencies_ms, 95)), 2),
            decisions_approved=verdict_counts["APPROVE"],
            decisions_modified=verdict_counts["MODIFY"],
            decisions_delayed=verdict_counts["DELAY"],
            decisions_rejected=verdict_counts["REJECT"],
        )

    def run_matrix(self) -> List[RunRecord]:
        """Runs the complete experiment matrix across all configured seeds, scenarios, and policies."""
        records: List[RunRecord] = []
        total_runs = (
            len(self.config.seeds)
            * len(self.config.scenarios)
            * len(self.config.policies)
        )
        print(f"Starting Benchmark Matrix: {total_runs} total runs...")

        idx = 0
        for scenario in self.config.scenarios:
            for seed in self.config.seeds:
                for policy in self.config.policies:
                    idx += 1
                    t_start = time.perf_counter()
                    record = self.run_single_experiment(
                        seed=seed,
                        scenario=scenario,
                        policy=policy,
                        cycles=self.config.cycles_per_run,
                        traffic_mode=self.config.traffic_mode,
                    )
                    records.append(record)
                    duration = time.perf_counter() - t_start
                    if idx % 15 == 0 or idx == total_runs:
                        print(
                            f"[{idx}/{total_runs}] Done: {scenario.value} | Seed {seed} | {policy.value} "
                            f"(Cov: {record.mean_coverage_pct}%, Pwr: {record.mean_power_watts}W, Violations: {record.safety_violations_count}, RunTime: {duration:.2f}s)"
                        )

        return records

    def save_results(
        self,
        records: List[RunRecord],
        output_dir: Optional[Path] = None,
    ) -> Tuple[Path, Path]:
        """Saves structured records to CSV and JSON files in results_dir."""
        target_dir = output_dir or self.config.results_dir
        target_dir.mkdir(parents=True, exist_ok=True)

        csv_path = target_dir / "benchmark_experiments_summary.csv"
        json_path = target_dir / "benchmark_experiments_results.json"

        # 1. Write CSV
        if records:
            fieldnames = list(records[0].model_dump().keys())
            with open(csv_path, mode="w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                for rec in records:
                    writer.writerow(rec.model_dump())

        # 2. Write JSON
        with open(json_path, mode="w", encoding="utf-8") as f:
            json.dump([r.model_dump() for r in records], f, indent=2)

        return csv_path, json_path
