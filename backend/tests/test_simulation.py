import pytest
from app.simulation.network_engine import NetworkEngine
from app.simulation.signal_model import SignalModel
from app.simulation.energy_model import EnergyModel


def test_initial_network_configuration():
    engine = NetworkEngine(seed=42)
    assert len(engine.cells) == 6
    assert len(engine.users) == 100
    assert engine.cycle == 1

    # Check that cells have expected default properties
    for cid, cell in engine.cells.items():
        assert cell.status == "ACTIVE"
        assert cell.tx_power_dbm == 38.0
        assert len(cell.neighbors) > 0

    # Check calculated metrics
    metrics = engine.metrics
    assert metrics is not None
    assert metrics.coverage_percentage >= 95.0
    assert metrics.avg_sinr_db > 5.0
    assert metrics.active_cells == 6
    assert metrics.total_energy > 0.0


def test_signal_model_calculations():
    # At 500m, path loss should be around 116.8 dB
    pl_500 = SignalModel.calculate_path_loss(500.0)
    assert 115.0 < pl_500 < 118.0

    # At 38 dBm tx power, RSRP at 500m should be ~ -78.8 dBm
    rsrp_500 = SignalModel.calculate_rsrp(38.0, 500.0)
    assert -80.0 < rsrp_500 < -77.0

    # Check dBm to mW conversion
    assert pytest.approx(SignalModel.dbm_to_mw(30.0), 0.01) == 1000.0  # 30 dBm = 1000 mW = 1 W
    assert pytest.approx(SignalModel.mw_to_dbm(1000.0), 0.01) == 30.0


def test_energy_model_behavior():
    engine = NetworkEngine(seed=42)
    initial_energy = engine.metrics.total_energy

    # Shutdown CELL_03
    engine.apply_action("CELL_03", status="SHUTDOWN")
    assert engine.cells["CELL_03"].status == "SHUTDOWN"
    assert engine.cells["CELL_03"].energy_consumption == 0.0

    # Total energy must strictly decrease
    assert engine.metrics.total_energy < initial_energy
    # Coverage must degrade when CELL_03 is shut down
    assert engine.metrics.coverage_percentage < 95.0


def test_shadow_simulation_cloning_isolation():
    engine = NetworkEngine(seed=42)
    original_power = engine.cells["CELL_03"].tx_power_dbm
    original_energy = engine.metrics.total_energy

    # Create clone
    shadow = engine.clone()
    shadow.apply_action("CELL_03", tx_power_dbm=20.0)

    # Shadow should be updated
    assert shadow.cells["CELL_03"].tx_power_dbm == 20.0
    assert shadow.metrics.total_energy < original_energy

    # Original engine MUST remain completely unchanged
    assert engine.cells["CELL_03"].tx_power_dbm == original_power
    assert engine.metrics.total_energy == original_energy
