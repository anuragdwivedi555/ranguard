from fastapi import APIRouter
from typing import Any, Dict
from ...simulation.state_manager import StateManager
from ...models.metrics import NetworkMetrics

router = APIRouter(prefix="/api/network", tags=["Network"])


@router.get("/state", summary="Get full network topology, cells, and connected users")
def get_network_state() -> Dict[str, Any]:
    mgr = StateManager.get_instance()
    return mgr.get_full_state()


@router.get("/metrics", response_model=NetworkMetrics, summary="Get current network Key Performance Indicators")
def get_network_metrics():
    mgr = StateManager.get_instance()
    return mgr.network.metrics
