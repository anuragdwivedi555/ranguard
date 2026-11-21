import time
import uuid
from typing import Dict, Any, List
from ..simulation.network_engine import NetworkEngine
from ..models.command import ControllerCommand
from ..models.metrics import NetworkMetrics
from ..referee.arbitration_engine import ArbitrationEngine
from ..referee.commit_manager import CommitManager
from ..simulation.state_manager import StateManager


class BenchmarkService:
    """
    Executes rigorous comparative evaluation across three independent execution policies:
      1. Policy A: No Referee (Direct execution in arrival order)
      2. Policy B: Fixed Priority (Coverage > Interference > Energy)
      3. Policy C: RANGUARD (Intelligent shadow simulation, safety guardrails, and joint arbitration)
    """

    @classmethod
    def run_comparison(cls, seed: int = 42, cycles_count: int = 4) -> Dict[str, Any]:
        # Define a deterministic benchmark sequence with challenging conditions:
        # Cycle 1: Energy proposes shutdown on CELL_03; Coverage proposes +3 dBm on CELL_02
        # Cycle 2: Energy proposes power reduction on CELL_02 (-4 dBm); Coverage proposes power increase on CELL_02 (+3 dBm) [Direct Conflict]
        # Cycle 3: Interference proposes -3 dBm on CELL_02; Coverage proposes +3 dBm on CELL_03
        # Cycle 4: Energy proposes -4 dBm on CELL_03; Coverage proposes +3 dBm on CELL_03 [Ping-Pong attempt]

        test_sequence = [
            # Cycle 1
            [
                ControllerCommand(
                    command_id=f"BM-C1-NRG-{uuid.uuid4().hex[:4]}",
                    controller_id="ENERGY",
                    target_cell="CELL_03",
                    action_type="SHUTDOWN",
                    current_value=38.0,
                    proposed_value=0.0,
                    delta=-38.0,
                    reason="Energy saving shutdown proposal.",
                    priority=8,
                    cycle=1,
                ),
                ControllerCommand(
                    command_id=f"BM-C1-COV-{uuid.uuid4().hex[:4]}",
                    controller_id="COVERAGE",
                    target_cell="CELL_02",
                    action_type="POWER_UP",
                    current_value=38.0,
                    proposed_value=41.0,
                    delta=3.0,
                    reason="Boost edge coverage.",
                    priority=7,
                    cycle=1,
                ),
            ],
            # Cycle 2
            [
                ControllerCommand(
                    command_id=f"BM-C2-NRG-{uuid.uuid4().hex[:4]}",
                    controller_id="ENERGY",
                    target_cell="CELL_02",
                    action_type="POWER_DOWN",
                    current_value=38.0,
                    proposed_value=34.0,
                    delta=-4.0,
                    reason="Energy trim on CELL_02.",
                    priority=5,
                    cycle=2,
                ),
                ControllerCommand(
                    command_id=f"BM-C2-COV-{uuid.uuid4().hex[:4]}",
                    controller_id="COVERAGE",
                    target_cell="CELL_02",
                    action_type="POWER_UP",
                    current_value=38.0,
                    proposed_value=42.0,
                    delta=4.0,
                    reason="Coverage boost on CELL_02.",
                    priority=7,
                    cycle=2,
                ),
            ],
            # Cycle 3
            [
                ControllerCommand(
                    command_id=f"BM-C3-INT-{uuid.uuid4().hex[:4]}",
                    controller_id="INTERFERENCE",
                    target_cell="CELL_02",
                    action_type="POWER_DOWN",
                    current_value=38.0,
                    proposed_value=35.0,
                    delta=-3.0,
                    reason="Trim interference on CELL_02.",
                    priority=6,
                    cycle=3,
                ),
                ControllerCommand(
                    command_id=f"BM-C3-COV-{uuid.uuid4().hex[:4]}",
                    controller_id="COVERAGE",
                    target_cell="CELL_03",
                    action_type="POWER_UP",
                    current_value=38.0,
                    proposed_value=41.0,
                    delta=3.0,
                    reason="Expand CELL_03 radius.",
                    priority=7,
                    cycle=3,
                ),
            ],
            # Cycle 4
            [
                ControllerCommand(
                    command_id=f"BM-C4-NRG-{uuid.uuid4().hex[:4]}",
                    controller_id="ENERGY",
                    target_cell="CELL_03",
                    action_type="POWER_DOWN",
                    current_value=38.0,
                    proposed_value=34.0,
                    delta=-4.0,
                    reason="Pull power down on CELL_03.",
                    priority=5,
                    cycle=4,
                ),
                ControllerCommand(
                    command_id=f"BM-C4-COV-{uuid.uuid4().hex[:4]}",
                    controller_id="COVERAGE",
                    target_cell="CELL_03",
                    action_type="POWER_UP",
                    current_value=38.0,
                    proposed_value=42.0,
                    delta=4.0,
                    reason="Pull power up on CELL_03.",
                    priority=7,
                    cycle=4,
                ),
            ],
        ]

        # -------------------------------------------------------------
        # 1. POLICY A: NO REFEREE
        # -------------------------------------------------------------
        net_a = NetworkEngine(seed=seed)
        reversals_a = 0
        violations_a = 0
        latencies_a: List[float] = []
        cell_last_delta_a: Dict[str, float] = {}

        for cycle_cmds in test_sequence:
            t0 = time.perf_counter()
            # Execute every command in sequential order blindly
            for cmd in cycle_cmds:
                if cmd.target_cell in net_a.cells:
                    delta = cmd.proposed_value - net_a.cells[cmd.target_cell].tx_power_dbm
                    # Check reversal
                    if cmd.target_cell in cell_last_delta_a:
                        prev_d = cell_last_delta_a[cmd.target_cell]
                        if (prev_d > 0 and delta < 0) or (prev_d < 0 and delta > 0):
                            reversals_a += 1
                    cell_last_delta_a[cmd.target_cell] = delta

                    if cmd.action_type == "SHUTDOWN":
                        net_a.apply_action(cmd.target_cell, status="SHUTDOWN", tx_power_dbm=0.0)
                    else:
                        net_a.apply_action(cmd.target_cell, status="ACTIVE", tx_power_dbm=cmd.proposed_value)

            latencies_a.append((time.perf_counter() - t0) * 1000.0)
            if net_a.metrics.coverage_percentage < 95.0:
                violations_a += 1
            net_a.step()

        metrics_a = net_a.metrics

        # -------------------------------------------------------------
        # 2. POLICY B: FIXED PRIORITY (Coverage > Interference > Energy)
        # -------------------------------------------------------------
        net_b = NetworkEngine(seed=seed)
        reversals_b = 0
        violations_b = 0
        latencies_b: List[float] = []
        cell_last_delta_b: Dict[str, float] = {}

        priority_order = {"COVERAGE": 3, "INTERFERENCE": 2, "ENERGY": 1}

        for cycle_cmds in test_sequence:
            t0 = time.perf_counter()
            # Group commands by cell and select the highest priority controller
            cmds_by_cell = {}
            for cmd in cycle_cmds:
                cid = cmd.target_cell
                if cid not in cmds_by_cell or priority_order[cmd.controller_id] > priority_order[cmds_by_cell[cid].controller_id]:
                    cmds_by_cell[cid] = cmd

            for cid, winning_cmd in cmds_by_cell.items():
                if cid in net_b.cells:
                    delta = winning_cmd.proposed_value - net_b.cells[cid].tx_power_dbm
                    if cid in cell_last_delta_b:
                        prev_d = cell_last_delta_b[cid]
                        if (prev_d > 0 and delta < 0) or (prev_d < 0 and delta > 0):
                            reversals_b += 1
                    cell_last_delta_b[cid] = delta

                    if winning_cmd.action_type == "SHUTDOWN":
                        net_b.apply_action(cid, status="SHUTDOWN", tx_power_dbm=0.0)
                    else:
                        net_b.apply_action(cid, status="ACTIVE", tx_power_dbm=winning_cmd.proposed_value)

            latencies_b.append((time.perf_counter() - t0) * 1000.0)
            if net_b.metrics.coverage_percentage < 95.0:
                violations_b += 1
            net_b.step()

        metrics_b = net_b.metrics

        # -------------------------------------------------------------
        # 3. POLICY C: RANGUARD
        # -------------------------------------------------------------
        state_mgr_c = StateManager(seed=seed)
        arbitrator_c = ArbitrationEngine()
        commit_mgr_c = CommitManager(arbitrator_c.guardrails, arbitrator_c.stability_manager)
        violations_c = 0
        latencies_c: List[float] = []

        for cycle_cmds in test_sequence:
            t0 = time.perf_counter()
            decision = arbitrator_c.arbitrate(state_mgr_c.network, cycle_cmds)
            commit_mgr_c.commit_decision(decision, state_mgr_c)
            latencies_c.append((time.perf_counter() - t0) * 1000.0)

            if state_mgr_c.network.metrics.coverage_percentage < 95.0:
                violations_c += 1

        metrics_c = state_mgr_c.network.metrics
        reversals_c = arbitrator_c.stability_manager.reversal_count

        return {
            "policies": {
                "no_referee": {
                    "name": "No Referee (Raw Execution)",
                    "coverage_pct": metrics_a.coverage_percentage,
                    "total_energy": metrics_a.total_energy,
                    "avg_sinr_db": metrics_a.avg_sinr_db,
                    "min_sinr_db": metrics_a.min_sinr_db,
                    "interference": metrics_a.interference_level,
                    "safety_violations": violations_a,
                    "control_reversals": reversals_a,
                    "median_latency_ms": round(float(sum(latencies_a) / max(len(latencies_a), 1)), 2),
                },
                "fixed_priority": {
                    "name": "Fixed Priority (Coverage > Int > Energy)",
                    "coverage_pct": metrics_b.coverage_percentage,
                    "total_energy": metrics_b.total_energy,
                    "avg_sinr_db": metrics_b.avg_sinr_db,
                    "min_sinr_db": metrics_b.min_sinr_db,
                    "interference": metrics_b.interference_level,
                    "safety_violations": violations_b,
                    "control_reversals": reversals_b,
                    "median_latency_ms": round(float(sum(latencies_b) / max(len(latencies_b), 1)), 2),
                },
                "ranguard": {
                    "name": "RANGUARD (Autonomous Referee)",
                    "coverage_pct": metrics_c.coverage_percentage,
                    "total_energy": metrics_c.total_energy,
                    "avg_sinr_db": metrics_c.avg_sinr_db,
                    "min_sinr_db": metrics_c.min_sinr_db,
                    "interference": metrics_c.interference_level,
                    "safety_violations": violations_c,
                    "control_reversals": reversals_c,
                    "median_latency_ms": round(float(sum(latencies_c) / max(len(latencies_c), 1)), 2),
                },
            },
            "cycles_evaluated": cycles_count,
            "seed": seed,
        }
