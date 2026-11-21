import uuid
from typing import Dict, Any, List
from ..simulation.state_manager import StateManager
from ..models.command import ControllerCommand
from ..referee.arbitration_engine import ArbitrationEngine
from ..referee.commit_manager import CommitManager


class CellShutdownScenario:
    """
    Primary Demonstration Scenario:
    Energy Controller proposes shutting down CELL_03.
    RANGUARD evaluates full shutdown (Candidate A), partial reduction (Candidate B),
    and maintain power (Candidate C).
    Full shutdown causes coverage to drop below 95% and is BLOCKED by safety guardrails.
    Partial reduction preserves coverage >= 95% while reducing energy -> VERDICT: MODIFY.
    """
    @classmethod
    def run(
        cls,
        state_mgr: StateManager,
        arbitrator: ArbitrationEngine,
        commit_mgr: CommitManager,
    ) -> Dict[str, Any]:
        # Reset to deterministic initial state
        state_mgr.reset(seed=42)
        live_net = state_mgr.network
        initial_metrics = live_net.metrics.model_dump()
        current_cell3_pwr = live_net.cells["CELL_03"].tx_power_dbm

        # Energy Controller proposes shutting down CELL_03
        incoming_cmd = ControllerCommand(
            command_id=f"CMD-NRG-SHUTDOWN-CELL_03-{uuid.uuid4().hex[:4]}",
            controller_id="ENERGY",
            target_cell="CELL_03",
            action_type="SHUTDOWN",
            current_value=current_cell3_pwr,
            proposed_value=0.0,
            delta=-current_cell3_pwr,
            reason="Cell CELL_03 utilization is moderate; shutting down cell saves maximum simulated RF and static energy.",
            priority=8,
            cycle=live_net.cycle,
        )

        # 1. Evaluate with RANGUARD referee (shadow simulation + guardrails + arbitration)
        decision = arbitrator.arbitrate(live_net, [incoming_cmd])

        # 2. Commit the evaluated decision
        success, commit_msg, post_metrics = commit_mgr.commit_decision(decision, state_mgr)

        return {
            "scenario": "CELL_SHUTDOWN",
            "description": "Energy Controller attempts to shut down CELL_03 to minimize power consumption.",
            "initial_metrics": initial_metrics,
            "incoming_command": incoming_cmd.model_dump(),
            "decision": decision.model_dump(),
            "post_commit_metrics": post_metrics.model_dump(),
            "commit_status": success,
            "commit_message": commit_msg,
        }
