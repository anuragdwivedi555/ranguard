from typing import Optional
from pydantic import BaseModel, Field


class User(BaseModel):
    """
    Represents a mobile network subscriber (UE) in the simulation.
    """
    user_id: str
    x: float = Field(..., description="X coordinate in meters")
    y: float = Field(..., description="Y coordinate in meters")
    traffic_demand: float = Field(default=1.0, description="Traffic demand in Mbps (or normalized units)")
    base_traffic_demand: float = Field(default=1.0, description="Deterministic baseline traffic demand (Mbps)")
    serving_cell: Optional[str] = Field(default=None, description="Serving cell ID or None if uncovered")
    rsrp_dbm: float = Field(default=-140.0, description="Received Signal Received Power in dBm")
    sinr_db: float = Field(default=-30.0, description="Signal to Interference-plus-Noise Ratio in dB")
    connection_status: str = Field(default="UNCOVERED", description="CONNECTED or UNCOVERED")
    is_adequately_served: bool = Field(default=False, description="True if RSRP >= -95 dBm and SINR >= 0 dB")
