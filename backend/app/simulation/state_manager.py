import threading
from typing import Any, Dict, Optional
from .network_engine import NetworkEngine


class StateManager:
    """
    Manages the active singleton simulation state, versioning, and reset logic.
    Thread-safe synchronization protects concurrent operations.
    """
    _instance: Optional["StateManager"] = None
    _lock = threading.RLock()

    def __init__(self, seed: int = 42):
        self.lock = threading.RLock()
        with self.lock:
            self.network = NetworkEngine(seed=seed)
            self.state_version = 1

    @classmethod
    def get_instance(cls, seed: int = 42) -> "StateManager":
        with cls._lock:
            if cls._instance is None:
                cls._instance = StateManager(seed=seed)
            return cls._instance

    @classmethod
    def reset_instance(cls, seed: int = 42) -> "StateManager":
        with cls._lock:
            cls._instance = StateManager(seed=seed)
            return cls._instance

    def reset(self, seed: int = 42) -> None:
        with self.lock:
            self.network = NetworkEngine(seed=seed)
            self.state_version += 1
            self.network.state_version = self.state_version

    def increment_version(self) -> int:
        with self.lock:
            self.state_version += 1
            self.network.state_version = self.state_version
            return self.state_version

    def get_full_state(self) -> Dict[str, Any]:
        """
        Returns serializable full network state for REST API.
        """
        with self.lock:
            return {
                "cycle": self.network.cycle,
                "state_version": self.state_version,
                "metrics": self.network.metrics.model_dump() if self.network.metrics else None,
                "cells": {cid: cell.model_dump() for cid, cell in self.network.cells.items()},
                "users": [user.model_dump() for user in self.users_sample_or_all()],
            }

    def users_sample_or_all(self):
        with self.lock:
            return self.network.users
