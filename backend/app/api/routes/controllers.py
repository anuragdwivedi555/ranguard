from fastapi import APIRouter
from typing import List
from ...simulation.state_manager import StateManager
from ...controllers.controller_manager import ControllerManager
from ...models.command import ControllerCommand

router = APIRouter(prefix="/api/controllers", tags=["Controllers"])
controller_mgr = ControllerManager()


@router.get("/status", summary="Get status and metadata for all autonomous controllers")
def get_controller_status():
    return [
        {
            "controller_id": c.controller_id,
            "status": "ACTIVE",
            "type": c.__class__.__name__,
            "description": c.__doc__.strip().split("\n")[0] if c.__doc__ else "",
        }
        for c in controller_mgr.controllers
    ]


@router.get("/commands", response_model=List[ControllerCommand], summary="Get autonomous controller proposals for current cycle")
def get_controller_commands():
    mgr = StateManager.get_instance()
    net = mgr.network
    commands = controller_mgr.generate_all_proposals(
        cells=net.cells,
        users=net.users,
        metrics=net.metrics,
        cycle=net.cycle,
    )
    return commands
