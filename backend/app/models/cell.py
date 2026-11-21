from typing import List, Optional
from pydantic import BaseModel, Field


class Cell(BaseModel):
    """
    Represents a mobile network cell (eNodeB / gNodeB) in the simulation.
    """
    cell_id: str
    x: float = Field(..., description="X coordinate in meters")
    y: float = Field(..., description="Y coordinate in meters")
    tx_power_dbm: float = Field(default=38.0, description="Transmission power in dBm")
    min_tx_power: float = Field(default=10.0, description="Minimum allowable tx power in dBm")
    max_tx_power: float = Field(default=46.0, description="Maximum allowable tx power in dBm")
    status: str = Field(default="ACTIVE", description="Operating status: ACTIVE, SLEEP, SHUTDOWN")
    capacity: int = Field(default=30, description="Max connected users capacity")
    current_load: float = Field(default=0.0, description="Normalized load (connected users / capacity)")
    connected_users_count: int = Field(default=0, description="Current number of connected users")
    neighbors: List[str] = Field(default_factory=list, description="IDs of adjacent neighbor cells")
    energy_consumption: float = Field(default=0.0, description="Normalized energy consumption units")
    total_interference_caused: float = Field(default=0.0, description="Interference radiated to neighbors (linear mW)")
    last_action_cycle: Optional[int] = Field(default=None, description="Simulation cycle when power last changed")
    last_power_change: float = Field(default=0.0, description="Delta of the most recent power adjustment (dBm)")

    @property
    def is_active(self) -> bool:
        return self.status == "ACTIVE"
