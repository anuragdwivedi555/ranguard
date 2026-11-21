from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
from ...ml.advisor import TrafficAdvisoryEngine
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
