from abc import ABC, abstractmethod
from typing import List, Optional
from ..models.command import ControllerCommand
from ..models.cell import Cell
from ..models.user import User
from ..models.metrics import NetworkMetrics


class BaseController(ABC):
    """
    Abstract Base Class for autonomous network controllers.
    Controllers read the current state and generate proposals,
    without ever directly mutating the network.
    """
    def __init__(self, controller_id: str):
        self.controller_id = controller_id

    @abstractmethod
    def evaluate_and_propose(
        self,
        cells: dict[str, Cell],
        users: list[User],
        metrics: NetworkMetrics,
        cycle: int,
    ) -> List[ControllerCommand]:
        """
        Analyzes network state and returns a list of proposed commands.
        Must NOT mutate cells or users.
        """
        pass
