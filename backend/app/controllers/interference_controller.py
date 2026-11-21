import uuid
from typing import List, Dict
from .base_controller import BaseController
from ..models.command import ControllerCommand
from ..models.cell import Cell
from ..models.user import User
from ..models.metrics import NetworkMetrics


class InterferenceController(BaseController):
    """
    Independent Interference Controller:
    Detects severe inter-cell interference, low SINR users, and proposes targeted power trimming.
    """
    def __init__(self):
        super().__init__("INTERFERENCE")

    def evaluate_and_propose(
        self,
        cells: dict[str, Cell],
        users: list[User],
        metrics: NetworkMetrics,
        cycle: int,
    ) -> List[ControllerCommand]:
        proposals: List[ControllerCommand] = []

        # Find cells with high radiated interference or where neighbor SINR is suffering
        for cid, cell in cells.items():
            if not cell.is_active:
                continue

            # If cell causes high radiated interference to neighbors
            if cell.total_interference_caused > 30.0 and cell.tx_power_dbm > 32.0:
                target_power = max(cell.min_tx_power, cell.tx_power_dbm - 3.0)
                proposals.append(
                    ControllerCommand(
                        command_id=f"CMD-INT-{cid}-{cycle}-{uuid.uuid4().hex[:4]}",
                        controller_id="INTERFERENCE",
                        target_cell=cid,
                        action_type="POWER_DOWN",
                        current_value=cell.tx_power_dbm,
                        proposed_value=target_power,
                        delta=round(target_power - cell.tx_power_dbm, 1),
                        reason=f"Cell {cid} causes elevated interference index ({cell.total_interference_caused:.1f}) to neighbor clusters; trimming tx power improves neighbor SINR.",
                        priority=6,
                        cycle=cycle,
                    )
                )

        return proposals
