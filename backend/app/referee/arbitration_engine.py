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

    def _run_shadow(self, live_network: NetworkEngine, commands: List[ControllerCommand]) -> Dict[str, Any]:
        """Conflict detection, ML advisory, candidate generation, shadow simulation and scoring."""
        baseline_metrics = live_network.metrics
        current_cycle = live_network.cycle
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

        # Step 4 & 5: Shadow Simulation & Safety Validation
        evaluated_candidates = self.shadow_simulator.evaluate_candidates(live_network, candidate_defs)

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

        return {
            "conflicts": conflicts,
            "advisory_reports": advisory_reports,
            "primary_advisory": primary_advisory,
            "has_premature_cut": has_premature_cut,
            "scored_candidates": scored_candidates,
            "advisory_applied": advisory_applied,
            "baseline_metrics": baseline_metrics,
        }

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

        # Steps 2-6: conflicts, advisory, candidate generation, shadow simulation, scoring
        shadow = self._run_shadow(live_network, commands)
        conflicts = shadow["conflicts"]
        advisory_reports = shadow["advisory_reports"]
        primary_advisory = shadow["primary_advisory"]
        scored_candidates = shadow["scored_candidates"]
        advisory_applied = shadow["advisory_applied"]

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
        )


    # ------------------------------------------------------------------
    # Operator-in-the-loop review: expose every shadow fork, let a human choose.
    # ------------------------------------------------------------------
    def review(self, live_network: NetworkEngine, commands: List[ControllerCommand]) -> Dict[str, Any]:
        """Runs the shadow pipeline WITHOUT committing and returns every candidate with its full calculation."""
        t0 = time.perf_counter()
        shadow = self._run_shadow(live_network, commands)
        scored: List[CandidateAction] = shadow["scored_candidates"]
        baseline = shadow["baseline_metrics"]
        cells = live_network.cells
        cycle = live_network.cycle

        # Stability (cooldown / hysteresis) status for the proposed cells
        delayed, delay_msg = False, ""
        for cmd in commands:
            cell = cells.get(cmd.target_cell)
            if not cell:
                continue
            d_val = -cell.tx_power_dbm if cmd.action_type == "SHUTDOWN" else cmd.proposed_value - cell.tx_power_dbm
            d_flag, d_msg, o_flag = self.stability_manager.check_stability(
                cell_id=cmd.target_cell, proposed_delta=d_val, proposed_action_type=cmd.action_type,
                controller_id=cmd.controller_id, current_cycle=cycle, current_metrics=baseline,
            )
            if d_flag and not o_flag:
                delayed, delay_msg = True, d_msg
                break

        penalised = set()
        if shadow["advisory_applied"] and shadow["primary_advisory"]:
            tgt = shadow["primary_advisory"].get("cell_id")
            for c in scored:
                act = c.joint_actions.get(tgt)
                if act and (act.get("status") == "SHUTDOWN" or act.get("tx_power_dbm", 38.0) <= 28.0):
                    penalised.add(c.candidate_id)

        safe = [c for c in scored if c.is_safe]
        best = max(safe, key=lambda c: c.objective_score) if safe else None
        ordered = sorted(scored, key=lambda c: (c.is_safe, c.objective_score), reverse=True)

        def kpi_delta(m):
            return {
                "coverage": round(m.coverage_percentage - baseline.coverage_percentage, 2),
                "energy_pct": round((m.total_energy - baseline.total_energy) / max(baseline.total_energy, 1.0) * 100.0, 2),
                "sinr": round(m.avg_sinr_db - baseline.avg_sinr_db, 2),
                "interference": round(m.interference_level - baseline.interference_level, 2),
            }

        out_cands = []
        for i, c in enumerate(ordered):
            changes = []
            for cid, act in c.joint_actions.items():
                cell = cells.get(cid)
                if not cell:
                    continue
                changes.append({
                    "cell_id": cid,
                    "from_dbm": cell.tx_power_dbm,
                    "to_dbm": act.get("tx_power_dbm", cell.tx_power_dbm),
                    "from_status": cell.status,
                    "to_status": act.get("status", cell.status),
                })
            penalty = 50.0 if c.candidate_id in penalised else 0.0
            out_cands.append({
                "candidate_id": c.candidate_id,
                "label": chr(65 + i),
                "rank": i + 1,
                "origin": c.origin,
                "description": c.description,
                "changes": changes,
                "predicted_metrics": c.predicted_metrics.model_dump(),
                "deltas": kpi_delta(c.predicted_metrics),
                "is_safe": c.is_safe,
                "violated_constraints": c.violated_constraints,
                "checks": self.guardrails.evaluate_checks(c.predicted_metrics, cells, c.joint_actions),
                "score": c.objective_score if c.is_safe else None,
                "score_terms": ObjectiveOptimizer.explain(c, baseline, cells),
                "advisory_penalty": penalty,
                "sim_ms": c.sim_ms,
                "is_recommended": best is not None and c.candidate_id == best.candidate_id,
            })

        recommendation = None
        if best is not None:
            others = sorted([c for c in safe if c.candidate_id != best.candidate_id], key=lambda c: c.objective_score, reverse=True)
            pm = best.predicted_metrics
            reasons = [f"Passes all {len(out_cands[0]['checks'])} safety guardrails"]
            if others:
                reasons.insert(0, f"Highest objective score: {best.objective_score:.3f} (next best {others[0].objective_score:.3f})")
            else:
                reasons.insert(0, f"Highest objective score: {best.objective_score:.3f}")
            reasons.append(f"Coverage stays at {pm.coverage_percentage:.1f}% ({pm.coverage_percentage - 95.0:+.1f} pts above the 95% floor)")
            d = kpi_delta(pm)
            if d["energy_pct"] < -0.05:
                reasons.append(f"Saves {abs(d['energy_pct']):.1f}% energy compared with the live network")
            if d["interference"] < -0.5:
                reasons.append(f"Reduces interference by {abs(d['interference']):.0f} units")
            moved = len(best.joint_actions)
            reasons.append("Leaves the network untouched" if moved == 0 else f"Changes only {moved} cell{'s' if moved > 1 else ''}")
            blocked = [c for c in scored if not c.is_safe]
            if blocked:
                reasons.append(f"{len(blocked)} option{'s' if len(blocked) > 1 else ''} blocked by guardrails")
            if penalised:
                reasons.append("ML traffic forecast penalised risky power cuts")
            recommendation = {"candidate_id": best.candidate_id, "reasons": reasons}

        return {
            "state_version": live_network.state_version,
            "cycle": cycle,
            "baseline": baseline.model_dump(),
            "weights": {
                "energy": ObjectiveOptimizer.WEIGHT_ENERGY,
                "interference": ObjectiveOptimizer.WEIGHT_INTERFERENCE,
                "coverage": ObjectiveOptimizer.WEIGHT_COVERAGE,
                "change": ObjectiveOptimizer.WEIGHT_MIN_CHANGE,
            },
            "conflicts": [
                {
                    "conflict_type": c.conflict_type,
                    "severity": c.severity,
                    "explanation": c.explanation,
                    "affected_cells": c.affected_cells,
                    "involved_controllers": c.involved_controllers,
                }
                for c in shadow["conflicts"]
            ],
            "advisory": shadow["primary_advisory"],
            "stability": {"delayed": delayed, "message": delay_msg},
            "candidates": out_cands,
            "recommended_id": best.candidate_id if best else None,
            "recommendation": recommendation,
            "compute_ms": round((time.perf_counter() - t0) * 1000.0, 2),
        }

    def build_operator_decision(
        self,
        live_network: NetworkEngine,
        commands: List[ControllerCommand],
        candidate: CandidateAction,
        recommended_id: Optional[str],
        others: List[CandidateAction],
    ) -> RefereeDecision:
        """Wraps a human-selected candidate as a RefereeDecision that the CommitManager can execute."""
        is_override = recommended_id is not None and candidate.candidate_id != recommended_id
        if candidate.candidate_id == "CAND-STATUS-QUO":
            verdict = "REJECT"
        elif candidate.candidate_id.startswith("CAND-PROP") and len(commands) == 1:
            verdict = "APPROVE"
        else:
            verdict = "MODIFY"
        reason = (
            f"Operator {'override of' if is_override else 'confirmation of'} the RANGUARD recommendation: "
            f"{candidate.description}."
        )
        return RefereeDecision(
            decision_id=f"DEC-OPERATOR-{verdict}-{live_network.cycle}-{uuid.uuid4().hex[:4]}",
            cycle=live_network.cycle,
            verdict=verdict,
            original_proposals=commands,
            selected_candidate=candidate,
            selected_action=candidate.joint_actions,
            reason=reason,
            rejected_alternatives=[
                {
                    "candidate_id": c.candidate_id,
                    "description": c.description,
                    "is_safe": c.is_safe,
                    "objective_score": c.objective_score,
                    "violated_constraints": c.violated_constraints,
                }
                for c in others
            ],
            safety_validation={"is_safe": candidate.is_safe, "violated_constraints": candidate.violated_constraints},
            predicted_kpi_impact={
                "coverage_delta": round(candidate.predicted_metrics.coverage_percentage - live_network.metrics.coverage_percentage, 2),
                "energy_delta": round(candidate.predicted_metrics.total_energy - live_network.metrics.total_energy, 2),
                "sinr_delta": round(candidate.predicted_metrics.avg_sinr_db - live_network.metrics.avg_sinr_db, 2),
                "interference_delta": round(candidate.predicted_metrics.interference_level - live_network.metrics.interference_level, 3),
            },
            optimization_score=candidate.objective_score,
            controllers_involved=list(dict.fromkeys(c.controller_id for c in commands)),
            state_version=live_network.state_version,
        )
