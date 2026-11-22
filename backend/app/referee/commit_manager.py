from typing import Tuple, Optional
from ..simulation.state_manager import StateManager
from ..models.decision import RefereeDecision
from ..models.metrics import NetworkMetrics
from .guardrails import SafetyGuardrails
from ..services.history_service import HistoryService
from .stability_manager import StabilityManager


class CommitManager:
    """
    Manages transactional execution of validated decisions.
    Prevents stale state mutation and enforces rollback on validation failure.
    """
    def __init__(
        self,
        guardrails: SafetyGuardrails,
        stability_manager: StabilityManager,
        history_service: Optional[HistoryService] = None,
    ):
        self.guardrails = guardrails
        self.stability_manager = stability_manager
        self.history_service = history_service or HistoryService.get_instance()

    def commit_decision(
        self,
        decision: RefereeDecision,
        state_mgr: StateManager,
    ) -> Tuple[bool, str, NetworkMetrics]:
        """
        Commits a previously evaluated decision to the active network state.
        Validates state version, safety, applies modifications atomically,
        and logs the transaction.
        """
        # 1. State version validation: reject stale decisions
        if decision.state_version != state_mgr.state_version:
            error_msg = (
                f"Commit rejected: Stale state version. Decision was evaluated against state version {decision.state_version}, "
                f"but active network is currently at version {state_mgr.state_version}."
            )
            return False, error_msg, state_mgr.network.metrics

        # If decision was REJECT or DELAY with no actions, just advance cycle and record
        if decision.verdict in ["REJECT", "DELAY"] or not decision.selected_action:
            decision.committed = True
            decision.actual_kpi_impact = {
                "coverage_delta": 0.0,
                "energy_delta": 0.0,
                "sinr_delta": 0.0,
                "interference_delta": 0.0,
            }
            self.history_service.record_decision(decision)
            state_mgr.network.step()
            state_mgr.increment_version()
            return True, f"Decision ({decision.verdict}) acknowledged. Network state preserved without modification.", state_mgr.network.metrics

        # 2. Transactional safety check prior to mutating live network
        with state_mgr.lock:
            live_net = state_mgr.network
            base_metrics = live_net.metrics

            # Always perform dry run on cloned state to guarantee no partial mutation on runtime error
            # and prevent forged is_safe payloads from bypassing deterministic guardrails.
            test_clone = live_net.clone()
            try:
                test_clone.apply_joint_actions(decision.selected_action)
                is_safe, violations = self.guardrails.validate_candidate(
                    predicted_metrics=test_clone.metrics,
                    current_cells=live_net.cells,
                    proposed_actions=decision.selected_action,
                )
                if not is_safe:
                    return False, f"Pre-commit safety check failed: {'; '.join(violations)}", base_metrics
            except Exception as e:
                return False, f"Pre-commit dry run encountered exception: {str(e)}", base_metrics

            # 3. Apply atomic updates to active network
            live_net.apply_joint_actions(decision.selected_action)
            new_metrics = live_net.metrics

            # Record stability history for affected cells
            for cid, act in decision.selected_action.items():
                if "tx_power_dbm" in act and cid in live_net.cells:
                    delta = live_net.cells[cid].last_power_change
                    self.stability_manager.record_commit(
                        cell_id=cid,
                        delta=delta,
                        action_type=act.get("status", "POWER_ADJUST"),
                        controller_id="RANGUARD_REFEREE",
                        cycle=live_net.cycle,
                    )

            # 4. Measure actual post-commit KPI impact
            decision.committed = True
            decision.actual_kpi_impact = {
                "coverage_delta": round(new_metrics.coverage_percentage - base_metrics.coverage_percentage, 2),
                "energy_delta": round(new_metrics.total_energy - base_metrics.total_energy, 2),
                "sinr_delta": round(new_metrics.avg_sinr_db - base_metrics.avg_sinr_db, 2),
                "interference_delta": round(new_metrics.interference_level - base_metrics.interference_level, 3),
            }

            # 5. Record to history, increment cycle & state version
            self.history_service.record_decision(decision)
            live_net.step()
            state_mgr.increment_version()

            return True, "Decision committed successfully. Live network state updated.", new_metrics
