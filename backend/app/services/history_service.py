from typing import List, Optional
from ..models.decision import RefereeDecision


class HistoryService:
    """
    In-memory ledger storing all evaluated and committed decisions throughout the application lifecycle.
    """
    _instance: Optional["HistoryService"] = None

    def __init__(self):
        self.decisions: List[RefereeDecision] = []

    @classmethod
    def get_instance(cls) -> "HistoryService":
        if cls._instance is None:
            cls._instance = HistoryService()
        return cls._instance

    def record_decision(self, decision: RefereeDecision) -> None:
        self.decisions.append(decision)

    def get_history(self, limit: int = 50) -> List[RefereeDecision]:
        return list(reversed(self.decisions))[:limit]

    def clear(self) -> None:
        self.decisions.clear()
