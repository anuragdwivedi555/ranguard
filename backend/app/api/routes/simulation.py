from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional
from ...simulation.state_manager import StateManager
from ...models.metrics import NetworkMetrics

router = APIRouter(prefix="/api/simulation", tags=["Simulation"])


class ResetRequest(BaseModel):
    seed: int = Field(default=42, description="Random seed for deterministic initialization")


@router.post("/reset", response_model=NetworkMetrics, summary="Reset simulation to deterministic state")
def reset_simulation(req: Optional[ResetRequest] = None):
    seed = req.seed if req else 42
    mgr = StateManager.get_instance()
    mgr.reset(seed=seed)
    return mgr.network.metrics


@router.post("/step", summary="Advance simulation by one cycle")
def step_simulation():
    mgr = StateManager.get_instance()
    new_cycle = mgr.network.step()
    mgr.increment_version()
    return {
        "cycle": new_cycle,
        "state_version": mgr.state_version,
        "metrics": mgr.network.metrics,
    }
