from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from typing import Literal, Dict, Any
from ...simulation.state_manager import StateManager
from ...referee.arbitration_engine import ArbitrationEngine
from ...referee.commit_manager import CommitManager
from ...scenarios.cell_shutdown import CellShutdownScenario
from ...scenarios.traffic_spike import TrafficSpikeScenario
from ...scenarios.ping_pong import PingPongScenario

router = APIRouter(prefix="/api/scenarios", tags=["Scenarios"])

arbitrator = ArbitrationEngine()
commit_mgr = CommitManager(arbitrator.guardrails, arbitrator.stability_manager)


class ScenarioRunRequest(BaseModel):
    scenario: Literal["TRAFFIC_SPIKE", "CELL_SHUTDOWN", "PING_PONG"] = Field(
        ..., description="Name of the demonstration scenario to execute"
    )


@router.post("/run", summary="Execute a predefined deterministic demonstration scenario")
def run_scenario(req: ScenarioRunRequest) -> Dict[str, Any]:
    mgr = StateManager.get_instance()

    if req.scenario == "CELL_SHUTDOWN":
        return CellShutdownScenario.run(mgr, arbitrator, commit_mgr)
    elif req.scenario == "TRAFFIC_SPIKE":
        return TrafficSpikeScenario.run(mgr, arbitrator, commit_mgr)
    elif req.scenario == "PING_PONG":
        return PingPongScenario.run(mgr, arbitrator, commit_mgr)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown scenario: {req.scenario}",
        )
