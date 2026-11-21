import time
from typing import Any, Dict, List, Tuple
from ..simulation.network_engine import NetworkEngine
from ..models.decision import CandidateAction
from .guardrails import SafetyGuardrails


class ShadowSimulator:
    """
    Executes isolated candidate evaluations on deep-copied snapshots.
    Guarantees zero mutation to the live network state.
    """
    def __init__(self, guardrails: SafetyGuardrails):
        self.guardrails = guardrails

    def evaluate_candidates(
        self,
        live_network: NetworkEngine,
        candidate_definitions: List[Dict[str, Any]],
    ) -> List[CandidateAction]:
        evaluated_candidates: List[CandidateAction] = []
        # Cache evaluations for identical joint action configurations
        action_cache: Dict[tuple, Tuple[Any, bool, List[str]]] = {}

        for c_def in candidate_definitions:
            sim_start = time.perf_counter()
            joint_actions = c_def.get("joint_actions", {})
            action_sig = tuple(sorted(
                (cid, act.get("status", "ACTIVE"), round(float(act.get("tx_power_dbm", 0.0)), 2))
                for cid, act in joint_actions.items()
            ))

            if action_sig in action_cache:
                predicted_metrics, is_safe, violated_constraints = action_cache[action_sig]
            else:
                # 1. Clone current network state
                shadow_engine = live_network.clone()

                # 2. Apply candidate action to the cloned instance
                shadow_engine.apply_joint_actions(joint_actions)

                # 3. Recalculated metrics are stored on shadow_engine.metrics
                predicted_metrics = shadow_engine.metrics

                # 4. Validate hard safety constraints
                is_safe, violated_constraints = self.guardrails.validate_candidate(
                    predicted_metrics=predicted_metrics,
                    current_cells=live_network.cells,
                    proposed_actions=joint_actions,
                )
                action_cache[action_sig] = (predicted_metrics, is_safe, violated_constraints)

            # Build explanation string
            if is_safe:
                explanation = (
                    f"Feasible. Predicted Coverage: {predicted_metrics.coverage_percentage:.1f}%, "
                    f"Energy: {predicted_metrics.total_energy:.1f} units, "
                    f"Avg SINR: {predicted_metrics.avg_sinr_db:.1f} dB."
                )
            else:
                explanation = f"Unsafe candidate: " + "; ".join(violated_constraints)

            candidate_action = CandidateAction(
                candidate_id=c_def["candidate_id"],
                description=c_def["description"],
                target_cell=c_def["target_cell"],
                proposed_power=c_def.get("proposed_power", 0.0),
                proposed_status=c_def.get("proposed_status", "ACTIVE"),
                joint_actions=joint_actions,
                predicted_metrics=predicted_metrics,
                is_safe=is_safe,
                violated_constraints=violated_constraints,
                explanation=explanation,
                origin=c_def.get("origin", ""),
                sim_ms=round((time.perf_counter() - sim_start) * 1000.0, 3),
            )
            evaluated_candidates.append(candidate_action)

        return evaluated_candidates
