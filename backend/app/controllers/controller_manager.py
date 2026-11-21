from typing import List
from .energy_controller import EnergyController
from .coverage_controller import CoverageController
from .interference_controller import InterferenceController
from ..models.command import ControllerCommand
from ..models.cell import Cell
from ..models.user import User
from ..models.metrics import NetworkMetrics


class ControllerManager:
    """
    Coordinates execution of all independent controllers and aggregates their proposals.
    Ensures controllers do not mutate active network state.
    """
    def __init__(self):
        self.energy_ctrl = EnergyController()
        self.coverage_ctrl = CoverageController()
        self.interference_ctrl = InterferenceController()
        self.controllers = [self.energy_ctrl, self.coverage_ctrl, self.interference_ctrl]

    def generate_all_proposals(
        self,
        cells: dict[str, Cell],
        users: list[User],
        metrics: NetworkMetrics,
        cycle: int,
    ) -> List[ControllerCommand]:
        proposals: List[ControllerCommand] = []

        # Run each controller independently
        proposals.extend(self.energy_ctrl.evaluate_and_propose(cells, users, metrics, cycle))
        proposals.extend(self.coverage_ctrl.evaluate_and_propose(cells, users, metrics, cycle))
        proposals.extend(self.interference_ctrl.evaluate_and_propose(cells, users, metrics, cycle))

        return proposals
