from fastapi import APIRouter, HTTPException, status
from typing import List, Optional
from pydantic import BaseModel
from ...simulation.state_manager import StateManager
from ...models.command import ControllerCommand
from ...models.decision import RefereeDecision
from ...models.metrics import NetworkMetrics
from ...referee.arbitration_engine import ArbitrationEngine
from ...referee.commit_manager import CommitManager
from ...services.history_service import HistoryService

router = APIRouter(prefix="/api/referee", tags=["Referee"])

arbitrator = ArbitrationEngine()
commit_mgr = CommitManager(arbitrator.guardrails, arbitrator.stability_manager)
history_service = HistoryService.get_instance()


class EvaluateRequest(BaseModel):
    commands: List[ControllerCommand]


class CommitRequest(BaseModel):
    decision: RefereeDecision


class CommitResponse(BaseModel):
    success: bool
    message: str
    metrics: NetworkMetrics


@router.post("/evaluate", response_model=RefereeDecision, summary="Evaluate candidate proposals in shadow simulation")
def evaluate_proposals(req: EvaluateRequest):
    mgr = StateManager.get_instance()
    decision = arbitrator.arbitrate(mgr.network, req.commands)
    return decision


@router.post("/commit", response_model=CommitResponse, summary="Commit a validated arbitration decision to the network")
def commit_decision(req: CommitRequest):
    mgr = StateManager.get_instance()
    success, message, new_metrics = commit_mgr.commit_decision(req.decision, mgr)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=message,
        )
    return CommitResponse(
        success=success,
        message=message,
        metrics=new_metrics,
    )


@router.get("/history", response_model=List[RefereeDecision], summary="Get past referee arbitration decisions")
def get_arbitration_history(limit: int = 50):
    return history_service.get_history(limit=limit)
