import time
import uuid
from typing import Any, Dict, List, Optional

from ..simulation.network_engine import NetworkEngine
from ..models.command import ControllerCommand
from ..models.decision import CandidateAction, ConflictReport, RefereeDecision
from .conflict_detector import ConflictDetector
from .guardrails import SafetyGuardrails
from .candidate_generator import CandidateGenerator
from .shadow_simulator import ShadowSimulator
from .optimizer import ObjectiveOptimizer
from .stability_manager import StabilityManager
from ..ml.advisor import TrafficAdvisoryEngine
from ..ml.surrogate.engine import DecisionIntelligenceEngine


class ArbitrationEngine:
    """
    RANGUARD Core Arbitration Engine.
    Executes the INTERCEPT -> DETECT -> PREDICT -> SIMULATE -> VALIDATE -> ARBITRATE pipeline.
    """
    def __init__(self, advisory_engine: Optional[TrafficAdvisoryEngine] = None):
        self.guardrails = SafetyGuardrails()
        self.conflict_detector = ConflictDetector()
        self.candidate_generator = CandidateGenerator()
        self.shadow_simulator = ShadowSimulator(self.guardrails)
        self.stability_manager = StabilityManager()
        self.advisory_engine = advisory_engine or TrafficAdvisoryEngine.get_instance()
        self.intelligence_engine = DecisionIntelligenceEngine.get_instance()

    def arbitrate(
        self,
        live_network: NetworkEngine,
        commands: List[ControllerCommand],
    ) -> RefereeDecision:
        start_time = time.perf_counter()

        # Step 1: Baseline metrics
        baseline_metrics = live_network.metrics
        current_cycle = live_network.cycle
        state_version = live_network.state_version
        controllers_involved = list(dict.fromkeys(c.controller_id for c in commands))

        # Handle trivial empty command list
        if not commands:
            comp_time = round((time.perf_counter() - start_time) * 1000.0, 2)
            return RefereeDecision(
                decision_id=f"DEC-IDLE-{current_cycle}-{uuid.uuid4().hex[:4]}",
                cycle=current_cycle,
                verdict="APPROVE",
                original_proposals=[],
                selected_candidate=None,
                selected_action={},
                reason="No active controller proposals received for this cycle. Maintaining current network configuration.",
                rejected_alternatives=[],
                safety_validation={"is_safe": True, "violations": []},
                predicted_kpi_impact={
                    "coverage_delta": 0.0,
                    "energy_delta": 0.0,
                    "sinr_delta": 0.0,
                },
                optimization_score=0.0,
                controllers_involved=[],
                state_version=state_version,
                computation_time_ms=comp_time,
            )

        # Step 2: Conflict Detection & Traffic Advisory
        conflicts = self.conflict_detector.detect_conflicts(commands, live_network.cells)

        advisory_reports: List[Dict[str, Any]] = []
        has_premature_cut = False
        primary_advisory: Optional[Dict[str, Any]] = None

        for cmd in commands:
            cell = live_network.cells.get(cmd.target_cell)
            curr_pwr = cell.tx_power_dbm if cell else 38.0
            d_val = -curr_pwr if cmd.action_type == "SHUTDOWN" else (cmd.proposed_value - curr_pwr)
            adv = self.advisory_engine.get_cell_advisory(
                cell_id=cmd.target_cell,
                cycle=current_cycle,
                traffic_provider=getattr(live_network, "traffic_provider", None),
                proposed_action_type=cmd.action_type,
                proposed_delta_dbm=d_val,
            )
            advisory_reports.append(adv)
            if adv.get("is_premature_power_cut"):
                has_premature_cut = True
                if primary_advisory is None:
                    primary_advisory = adv

        # Step 3: Candidate Generation
        candidate_defs = self.candidate_generator.generate_candidates(commands, live_network.cells)

        # Step 4 & 5: AI PREDICTS -> DIGITAL TWIN VERIFIES -> AUDIT
        evaluated_candidates, intelligence_audit = self.intelligence_engine.evaluate_with_intelligence_pipeline(
            live_network=live_network,
            candidate_defs=candidate_defs,
            shadow_simulator=self.shadow_simulator,
        )

        # Step 6: Multi-Objective Scoring
        scored_candidates = ObjectiveOptimizer.score_candidates(
            candidates=evaluated_candidates,
            baseline_metrics=baseline_metrics,
            current_cells=live_network.cells,
        )

        # ML Advisory: If premature power cut detected during forecasted surge, penalize shutdown candidates
        advisory_applied = False
        if has_premature_cut and primary_advisory is not None:
            target_cid = primary_advisory.get("cell_id")
            for c in scored_candidates:
                cell_act = c.joint_actions.get(target_cid)
                if cell_act:
                    # Penalize shutdown or extreme cut (power <= 28.0 dBm)
                    if cell_act.get("status") == "SHUTDOWN" or cell_act.get("tx_power_dbm", 38.0) <= 28.0:
                        c.objective_score -= 50.0
                        advisory_applied = True

        # Separate safe vs unsafe candidates, sorted by objective_score descending
        safe_candidates = sorted([c for c in scored_candidates if c.is_safe], key=lambda x: x.objective_score, reverse=True)
        unsafe_candidates = [c for c in scored_candidates if not c.is_safe]

        # Step 7: Check Stability (Cooldown / Hysteresis) on primary proposed cells
        # Check if the primary incoming command should be delayed
        should_delay = False
        delay_reason = ""
        is_override = False

        for cmd in commands:
            cell = live_network.cells.get(cmd.target_cell)
            if cell:
                d_val = cmd.proposed_value - cell.tx_power_dbm if cmd.action_type != "SHUTDOWN" else -cell.tx_power_dbm
                d_flag, d_msg, o_flag = self.stability_manager.check_stability(
                    cell_id=cmd.target_cell,
                    proposed_delta=d_val,
                    proposed_action_type=cmd.action_type,
                    controller_id=cmd.controller_id,
                    current_cycle=current_cycle,
                    current_metrics=baseline_metrics,
                )
                if d_flag:
                    should_delay = True
                    delay_reason = d_msg
                    break
                if o_flag:
                    is_override = True

        # Step 8: Verdict Selection & Decision Classification
        verdict: str
        selected_cand: Optional[CandidateAction] = None
        selected_action: Dict[str, Any] = {}
        reason: str

        if not safe_candidates:
            # Case A: REJECT - Every candidate violates hard safety constraints
            verdict = "REJECT"
            reason = (
                "Hard safety constraint violation: All evaluated candidates breached mandatory network thresholds. "
                + "Rejecting action to protect network integrity."
            )
            selected_action = {}
            selected_cand = None

        elif should_delay and not is_override:
            # Case B: DELAY - Blocked by cooldown or hysteresis
            verdict = "DELAY"
            reason = f"Decision postponed by Stability Engine: {delay_reason}"
            # Preserve status quo
            selected_cand = next((c for c in scored_candidates if c.candidate_id == "CAND-STATUS-QUO"), safe_candidates[0])
            selected_action = {}

        else:
            # Pick best safe candidate
            best_cand = safe_candidates[0]
            selected_cand = best_cand
            selected_action = best_cand.joint_actions

            # Check if best candidate matches the original proposal
            is_original_approved = False
            for cmd in commands:
                matching_id = f"CAND-PROP-{cmd.controller_id}-{cmd.target_cell}"
                if best_cand.candidate_id == matching_id:
                    is_original_approved = True
                    break

            if is_original_approved and len(commands) == 1 and not conflicts and not advisory_applied:
                verdict = "APPROVE"
                reason = (
                    f"Approved: Proposal from {commands[0].controller_id} on {commands[0].target_cell} is safe and beneficial. "
                    f"Predicted Coverage: {best_cand.predicted_metrics.coverage_percentage:.1f}%, "
                    f"Predicted Energy: {best_cand.predicted_metrics.total_energy:.1f} units."
                )
            else:
                verdict = "MODIFY"
                # Formulate transparent engineering explanation
                if any(c.action_type == "SHUTDOWN" for c in commands):
                    reason = (
                        "Full shutdown would violate the minimum coverage requirement. "
                        "A partial transmission-power reduction provides a safer alternative while reducing simulated energy consumption."
                    )
                elif conflicts:
                    conflict_summary = "; ".join(c.explanation for c in conflicts)
                    reason = (
                        f"Resolved conflicting proposals ({conflict_summary}). "
                        f"Selected coordinated compromise: {best_cand.description} to achieve optimal global utility without sacrificing safety."
                    )
                else:
                    reason = (
                        f"Coordinated modification selected: {best_cand.description}. "
                        f"Achieves higher multi-objective score ({best_cand.objective_score:.3f}) than original proposals."
                    )

                if advisory_applied and primary_advisory:
                    reason += (
                        f" [Predictive Advisory: Prevented premature power cut on {primary_advisory['cell_id']} "
                        f"due to forecasted traffic surge ({primary_advisory.get('current_activity_index', 0.0):.2f} -> "
                        f"{primary_advisory.get('predicted_activity_index', 0.0):.2f} activity index). "
                        f"Selected capacity-preserving compromise: {best_cand.description} to safeguard upcoming demand.]"
                    )

        # Rejected alternatives summary
        rejected_alts = []
        for cand in scored_candidates:
            if selected_cand and cand.candidate_id == selected_cand.candidate_id:
                continue
            rejected_alts.append({
                "candidate_id": cand.candidate_id,
                "description": cand.description,
                "is_safe": cand.is_safe,
                "objective_score": cand.objective_score,
                "violated_constraints": cand.violated_constraints,
            })

        # Predicted KPI Impact
        if selected_cand:
            pred = selected_cand.predicted_metrics
            kpi_impact = {
                "coverage_delta": round(pred.coverage_percentage - baseline_metrics.coverage_percentage, 2),
                "energy_delta": round(pred.total_energy - baseline_metrics.total_energy, 2),
                "sinr_delta": round(pred.avg_sinr_db - baseline_metrics.avg_sinr_db, 2),
                "interference_delta": round(pred.interference_level - baseline_metrics.interference_level, 3),
            }
        else:
            kpi_impact = {"coverage_delta": 0.0, "energy_delta": 0.0, "sinr_delta": 0.0, "interference_delta": 0.0}

        comp_time = round((time.perf_counter() - start_time) * 1000.0, 2)
        chosen_advisory = primary_advisory if primary_advisory else (advisory_reports[0] if advisory_reports else None)

        return RefereeDecision(
            decision_id=f"DEC-{verdict}-{current_cycle}-{uuid.uuid4().hex[:4]}",
            cycle=current_cycle,
            verdict=verdict,
            original_proposals=commands,
            selected_candidate=selected_cand,
            selected_action=selected_action,
            reason=reason,
            rejected_alternatives=rejected_alts,
            safety_validation={
                "is_safe": selected_cand.is_safe if selected_cand else False,
                "violated_constraints": selected_cand.violated_constraints if selected_cand else ["All candidates infeasible"],
            },
            predicted_kpi_impact=kpi_impact,
            optimization_score=selected_cand.objective_score if selected_cand else -999.0,
            controllers_involved=controllers_involved,
            state_version=state_version,
            computation_time_ms=comp_time,
            predictive_advisory=chosen_advisory,
            decision_intelligence=intelligence_audit.model_dump() if intelligence_audit else None,
        )
