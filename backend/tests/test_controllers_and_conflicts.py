import pytest
from app.simulation.network_engine import NetworkEngine
from app.controllers.controller_manager import ControllerManager
from app.referee.conflict_detector import ConflictDetector
from app.models.command import ControllerCommand


def test_controllers_generation_and_state_immutability():
    net = NetworkEngine(seed=42)
    initial_pwr = net.cells["CELL_01"].tx_power_dbm
    initial_users = [u.model_dump() for u in net.users]

    manager = ControllerManager()
    commands = manager.generate_all_proposals(net.cells, net.users, net.metrics, net.cycle)

    # Proposals generated
    assert len(commands) > 0

    # Ensure controllers DID NOT mutate the live network state
    assert net.cells["CELL_01"].tx_power_dbm == initial_pwr
    for orig_u, current_u in zip(initial_users, net.users):
        assert current_u.user_id == orig_u["user_id"]
        assert current_u.rsrp_dbm == orig_u["rsrp_dbm"]


def test_direct_conflict_detection():
    net = NetworkEngine(seed=42)
    detector = ConflictDetector()

    # Create direct conflict on CELL_03
    cmds = [
        ControllerCommand(
            command_id="CMD-1",
            controller_id="ENERGY",
            target_cell="CELL_03",
            action_type="POWER_DOWN",
            current_value=38.0,
            proposed_value=25.0,
            delta=-13.0,
            reason="Save power",
            priority=5,
        ),
        ControllerCommand(
            command_id="CMD-2",
            controller_id="COVERAGE",
            target_cell="CELL_03",
            action_type="POWER_UP",
            current_value=38.0,
            proposed_value=43.0,
            delta=5.0,
            reason="Expand range",
            priority=8,
        ),
    ]

    conflicts = detector.detect_conflicts(cmds, net.cells)
    direct_conflicts = [c for c in conflicts if c.conflict_type == "DIRECT"]

    assert len(direct_conflicts) == 1
    conf = direct_conflicts[0]
    assert "CELL_03" in conf.affected_cells
    assert "ENERGY" in conf.involved_controllers
    assert "COVERAGE" in conf.involved_controllers
    assert conf.severity in ["HIGH", "CRITICAL"]


def test_indirect_conflict_detection_between_neighbors():
    net = NetworkEngine(seed=42)
    detector = ConflictDetector()

    # CELL_01 and CELL_02 are adjacent neighbors in our grid
    assert "CELL_02" in net.cells["CELL_01"].neighbors

    cmds = [
        ControllerCommand(
            command_id="CMD-A",
            controller_id="COVERAGE",
            target_cell="CELL_01",
            action_type="POWER_UP",
            current_value=38.0,
            proposed_value=42.0,
            delta=4.0,
            reason="Boost power",
            priority=7,
        ),
        ControllerCommand(
            command_id="CMD-B",
            controller_id="ENERGY",
            target_cell="CELL_02",
            action_type="POWER_DOWN",
            current_value=38.0,
            proposed_value=30.0,
            delta=-8.0,
            reason="Cut power",
            priority=5,
        ),
    ]

    conflicts = detector.detect_conflicts(cmds, net.cells)
    indirect_conflicts = [c for c in conflicts if c.conflict_type == "INDIRECT"]

    assert len(indirect_conflicts) == 1
    conf = indirect_conflicts[0]
    assert "CELL_01" in conf.affected_cells
    assert "CELL_02" in conf.affected_cells
    assert conf.severity == "MEDIUM"
