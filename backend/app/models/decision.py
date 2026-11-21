from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field
import time
from .command import ControllerCommand
from .metrics import NetworkMetrics


class CandidateAction(BaseModel):
    """
    Candidate joint action evaluated during shadow simulation.
    """
    candidate_id: str
    description: str
    target_cell: str
    proposed_power: float
    proposed_status: str = "ACTIVE"
    joint_actions: Dict[str, Any] = Field(default_factory=dict, description="Cell modifications: {cell_id: {'tx_power_dbm': x, 'status': s}}")
    predicted_metrics: NetworkMetrics
    is_safe: bool = True
    violated_constraints: List[str] = Field(default_factory=list)
    objective_score: float = 0.0
    energy_score: float = 0.0
    interference_score: float = 0.0
    coverage_score: float = 0.0
    change_score: float = 0.0
    explanation: str = ""


class ConflictReport(BaseModel):
    """
    Detected conflict between controller commands.
    """
    conflict_id: str
    conflict_type: Literal["DIRECT", "INDIRECT"]
    involved_controllers: List[str]
    affected_cells: List[str]
    conflicting_commands: List[ControllerCommand]
    affected_kpis: List[str]
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    explanation: str


class RefereeDecision(BaseModel):
    """
    Arbitration decision produced by RANGUARD.
    """
    decision_id: str
    cycle: int
    verdict: Literal["APPROVE", "MODIFY", "DELAY", "REJECT"]
    original_proposals: List[ControllerCommand]
    selected_candidate: Optional[CandidateAction] = None
    selected_action: Dict[str, Any] = Field(default_factory=dict, description="Actions to commit {cell_id: {...}}")
    reason: str
    rejected_alternatives: List[Dict[str, Any]] = Field(default_factory=list)
    safety_validation: Dict[str, Any] = Field(default_factory=dict)
    predicted_kpi_impact: Dict[str, float] = Field(default_factory=dict)
    actual_kpi_impact: Optional[Dict[str, float]] = None
    optimization_score: float = 0.0
    controllers_involved: List[str] = Field(default_factory=list)
    state_version: int
    computation_time_ms: float = 0.0
    timestamp: float = Field(default_factory=time.time)
    committed: bool = False
    predictive_advisory: Optional[Dict[str, Any]] = Field(default=None, description="ML traffic forecast and capacity advisory signal")
