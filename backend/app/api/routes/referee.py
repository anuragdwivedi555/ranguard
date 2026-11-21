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


class CommitCandidateRequest(BaseModel):
    commands: List[ControllerCommand]
    candidate_id: str


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


@router.post("/shadow", summary="Run shadow simulation and return every candidate fork with its full calculation (no commit)")
def shadow_review(req: EvaluateRequest):
    mgr = StateManager.get_instance()
    return arbitrator.review(mgr.network, req.commands)


@router.post("/commit-candidate", summary="Commit the candidate fork chosen by the operator (guardrails still enforced)")
def commit_candidate(req: CommitCandidateRequest):
    mgr = StateManager.get_instance()
    live = mgr.network
    shadow = arbitrator._run_shadow(live, req.commands)
    scored = shadow["scored_candidates"]
    chosen = next((c for c in scored if c.candidate_id == req.candidate_id), None)
    if chosen is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown candidate {req.candidate_id}")
    if not chosen.is_safe:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Blocked by safety guardrails: " + "; ".join(chosen.violated_constraints),
        )
    safe = [c for c in scored if c.is_safe]
    best = max(safe, key=lambda c: c.objective_score)
    others = [c for c in scored if c.candidate_id != chosen.candidate_id]
    decision = arbitrator.build_operator_decision(live, req.commands, chosen, best.candidate_id, others)
    success, message, metrics = commit_mgr.commit_decision(decision, mgr)
    if not success:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=message)
    return {
        "success": True,
        "message": message,
        "decision": decision.model_dump(),
        "metrics": metrics.model_dump(),
        "recommended_id": best.candidate_id,
        "was_override": chosen.candidate_id != best.candidate_id,
    }
