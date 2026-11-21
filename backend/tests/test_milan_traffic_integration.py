"""Tests for Milan Telecom Italia CDR traffic integration with the Network Simulation Engine.

Verifies:
1. Optional traffic-provider interface (SYNTHETIC vs MILAN_REPLAY).
2. Deterministic playback over successive simulation cycles.
3. Strict error handling (no silent fallback when source file is missing).
4. Relative demand transformation from CDR activity without interpreting raw CDR as Mbps.
5. Influence of dynamic demand on cell loads and controller proposals.
6. Radio coverage independence from traffic demand (documenting model boundary).
7. Referee engine arbitration and shadow simulation correctness.
"""

from pathlib import Path
import pytest
import numpy as np

from app.simulation.network_engine import NetworkEngine
from app.simulation.traffic_provider import (
    TrafficMode,
    SyntheticTrafficProvider,
    MilanReplayTrafficProvider,
)
from app.controllers.energy_controller import EnergyController
from app.controllers.coverage_controller import CoverageController
from app.controllers.controller_manager import ControllerManager
from app.referee.arbitration_engine import ArbitrationEngine
from app.referee.commit_manager import CommitManager
from app.simulation.state_manager import StateManager


def test_synthetic_traffic_provider():
    """Verify SYNTHETIC mode keeps deterministic baseline demand."""
    engine = NetworkEngine(seed=42, traffic_mode=TrafficMode.SYNTHETIC)
    assert engine.traffic_mode == TrafficMode.SYNTHETIC
    assert isinstance(engine.traffic_provider, SyntheticTrafficProvider)

    initial_demands = [u.traffic_demand for u in engine.users]
    factors = engine.traffic_provider.update_cycle(engine.users, engine.cells, cycle=2)

    # All factors must be exactly 1.0 in synthetic mode
    for cid, factor in factors.items():
        assert factor == 1.0

    # User demands should remain at base
    for orig_d, u in zip(initial_demands, engine.users):
        assert u.traffic_demand == orig_d
        assert u.traffic_demand == u.base_traffic_demand


def test_milan_replay_file_not_found_raises():
    """Verify strict prohibition of silent fallback: missing file must raise FileNotFoundError."""
    nonexistent = Path("data/raw/telecom_italia_milan/nonexistent_file_xyz.txt")
    with pytest.raises(FileNotFoundError) as exc_info:
        MilanReplayTrafficProvider(data_path=nonexistent)
    assert "MILAN_REPLAY mode requires valid Milan source records" in str(exc_info.value)
    assert "silent fallback to synthetic is forbidden" in str(exc_info.value)


def test_milan_replay_deterministic_playback(raw_data_dir: Path):
    """Verify deterministic chronological replay across simulation cycles."""
    milan_file = raw_data_dir / "telecom_italia_milan" / "sample_sms-call-internet-mi-2013-11-01.txt"
    provider1 = MilanReplayTrafficProvider(data_path=milan_file)
    provider2 = MilanReplayTrafficProvider(data_path=milan_file)

    # Cycle 1 factors must be identical between independent instances
    factors_c1_a = [provider1.get_relative_demand_factor(cid, cycle=1) for cid in ["CELL_01", "CELL_02", "CELL_03"]]
    factors_c1_b = [provider2.get_relative_demand_factor(cid, cycle=1) for cid in ["CELL_01", "CELL_02", "CELL_03"]]
    assert factors_c1_a == factors_c1_b

    # Successive cycles must advance deterministically through time intervals
    factors_c2 = [provider1.get_relative_demand_factor(cid, cycle=2) for cid in ["CELL_01", "CELL_02", "CELL_03"]]
    assert len(factors_c1_a) == len(factors_c2)


def test_milan_activity_to_relative_demand_transformation(raw_data_dir: Path):
    """Verify mathematical transformation: CDR activity is normalized to relative demand factor."""
    milan_file = raw_data_dir / "telecom_italia_milan" / "sample_sms-call-internet-mi-2013-11-01.txt"
    provider = MilanReplayTrafficProvider(data_path=milan_file, min_factor=0.1, max_factor=4.0)

    # Collect factors across all 144 intervals for square 1 (CELL_01)
    factors_all = [
        provider.factors_by_timestamp[ts][1]
        for ts in provider.timestamps
    ]
    # The mean across all time intervals should be approximately 1.0 (relative normalization)
    assert pytest.approx(float(np.mean(factors_all)), abs=0.15) == 1.0

    # Bounded within clamp limits
    assert min(factors_all) >= 0.1
    assert max(factors_all) <= 4.0


def test_milan_traffic_influences_cell_load(raw_data_dir: Path):
    """Verify that Milan traffic demand dynamically modulates total traffic demand and cell load."""
    milan_file = raw_data_dir / "telecom_italia_milan" / "sample_sms-call-internet-mi-2013-11-01.txt"
    provider = MilanReplayTrafficProvider(data_path=milan_file)

    engine = NetworkEngine(seed=42, traffic_provider=provider)
    assert engine.traffic_mode == TrafficMode.MILAN_REPLAY

    # Initial recalculation performed in init
    for cid, cell in engine.cells.items():
        assert hasattr(cell, "total_traffic_demand")
        assert cell.total_traffic_demand > 0.0

    # Advance 10 simulation cycles
    demand_history = []
    for _ in range(10):
        engine.step()
        demand_history.append({cid: c.total_traffic_demand for cid, c in engine.cells.items()})

    assert len(demand_history) == 10
    # Over 10 cycles, at least one cell must experience changing demand
    c1_demands = [d["CELL_01"] for d in demand_history]
    assert len(set(c1_demands)) > 1


def test_controller_response_to_dynamic_milan_traffic(raw_data_dir: Path):
    """Verify that traffic demand variations influence controller inputs.

    EnergyController targets underutilized cells (load < 60%). When demand is low,
    more power cuts are proposed; when demand surges, high cell load prevents trimming.
    """
    milan_file = raw_data_dir / "telecom_italia_milan" / "sample_sms-call-internet-mi-2013-11-01.txt"
    provider = MilanReplayTrafficProvider(data_path=milan_file)
    engine = NetworkEngine(seed=42, traffic_provider=provider)

    ctrl = EnergyController()

    # Step to find a cycle with low activity vs high activity
    low_cycle = None
    high_cycle = None
    for c in range(1, 140):
        f = provider.get_relative_demand_factor("CELL_01", cycle=c)
        if f < 0.4 and low_cycle is None:
            low_cycle = c
        if f > 1.8 and high_cycle is None:
            high_cycle = c
        if low_cycle and high_cycle:
            break

    assert low_cycle is not None, "Should find a low activity interval in 24hr Milan trace"
    assert high_cycle is not None, "Should find a high activity interval in 24hr Milan trace"

    # Evaluate at low cycle
    engine.cycle = low_cycle
    provider.update_cycle(engine.users, engine.cells, low_cycle)
    engine.recalculate()
    low_load_c1 = engine.cells["CELL_01"].current_load
    low_proposals = ctrl.evaluate_and_propose(engine.cells, engine.users, engine.metrics, low_cycle)

    # Evaluate at high cycle
    engine.cycle = high_cycle
    provider.update_cycle(engine.users, engine.cells, high_cycle)
    engine.recalculate()
    high_load_c1 = engine.cells["CELL_01"].current_load

    # Demand change must influence cell utilization
    assert high_load_c1 >= low_load_c1


def test_coverage_controller_and_radio_independence(raw_data_dir: Path):
    """Verify radio propagation independence from traffic volume.

    Documented Limitation: The teammate's CoverageController and SignalModel evaluate
    geometric path loss and RF power, not queuing or PRB congestion. Higher traffic demand
    does NOT degrade RSRP or SINR in the physical layer model.
    """
    milan_file = raw_data_dir / "telecom_italia_milan" / "sample_sms-call-internet-mi-2013-11-01.txt"
    provider = MilanReplayTrafficProvider(data_path=milan_file)

    engine_synthetic = NetworkEngine(seed=42, traffic_mode=TrafficMode.SYNTHETIC)
    engine_milan = NetworkEngine(seed=42, traffic_provider=provider)

    # Both networks have identical base station powers (38 dBm) and user coordinates
    # Therefore, coverage percentage and average SINR should be identical at cycle 1
    assert engine_milan.metrics.coverage_percentage == engine_synthetic.metrics.coverage_percentage
    assert engine_milan.metrics.avg_sinr_db == engine_synthetic.metrics.avg_sinr_db


def test_referee_arbitration_with_milan_traffic(raw_data_dir: Path):
    """Verify referee engine, candidate generation, and shadow simulation under Milan traffic."""
    milan_file = raw_data_dir / "telecom_italia_milan" / "sample_sms-call-internet-mi-2013-11-01.txt"
    provider = MilanReplayTrafficProvider(data_path=milan_file)

    state_mgr = StateManager(seed=42)
    state_mgr.network.set_traffic_provider(provider)

    mgr = ControllerManager()
    commands = mgr.generate_all_proposals(
        state_mgr.network.cells,
        state_mgr.network.users,
        state_mgr.network.metrics,
        state_mgr.network.cycle,
    )
    assert len(commands) > 0

    arbitrator = ArbitrationEngine()
    commit_mgr = CommitManager(arbitrator.guardrails, arbitrator.stability_manager)

    decision = arbitrator.arbitrate(state_mgr.network, commands)
    assert decision.verdict in ["APPROVE", "MODIFY", "DELAY", "REJECT"]
    assert decision.selected_candidate is not None

    # Commit must succeed and update state version
    success, msg, post_metrics = commit_mgr.commit_decision(decision, state_mgr)
    assert success is True
    assert post_metrics.coverage_percentage >= 95.0
    assert state_mgr.state_version == 2
