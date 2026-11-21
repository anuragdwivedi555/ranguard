import uuid
from typing import Dict, Any, List
from ..simulation.state_manager import StateManager
from ..models.command import ControllerCommand
from ..referee.arbitration_engine import ArbitrationEngine
from ..referee.commit_manager import CommitManager


class PingPongScenario:
    """
    Ping-Pong Control Scenario:
    Demonstrates alternating opposite power proposals across 6 consecutive cycles.
    Compares No-Referee baseline thrashing against RANGUARD stability damping.
    """
    @classmethod
    def run(
        cls,
        state_mgr: StateManager,
        arbitrator: ArbitrationEngine,
        commit_mgr: CommitManager,
    ) -> Dict[str, Any]:
        state_mgr.reset(seed=42)
        arbitrator.stability_manager.reset()
        live_net = state_mgr.network

        cycles_data: List[Dict[str, Any]] = []

        # 6 alternating proposals alternating Energy (POWER_DOWN) and Coverage (POWER_UP)
        alternating_plan = [
            ("ENERGY", "POWER_DOWN", -4.0, "Energy conservation trimming."),
            ("COVERAGE", "POWER_UP", +3.0, "Coverage fringe restoration."),
            ("ENERGY", "POWER_DOWN", -4.0, "Energy conservation trimming."),
            ("COVERAGE", "POWER_UP", +3.0, "Coverage fringe restoration."),
            ("ENERGY", "POWER_DOWN", -4.0, "Energy conservation trimming."),
            ("COVERAGE", "POWER_UP", +3.0, "Coverage fringe restoration."),
        ]

        for step_idx, (ctrl, act_type, delta, reason) in enumerate(alternating_plan, 1):
            curr_pwr = live_net.cells["CELL_03"].tx_power_dbm
            target_pwr = max(10.0, min(46.0, curr_pwr + delta))

            cmd = ControllerCommand(
                command_id=f"CMD-PP-{ctrl}-C{step_idx}-{uuid.uuid4().hex[:4]}",
                controller_id=ctrl,
                target_cell="CELL_03",
                action_type=act_type,
                current_value=curr_pwr,
                proposed_value=target_pwr,
                delta=delta,
                reason=reason,
                priority=6,
                cycle=live_net.cycle,
            )

            # Evaluate with RANGUARD referee
            decision = arbitrator.arbitrate(live_net, [cmd])
            # Commit decision
            success, msg, post_metrics = commit_mgr.commit_decision(decision, state_mgr)

            cycles_data.append({
                "cycle": step_idx,
                "command": cmd.model_dump(),
                "verdict": decision.verdict,
                "reason": decision.reason,
                "resulting_power": live_net.cells["CELL_03"].tx_power_dbm,
                "coverage": post_metrics.coverage_percentage,
                "stability_reversals": arbitrator.stability_manager.reversal_count,
                "delayed_count": arbitrator.stability_manager.delayed_count,
            })

        return {
            "scenario": "PING_PONG",
            "description": "Alternating conflicting power commands across consecutive cycles to test stability damping.",
            "cycles": cycles_data,
            "total_reversals_suppressed": arbitrator.stability_manager.delayed_count,
            "final_cell_power": live_net.cells["CELL_03"].tx_power_dbm,
            "final_coverage": live_net.metrics.coverage_percentage,
        }
