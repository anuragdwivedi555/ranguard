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


class ScenarioPrepareRequest(BaseModel):
    scenario: Literal["TRAFFIC_SPIKE", "CELL_SHUTDOWN"] = Field(
        ..., description="Scenario whose controller proposals should be staged (not arbitrated)"
    )


@router.post("/prepare", summary="Reset to the seeded network and stage a scenario's proposals without arbitrating")
def prepare_scenario(req: ScenarioPrepareRequest) -> Dict[str, Any]:
    from . import referee as referee_routes

    mgr = StateManager.get_instance()
    if req.scenario == "CELL_SHUTDOWN":
        cmd, initial = CellShutdownScenario.prepare(mgr)
        commands, description = [cmd], CellShutdownScenario.DESCRIPTION
    else:
        commands, initial = TrafficSpikeScenario.prepare(mgr)
        description = TrafficSpikeScenario.DESCRIPTION
    # fresh network => fresh cooldown memory
    arbitrator.stability_manager.reset()
    referee_routes.arbitrator.stability_manager.reset()
    return {
        "scenario": req.scenario,
        "description": description,
        "initial_metrics": initial,
        "commands": [c.model_dump() for c in commands],
    }
