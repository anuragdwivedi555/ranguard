import uuid
from typing import Dict, Any
from ..simulation.state_manager import StateManager
from ..models.command import ControllerCommand
from ..referee.arbitration_engine import ArbitrationEngine
from ..referee.commit_manager import CommitManager


class TrafficSpikeScenario:
    """
    Traffic Spike Scenario:
    A surge of traffic and user concentration creates simultaneous coverage and interference tensions.
    Coverage proposes power boost; Interference proposes power reduction on neighbor; Energy proposes saving.
    RANGUARD coordinates competing proposals into an optimal balanced action.
    """
    @classmethod
    def run(
        cls,
        state_mgr: StateManager,
        arbitrator: ArbitrationEngine,
        commit_mgr: CommitManager,
    ) -> Dict[str, Any]:
        state_mgr.reset(seed=42)
        live_net = state_mgr.network

        # Simulate traffic surge on users
        for u in live_net.users[:40]:
            u.traffic_demand *= 2.5
        live_net.recalculate()
        initial_metrics = live_net.metrics.model_dump()

        # Competing proposals from different controllers
        pwr_c2 = live_net.cells["CELL_02"].tx_power_dbm
        pwr_c5 = live_net.cells["CELL_05"].tx_power_dbm

        commands = [
            ControllerCommand(
                command_id=f"CMD-COV-SPIKE-CELL_02-{uuid.uuid4().hex[:4]}",
                controller_id="COVERAGE",
                target_cell="CELL_02",
                action_type="POWER_UP",
                current_value=pwr_c2,
                proposed_value=min(46.0, pwr_c2 + 3.0),
                delta=3.0,
                reason="High traffic demand and edge user degradation on CELL_02; power increase required.",
                priority=8,
                cycle=live_net.cycle,
            ),
            ControllerCommand(
                command_id=f"CMD-INT-SPIKE-CELL_02-{uuid.uuid4().hex[:4]}",
                controller_id="INTERFERENCE",
                target_cell="CELL_02",
                action_type="POWER_DOWN",
                current_value=pwr_c2,
                proposed_value=max(10.0, pwr_c2 - 2.0),
                delta=-2.0,
                reason="CELL_02 is heavily radiating co-channel interference into adjacent sectors; trimming power needed.",
                priority=7,
                cycle=live_net.cycle,
            ),
            ControllerCommand(
                command_id=f"CMD-NRG-SPIKE-CELL_05-{uuid.uuid4().hex[:4]}",
                controller_id="ENERGY",
                target_cell="CELL_05",
                action_type="POWER_DOWN",
                current_value=pwr_c5,
                proposed_value=max(10.0, pwr_c5 - 3.0),
                delta=-3.0,
                reason="CELL_05 has spare capacity; reduce transmission power to offset spike energy costs.",
                priority=5,
                cycle=live_net.cycle,
            ),
        ]

        # Arbitrate and commit
        decision = arbitrator.arbitrate(live_net, commands)
        success, commit_msg, post_metrics = commit_mgr.commit_decision(decision, state_mgr)

        return {
            "scenario": "TRAFFIC_SPIKE",
            "description": "Sudden traffic surge triggers simultaneous conflicting demands across Coverage, Interference, and Energy controllers.",
            "initial_metrics": initial_metrics,
            "incoming_commands": [c.model_dump() for c in commands],
            "decision": decision.model_dump(),
            "post_commit_metrics": post_metrics.model_dump(),
            "commit_status": success,
            "commit_message": commit_msg,
        }
