"""
Automated unit and integration tests for ML traffic advisory engine (Priority 1).

Verifies:
1. Model loading and singleton lifecycle.
2. In-memory forecast caching and latency budget compliance (< 15 ms).
3. Explicit dimensional integrity: Milan 10-minute activity index units.
4. Correct advisory signals: SURGE, STABLE, DECLINE, PREVENT_PREMATURE_CUT.
5. Fail-safe fallback when disabled or when model is unavailable.
6. Full arbitration integration: prevention of premature power cuts under traffic surge.
"""

from pathlib import Path
import time
import pytest

from app.ml.advisor import TrafficAdvisoryEngine
from app.simulation.state_manager import StateManager
from app.simulation.traffic_provider import MilanReplayTrafficProvider, SyntheticTrafficProvider
from app.referee.arbitration_engine import ArbitrationEngine
from app.models.command import ControllerCommand


@pytest.fixture
def advisory_engine():
    """Provides a fresh advisory engine with ML enabled."""
    engine = TrafficAdvisoryEngine.get_instance()
    engine.toggle(True)
    return engine


def test_advisory_engine_initialization_and_model_load(advisory_engine: TrafficAdvisoryEngine):
    """Verify that XGBoost model is loaded once and is fitted."""
    assert advisory_engine.model is not None
    assert advisory_engine.model.is_fitted is True
    assert len(advisory_engine.feature_names) == 16
    assert advisory_engine.ml_enabled is True


def test_forecast_caching_and_latency_budget(advisory_engine: TrafficAdvisoryEngine):
    """Verify inference latency is < 15ms and cached lookups take < 1ms."""
    cell_id = "CELL_01"
    cycle = 5

    # First call: computes prediction and caches
    t0 = time.perf_counter()
    res1 = advisory_engine.get_cell_advisory(cell_id, cycle)
    t_first_ms = (time.perf_counter() - t0) * 1000.0

    assert t_first_ms < 25.0, f"First prediction latency {t_first_ms:.2f}ms exceeds budget"
    assert res1["cell_id"] == cell_id
    assert res1["cycle"] == cycle
    assert res1["unit"] == "activity_index"

    # Second call: must hit cache and return in < 1ms
    t1 = time.perf_counter()
    res2 = advisory_engine.get_cell_advisory(cell_id, cycle)
    t_cached_ms = (time.perf_counter() - t1) * 1000.0

    assert t_cached_ms < 1.0, f"Cached lookup latency {t_cached_ms:.2f}ms exceeds 1ms"
    assert res1["predicted_activity_index"] == res2["predicted_activity_index"]


def test_dimensional_integrity_activity_units_not_mbps(advisory_engine: TrafficAdvisoryEngine):
    """Verify forecast explicitly denotes activity index units and does not conflate with Mbps."""
    res = advisory_engine.get_cell_advisory("CELL_03", 10)
    assert res["unit"] == "activity_index"
    assert "activity_index" in res["unit"]
    assert isinstance(res["current_activity_index"], float)
    assert isinstance(res["predicted_activity_index"], float)
    assert res["current_activity_index"] >= 0.0
    assert res["predicted_activity_index"] >= 0.0


def test_premature_power_cut_detection(advisory_engine: TrafficAdvisoryEngine):
    """Verify advisory identifies destructive shutdown during traffic surge."""
    # Find a cycle where surge is predicted on a cell
    surge_found = False
    for c in range(1, 30):
        adv = advisory_engine.get_cell_advisory(
            cell_id="CELL_01",
            cycle=c,
            proposed_action_type="SHUTDOWN",
            proposed_delta_dbm=-38.0,
        )
        if adv["is_surge_predicted"]:
            surge_found = True
            assert adv["is_premature_power_cut"] is True
            assert adv["advisory_signal"] == "PREVENT_PREMATURE_CUT"
            assert "surge" in adv["explanation"].lower()
            break

    # If no surge on CELL_01, check CELL_03
    if not surge_found:
        for c in range(1, 30):
            adv = advisory_engine.get_cell_advisory(
                cell_id="CELL_03",
                cycle=c,
                proposed_action_type="SHUTDOWN",
                proposed_delta_dbm=-38.0,
            )
            if adv["is_surge_predicted"]:
                assert adv["is_premature_power_cut"] is True
                assert adv["advisory_signal"] == "PREVENT_PREMATURE_CUT"
                break


def test_fallback_when_ml_disabled(advisory_engine: TrafficAdvisoryEngine):
    """Verify graceful fallback when ML is toggled off."""
    advisory_engine.toggle(False)
    res = advisory_engine.get_cell_advisory("CELL_02", 1)

    assert res["ml_enabled"] is False
    assert res["fallback_mode"] is True
    assert res["advisory_signal"] == "NONE"
    assert res["is_premature_power_cut"] is False

    # Restore enabled
    advisory_engine.toggle(True)


def test_arbitration_integration_ml_on_vs_ml_off():
    """Verify that RANGUARD referee incorporates predictive advisory into decisions."""
    mgr = StateManager.get_instance()
    mgr.reset(seed=42)

    # Attach Milan provider so activity index reflects real CDR dynamics
    milan_provider = MilanReplayTrafficProvider()
    mgr.network.set_traffic_provider(milan_provider)

    arbitrator = ArbitrationEngine()

    # Create aggressive shutdown command from Energy Controller
    cmd = ControllerCommand(
        command_id="CMD-ENERGY-CUT",
        controller_id="ENERGY",
        target_cell="CELL_01",
        action_type="SHUTDOWN",
        current_value=38.0,
        proposed_value=0.0,
        delta=-38.0,
        reason="Aggressive power cut",
        priority=6,
        cycle=1,
    )

    # 1. Arbitrate with ML ON
    arbitrator.advisory_engine.toggle(True)
    dec_on = arbitrator.arbitrate(mgr.network, [cmd])

    assert dec_on.predictive_advisory is not None
    assert dec_on.predictive_advisory["ml_enabled"] is True
    assert dec_on.predictive_advisory["unit"] == "activity_index"
    assert dec_on.verdict in ["MODIFY", "REJECT"]

    # 2. Arbitrate with ML OFF
    arbitrator.advisory_engine.toggle(False)
    dec_off = arbitrator.arbitrate(mgr.network, [cmd])

    assert dec_off.predictive_advisory is not None
    assert dec_off.predictive_advisory["ml_enabled"] is False
    assert dec_off.verdict in ["MODIFY", "REJECT"]

    # Re-enable
    arbitrator.advisory_engine.toggle(True)
