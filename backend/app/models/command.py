from typing import Literal, Optional
from pydantic import BaseModel, Field
import time


class ControllerCommand(BaseModel):
    """
    Proposed action submitted by an autonomous network controller.
    """
    command_id: str = Field(..., description="Unique ID for the command proposal")
    controller_id: Literal["ENERGY", "COVERAGE", "INTERFERENCE"] = Field(..., description="Originating controller")
    target_cell: str = Field(..., description="Target cell ID (e.g. CELL_03)")
    action_type: Literal["POWER_DOWN", "POWER_UP", "SHUTDOWN", "SLEEP", "WAKEUP", "MAINTAIN"] = Field(
        ..., description="Type of action proposed"
    )
    current_value: float = Field(..., description="Current power or operational state value")
    proposed_value: float = Field(..., description="Proposed power or operational state value")
    delta: float = Field(default=0.0, description="Change magnitude (e.g. proposed - current)")
    reason: str = Field(..., description="Detailed explanation of the motivation")
    priority: int = Field(default=5, description="Internal controller priority (1=low, 10=critical)")
    cycle: int = Field(default=1, description="Simulation cycle number")
    timestamp: float = Field(default_factory=time.time, description="Creation timestamp")
