"""Decision Intelligence Engine orchestrating the AI PREDICTS -> DIGITAL TWIN VERIFIES -> REFEREE DECIDES loop.

Enforces strict separation between prediction epoch and verification epoch.
Maintains an immutable, auditable comparison trail and transparent error metrics.
"""

from __future__ import annotations

import logging
from pathlib import Path
import time
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

from ...simulation.network_engine import NetworkEngine
from ...models.decision import CandidateAction
from ...referee.shadow_simulator import ShadowSimulator
from .schemas import (
    SurrogatePrediction,
    CandidateTwinVerification,
    PredictionVerificationPair,
    DecisionIntelligenceAudit,
)
from .surrogate_model import XGBoostActionSurrogate


logger = logging.getLogger(__name__)


class DecisionIntelligenceEngine:
    """Orchestrates candidate action surrogate prediction and digital-twin verification."""

    _instance: Optional[DecisionIntelligenceEngine] = None

    def __init__(
        self,
        artifact_dir: Optional[Path] = None,
        enabled: bool = True,
    ):
        self.enabled = enabled
        self.surrogate: Optional[XGBoostActionSurrogate] = None
        self._audit_history: List[DecisionIntelligenceAudit] = []
        self._max_audit_records: int = 100

        if artifact_dir is None:
            self.artifact_dir = Path(__file__).resolve().parent.parent / "artifacts"
        else:
            self.artifact_dir = Path(artifact_dir)

        self._initialize_surrogate()

    @classmethod
    def get_instance(cls) -> DecisionIntelligenceEngine:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        cls._instance = None

    def toggle(self, enabled: bool) -> bool:
        self.enabled = enabled
        return self.enabled

    def _initialize_surrogate(self) -> None:
        """Loads serialized XGBoost surrogate models from disk."""
        try:
            self.surrogate = XGBoostActionSurrogate.load(self.artifact_dir)
            logger.info("DecisionIntelligenceEngine: Loaded XGBoost action surrogate models successfully.")
        except Exception as e:
            logger.warning(f"DecisionIntelligenceEngine: Model load failed ({e}). Initializing fallback surrogate.")
            self.surrogate = XGBoostActionSurrogate()

    def evaluate_with_intelligence_pipeline(
        self,
        live_network: NetworkEngine,
        candidate_defs: List[Dict[str, Any]],
        shadow_simulator: ShadowSimulator,
    ) -> Tuple[List[CandidateAction], Optional[DecisionIntelligenceAudit]]:
        """
        Executes the three-phase decision loop:
        1. AI PREDICTS: Pre-action surrogate predictions generated and timestamped.
        2. DIGITAL TWIN VERIFIES: Authoritative shadow simulation calculates ground truth.
        3. REFEREE AUDIT: Pairs predictions with verifications and calculates prediction errors.
        """
        if not candidate_defs:
            return [], None

        current_cycle = live_network.cycle
        base_metrics = live_network.metrics

        # -------------------------------------------------------------
        # PHASE 1: AI PREDICTS (Pre-Simulation Inference)
        # -------------------------------------------------------------
        t_pred_start = time.perf_counter()
        predictions: List[SurrogatePrediction] = []

        if self.enabled and self.surrogate is not None:
            for c_def in candidate_defs:
                pred = self.surrogate.predict_single_candidate(live_network, c_def)
                predictions.append(pred)
        else:
            for c_def in candidate_defs:
                # Fallback neutral prediction
                predictions.append(SurrogatePrediction(
                    candidate_id=c_def["candidate_id"],
                    target_cell=c_def.get("target_cell", "ALL"),
                    predicted_coverage_delta=0.0,
                    predicted_coverage_pct=base_metrics.coverage_percentage,
                    predicted_interference_delta=0.0,
                    predicted_interference=base_metrics.interference_level,
                    predicted_energy_delta=0.0,
                    predicted_total_energy=base_metrics.total_energy,
                    predicted_is_safe=True,
                    safety_risk_score=0.0,
                    surrogate_objective_score=0.0,
                    prediction_latency_ms=0.0,
                ))

        ml_inference_total_ms = round((time.perf_counter() - t_pred_start) * 1000.0, 3)

        # -------------------------------------------------------------
        # PHASE 2: DIGITAL TWIN VERIFIES (Authoritative Simulation)
        # -------------------------------------------------------------
        t_twin_start = time.perf_counter()
        evaluated_candidates = shadow_simulator.evaluate_candidates(live_network, candidate_defs)
        twin_verification_total_ms = round((time.perf_counter() - t_twin_start) * 1000.0, 3)

        # -------------------------------------------------------------
        # PHASE 3: AUDIT & COMPARISON LOGGING
        # -------------------------------------------------------------
        pairs: List[PredictionVerificationPair] = []
        cov_errors: List[float] = []
        int_errors: List[float] = []
        false_negatives = 0
        unsafe_flagged = 0

        for pred, cand in zip(predictions, evaluated_candidates):
            twin_m = cand.predicted_metrics
            actual_cov_delta = round(float(twin_m.coverage_percentage - base_metrics.coverage_percentage), 3)
            actual_int_delta = round(float(twin_m.interference_level - base_metrics.interference_level), 3)
            actual_energy_delta = round(float(twin_m.total_energy - base_metrics.total_energy), 3)

            twin_verif = CandidateTwinVerification(
                candidate_id=cand.candidate_id,
                actual_coverage_delta=actual_cov_delta,
                actual_coverage_pct=round(float(twin_m.coverage_percentage), 2),
                actual_interference_delta=actual_int_delta,
                actual_interference=round(float(twin_m.interference_level), 3),
                actual_energy_delta=actual_energy_delta,
                actual_total_energy=round(float(twin_m.total_energy), 3),
                actual_is_safe=cand.is_safe,
                violated_constraints=cand.violated_constraints,
                actual_objective_score=getattr(cand, "objective_score", 0.0),
                verification_latency_ms=twin_verification_total_ms / max(1, len(candidate_defs)),
            )

            cov_err = round(abs(actual_cov_delta - pred.predicted_coverage_delta), 3)
            int_err = round(abs(actual_int_delta - pred.predicted_interference_delta), 3)
            cov_errors.append(cov_err)
            int_errors.append(int_err)

            is_fn = bool((not cand.is_safe) and pred.predicted_is_safe)
            if is_fn:
                false_negatives += 1
            if not pred.predicted_is_safe:
                unsafe_flagged += 1

            pairs.append(PredictionVerificationPair(
                candidate_id=cand.candidate_id,
                description=cand.description,
                target_cell=cand.target_cell,
                action_type=cand.joint_actions.get(cand.target_cell, {}).get("status", "POWER_ADJUST"),
                prediction=pred,
                verification=twin_verif,
                coverage_error_abs=cov_err,
                interference_error_abs=int_err,
                safety_classification_match=bool(pred.predicted_is_safe == cand.is_safe),
                is_false_negative_risk=is_fn,
            ))

        # Find top candidate according to ML surrogate vs Digital Twin
        top_pred_cand = max(predictions, key=lambda p: (p.predicted_is_safe, p.surrogate_objective_score))
        top_actual_cand = max(evaluated_candidates, key=lambda c: (c.is_safe, getattr(c, "objective_score", -999.0)))

        audit = DecisionIntelligenceAudit(
            cycle=current_cycle,
            decision_id=f"AUDIT-C{current_cycle}-{int(time.time()*1000)%100000}",
            total_candidates_screened=len(candidate_defs),
            ml_inference_total_ms=ml_inference_total_ms,
            twin_verification_total_ms=twin_verification_total_ms,
            candidate_comparisons=pairs,
            top_predicted_candidate_id=top_pred_cand.candidate_id,
            top_verified_candidate_id=top_actual_cand.candidate_id,
            ranking_concordance=bool(top_pred_cand.candidate_id == top_actual_cand.candidate_id),
            mean_coverage_error=round(float(np.mean(cov_errors)), 3) if cov_errors else 0.0,
            mean_interference_error=round(float(np.mean(int_errors)), 3) if int_errors else 0.0,
            unsafe_candidates_flagged=unsafe_flagged,
            false_negatives_count=false_negatives,
        )

        self._audit_history.append(audit)
        if len(self._audit_history) > self._max_audit_records:
            self._audit_history.pop(0)

        return evaluated_candidates, audit

    def get_latest_audit(self) -> Optional[DecisionIntelligenceAudit]:
        return self._audit_history[-1] if self._audit_history else None

    def get_audit_history(self, limit: int = 20) -> List[DecisionIntelligenceAudit]:
        return self._audit_history[-limit:]
