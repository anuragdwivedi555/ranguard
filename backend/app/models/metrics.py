from typing import List
from pydantic import BaseModel, Field


class NetworkMetrics(BaseModel):
    """
    Calculated network-wide Key Performance Indicators (KPIs).
    """
    coverage_percentage: float = Field(..., description="Percentage of adequately served users")
    avg_sinr_db: float = Field(..., description="Average SINR of connected users in dB")
    min_sinr_db: float = Field(..., description="Minimum SINR among connected users in dB")
    avg_rsrp_dbm: float = Field(..., description="Average RSRP of connected users in dBm")
    total_energy: float = Field(..., description="Total normalized network energy consumption")
    interference_level: float = Field(..., description="Total network-wide interference metric")
    active_cells: int = Field(..., description="Number of active cells")
    total_cells: int = Field(default=6, description="Total cells in network")
    connected_users: int = Field(..., description="Users with active cell connection")
    uncovered_users: int = Field(..., description="Users without adequate coverage")
    cell_utilization: float = Field(..., description="Average cell capacity utilization (0 to 1)")
    safety_violations: List[str] = Field(default_factory=list, description="Active hard safety constraint violations")
