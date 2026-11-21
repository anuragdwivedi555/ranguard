import uuid
from typing import List
from .base_controller import BaseController
from ..models.command import ControllerCommand
from ..models.cell import Cell
from ..models.user import User
from ..models.metrics import NetworkMetrics


class EnergyController(BaseController):
    """
    Independent Energy Controller:
    Aims to reduce power consumption across underutilized or redundant cells.
    """
    def __init__(self):
        super().__init__("ENERGY")

    def evaluate_and_propose(
        self,
        cells: dict[str, Cell],
        users: list[User],
        metrics: NetworkMetrics,
        cycle: int,
    ) -> List[ControllerCommand]:
        proposals: List[ControllerCommand] = []

        # Find underutilized cells
        for cid, cell in cells.items():
            if not cell.is_active:
                continue

            # If cell load is under 60% capacity and power > min_tx_power
            if cell.current_load < 0.60 and cell.tx_power_dbm > cell.min_tx_power:
                # Propose reducing power by 3-4 dBm
                trim = 4.0 if cell.current_load < 0.45 else 2.0
                target_power = max(cell.min_tx_power, cell.tx_power_dbm - trim)
                proposals.append(
                    ControllerCommand(
                        command_id=f"CMD-NRG-{cid}-{cycle}-{uuid.uuid4().hex[:4]}",
                        controller_id="ENERGY",
                        target_cell=cid,
                        action_type="POWER_DOWN",
                        current_value=cell.tx_power_dbm,
                        proposed_value=target_power,
                        delta=round(target_power - cell.tx_power_dbm, 1),
                        reason=f"Cell {cid} has spare capacity ({cell.current_load*100:.1f}% load); trimming tx power reduces normalized energy consumption.",
                        priority=5,
                        cycle=cycle,
                    )
                )

        return proposals
