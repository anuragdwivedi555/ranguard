from typing import Any, Dict, List
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

        for c_def in candidate_definitions:
            # 1. Clone current network state
            shadow_engine = live_network.clone()

            # 2. Apply candidate action to the cloned instance
            joint_actions = c_def.get("joint_actions", {})
            shadow_engine.apply_joint_actions(joint_actions)

            # 3. Recalculated metrics are stored on shadow_engine.metrics
            predicted_metrics = shadow_engine.metrics

            # 4. Validate hard safety constraints
            is_safe, violated_constraints = self.guardrails.validate_candidate(
                predicted_metrics=predicted_metrics,
                current_cells=live_network.cells,
                proposed_actions=joint_actions,
            )

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
            )
            evaluated_candidates.append(candidate_action)

        return evaluated_candidates
