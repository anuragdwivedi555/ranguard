from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
from pathlib import Path
import pandas as pd

from ...ml.advisor import TrafficAdvisoryEngine
from ...ml.surrogate.engine import DecisionIntelligenceEngine
from ...simulation.state_manager import StateManager

router = APIRouter(prefix="/api/ml", tags=["Machine Learning"])


class MLToggleRequest(BaseModel):
    enabled: bool = Field(..., description="Enable or disable ML predictive advisory")


class MLStatusResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    ml_enabled: bool
    model_loaded: bool
    model_mode: Optional[str] = None
    feature_count: int
    units: str
    cache_entries: int
    status_message: str


class CellAdvisoryItem(BaseModel):
    cell_id: str
    cycle: int
    current_activity_index: float
    predicted_activity_index: float
    trend_delta: float
    predicted_trend: str
    is_surge_predicted: bool
    is_premature_power_cut: bool
    advisory_signal: str
    explanation: str
    unit: str


@router.get("/status", response_model=MLStatusResponse, summary="Get ML forecaster and advisory engine status")
def get_ml_status():
    engine = TrafficAdvisoryEngine.get_instance()
    mode_str = engine.model.mode.value if engine.model else None
    return MLStatusResponse(
        ml_enabled=engine.ml_enabled,
        model_loaded=engine.model is not None and engine.model.is_fitted,
        model_mode=mode_str,
        feature_count=len(engine.feature_names),
        units="activity_index (Milan CDR 10-minute aggregated)",
        cache_entries=len(engine._forecast_cache),
        status_message="Active predictive advisory" if engine.ml_enabled else "Advisory disabled (Physics fallback)",
    )


@router.post("/toggle", response_model=MLStatusResponse, summary="Toggle ML advisory signals on/off")
def toggle_ml(req: MLToggleRequest):
    engine = TrafficAdvisoryEngine.get_instance()
    engine.toggle(req.enabled)
    return get_ml_status()


@router.get("/advisories", response_model=List[CellAdvisoryItem], summary="Get forward demand advisories for all cells")
def get_cell_advisories():
    engine = TrafficAdvisoryEngine.get_instance()
    mgr = StateManager.get_instance()
    cycle = mgr.network.cycle
    provider = getattr(mgr.network, "traffic_provider", None)

    advisories = []
    for cid in mgr.network.cells.keys():
        adv = engine.get_cell_advisory(
            cell_id=cid,
            cycle=cycle,
            traffic_provider=provider,
        )
        advisories.append(CellAdvisoryItem(**adv))
    return advisories


class MLIntelligenceToggleRequest(BaseModel):
    enabled: bool = Field(..., description="Enable or disable on-demand AI Risk Lens surrogate execution")


@router.get("/decision-intelligence/status", summary="Get status of ML action surrogate and decision intelligence")
def get_decision_intelligence_status():
    engine = DecisionIntelligenceEngine.get_instance()
    is_loaded = engine.surrogate is not None and engine.surrogate.is_fitted
    return {
        "enabled": engine.enabled,
        "model_loaded": is_loaded,
        "model_version": "xgb-action-surrogate-v1.0",
        "data_provenance": "Simulated radio environment (3GPP Macro Urban TR 36.814) — not physical testbed",
        "primary_targets": ["Change in network coverage (%)", "Change in interference index"],
        "electrical_power_model": "Deterministic physical RF + static baseband model",
        "audit_records_count": len(engine._audit_history),
    }


@router.post("/decision-intelligence/toggle", summary="Toggle on-demand AI Risk Lens execution")
def toggle_decision_intelligence(req: MLIntelligenceToggleRequest):
    engine = DecisionIntelligenceEngine.get_instance()
    engine.toggle(req.enabled)
    return get_decision_intelligence_status()


@router.get("/decision-intelligence/audit/latest", summary="Get latest 3-panel decision intelligence audit")
def get_latest_intelligence_audit(generate_if_empty: bool = True):
    engine = DecisionIntelligenceEngine.get_instance()
    audit = engine.get_latest_audit()
    if audit is None and generate_if_empty:
        # Generate on-demand audit using current network state
        from ...controllers.controller_manager import ControllerManager
        from ...referee.candidate_generator import CandidateGenerator
        from ...referee.shadow_simulator import ShadowSimulator
        from ...referee.guardrails import SafetyGuardrails
        mgr = StateManager.get_instance()
        ctrl_mgr = ControllerManager()
        cand_gen = CandidateGenerator()
        shadow_sim = ShadowSimulator(SafetyGuardrails())
        commands = ctrl_mgr.generate_all_proposals(
            cells=mgr.network.cells,
            users=mgr.network.users,
            metrics=mgr.network.metrics,
            cycle=mgr.network.cycle,
        )
        if commands:
            c_defs = cand_gen.generate_candidates(commands, mgr.network.cells)
            _, audit = engine.evaluate_with_intelligence_pipeline(
                live_network=mgr.network,
                candidate_defs=c_defs,
                shadow_simulator=shadow_sim,
                force_audit=True,
            )
    if audit is None:
        return {"status": "NO_AUDIT_AVAILABLE", "message": "No arbitration decisions evaluated yet in this session."}
    return audit.model_dump()


@router.get("/decision-intelligence/evaluation", summary="Get held-out evaluation metrics across models")
def get_intelligence_evaluation():
    # repo root = routes -> api -> app -> backend -> <root>
    csv_path = Path(__file__).resolve().parents[4] / "results" / "ml_decision_intelligence_metrics.csv"
    if csv_path.exists():
        df = pd.read_csv(csv_path)
        return {"status": "SUCCESS", "metrics": df.to_dict(orient="records")}
    return {"status": "PENDING", "metrics": []}


class SurrogatePredictRequest(BaseModel):
    target_cell: str = Field(default="CELL_03")
    proposed_power: float = Field(default=34.0)
    proposed_status: str = Field(default="ACTIVE")


@router.post("/decision-intelligence/predict", summary="Predict action outcome using lightweight surrogate")
def predict_candidate_outcome(req: SurrogatePredictRequest):
    engine = DecisionIntelligenceEngine.get_instance()
    mgr = StateManager.get_instance()

    # Task 4: Out-of-Distribution validation check
    valid_cells = list(mgr.network.cells.keys())
    is_ood = False
    warning_msg = None

    if req.target_cell not in valid_cells:
        is_ood = True
        warning_msg = f"Unknown target cell '{req.target_cell}'. Valid cell identifiers: {valid_cells}."
    elif req.proposed_status == "ACTIVE" and (req.proposed_power < 10.0 or req.proposed_power > 46.0):
        is_ood = True
        warning_msg = f"Proposed power {req.proposed_power:.1f} dBm is outside validated operational envelope [10.0, 46.0 dBm]. Tree surrogate extrapolations are unverified."

    c_def = {
        "candidate_id": f"TEST-CAND-{req.target_cell}",
        "target_cell": req.target_cell,
        "proposed_power": req.proposed_power,
        "proposed_status": req.proposed_status,
        "joint_actions": {req.target_cell: {"status": req.proposed_status, "tx_power_dbm": req.proposed_power}},
    }
    if engine.surrogate:
        pred = engine.surrogate.predict_single_candidate(mgr.network, c_def)
        pred.out_of_distribution = is_ood
        pred.ood_warning = warning_msg
        pred.data_provenance = "Simulated radio environment (3GPP Macro Urban TR 36.814) — not physical testbed"
        return pred.model_dump()
    return {"error": "Surrogate model uninitialized"}
