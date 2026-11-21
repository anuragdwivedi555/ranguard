import uuid
from typing import List, Dict
from .base_controller import BaseController
from ..models.command import ControllerCommand
from ..models.cell import Cell
from ..models.user import User
from ..models.metrics import NetworkMetrics


class CoverageController(BaseController):
    """
    Independent Coverage Controller:
    Monitors user coverage, detects edge users with weak RSRP, and proposes power boosts.
    """
    def __init__(self):
        super().__init__("COVERAGE")

    def evaluate_and_propose(
        self,
        cells: dict[str, Cell],
        users: list[User],
        metrics: NetworkMetrics,
        cycle: int,
    ) -> List[ControllerCommand]:
        proposals: List[ControllerCommand] = []

        # Count weak/edge users per cell (RSRP < -75 dBm)
        weak_counts: Dict[str, int] = {cid: 0 for cid in cells}
        for u in users:
            if u.serving_cell and u.serving_cell in cells:
                if u.rsrp_dbm < -75.0 or not u.is_adequately_served:
                    weak_counts[u.serving_cell] += 1

        # Check for cells with significant weak user populations
        for cid, count in weak_counts.items():
            cell = cells[cid]
            if not cell.is_active:
                continue

            # If there are weak users and power is below max
            if count >= 1 and cell.tx_power_dbm < cell.max_tx_power:
                target_power = min(cell.max_tx_power, cell.tx_power_dbm + 3.0)
                proposals.append(
                    ControllerCommand(
                        command_id=f"CMD-COV-{cid}-{cycle}-{uuid.uuid4().hex[:4]}",
                        controller_id="COVERAGE",
                        target_cell=cid,
                        action_type="POWER_UP",
                        current_value=cell.tx_power_dbm,
                        proposed_value=target_power,
                        delta=round(target_power - cell.tx_power_dbm, 1),
                        reason=f"Cell {cid} has {count} users near cell edge (RSRP < -75 dBm); boosting tx power by +3 dBm expands reliable coverage radius.",
                        priority=7,
                        cycle=cycle,
                    )
                )

        return proposals
