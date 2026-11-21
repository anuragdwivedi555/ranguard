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
    # A reset must also clear the referees' cooldown/hysteresis memory, otherwise the
    # next run inherits stale cell history from before the reset and gets DELAYed.
    from . import referee as referee_routes, scenarios as scenario_routes

    referee_routes.arbitrator.stability_manager.reset()
    scenario_routes.arbitrator.stability_manager.reset()
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
