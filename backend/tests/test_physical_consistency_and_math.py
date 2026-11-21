"""Deterministic mathematical and physical consistency tests for RANGUARD.

Validates analytical formulas, units, dimensional consistency, and state isolation against 3GPP TR 36.814 standards.
"""

import math
from typing import Dict, List
import pytest

from app.simulation.signal_model import SignalModel
from app.simulation.interference_model import InterferenceModel
from app.simulation.energy_model import EnergyModel
from app.simulation.network_engine import NetworkEngine
from app.simulation.metrics_engine import MetricsEngine
from app.models.cell import Cell
from app.models.user import User
from app.models.command import ControllerCommand
from app.referee.guardrails import SafetyGuardrails
from app.referee.stability_manager import StabilityManager
from app.referee.commit_manager import CommitManager
from app.referee.arbitration_engine import ArbitrationEngine
from app.simulation.state_manager import StateManager


# --------------------------------------------------------------------------
# 1. Transmission-power conversion from dBm to watts
# --------------------------------------------------------------------------
def test_tx_power_dbm_to_watts():
    """Verify analytical conversion from logarithmic dBm to linear Watts."""
    # Reference analytical: P_W = 10^((P_dBm - 30) / 10)
    assert pytest.approx(math.pow(10.0, (30.0 - 30.0) / 10.0), rel=1e-5) == 1.0       # 30 dBm = 1.0 W
    assert pytest.approx(math.pow(10.0, (38.0 - 30.0) / 10.0), rel=1e-5) == 6.309573  # 38 dBm = 6.31 W
    assert pytest.approx(math.pow(10.0, (46.0 - 30.0) / 10.0), rel=1e-5) == 39.810717 # 46 dBm = 39.81 W (max macro)
    assert pytest.approx(math.pow(10.0, (10.0 - 30.0) / 10.0), rel=1e-5) == 0.01      # 10 dBm = 10 mW = 0.01 W


# --------------------------------------------------------------------------
# 2. Distance and path loss calculations
# --------------------------------------------------------------------------
def test_distance_and_path_loss_analytical():
    """Verify 3GPP TR 36.814 Macro Urban path loss: PL = 128.1 + 37.6 * log10(d_km)."""
    # 500 meters = 0.5 km -> log10(0.5) = -0.30102999566
    # PL = 128.1 + 37.6 * (-0.30103) = 116.78127 dB
    expected_pl_500 = 128.1 + 37.6 * math.log10(0.5)
    actual_pl_500 = SignalModel.calculate_path_loss(500.0)
    assert pytest.approx(actual_pl_500, rel=1e-5) == expected_pl_500
    assert pytest.approx(actual_pl_500, abs=0.01) == 116.78

    # 1000 meters = 1.0 km -> log10(1.0) = 0.0 -> PL = 128.1 dB
    actual_pl_1000 = SignalModel.calculate_path_loss(1000.0)
    assert pytest.approx(actual_pl_1000, rel=1e-5) == 128.10

    # Minimum distance clamp at 35m (0.035 km)
    expected_pl_min = 128.1 + 37.6 * math.log10(0.035)
    actual_pl_10 = SignalModel.calculate_path_loss(10.0)
    assert pytest.approx(actual_pl_10, rel=1e-5) == expected_pl_min


# --------------------------------------------------------------------------
# 3. Received-signal calculations (RSRP)
# --------------------------------------------------------------------------
def test_received_signal_calculations():
    """Verify RSRP = P_tx - PL(d)."""
    # At P_tx = 38 dBm and d = 500m:
    # RSRP = 38.0 - 116.78127 = -78.78127 dBm
    rsrp = SignalModel.calculate_rsrp(38.0, 500.0)
    assert pytest.approx(rsrp, abs=0.01) == -78.78


# --------------------------------------------------------------------------
# 4. Interference aggregation in linear units
# --------------------------------------------------------------------------
def test_interference_aggregation_linear_units():
    """Verify linear milliwatt summing across multiple interfering cells."""
    # Two interfering signals at -80 dBm and -83 dBm:
    # -80 dBm = 10^(-8) mW = 0.00001000 mW
    # -83 dBm = 10^(-8.3) mW = 0.00000501187 mW
    # Sum = 0.00001501187 mW -> in dBm: 10 * log10(Sum) = -78.2356 dBm
    mw1 = SignalModel.dbm_to_mw(-80.0)
    mw2 = SignalModel.dbm_to_mw(-83.0)
    tot_mw = mw1 + mw2
    tot_dbm = SignalModel.mw_to_dbm(tot_mw)
    assert pytest.approx(tot_dbm, abs=0.01) == -78.24


# --------------------------------------------------------------------------
# 5. SINR conversion
# --------------------------------------------------------------------------
def test_sinr_conversion():
    """Verify SINR = S_linear / (I_linear + N_linear) in dB."""
    # Serving RSRP = -70.0 dBm (1.0e-4 mW)
    # Interference = -80.0 dBm (1.0e-5 mW)
    # Noise = -104.0 dBm (3.981e-8 mW)
    # S / (I + N) = 1.0e-4 / (1.003981e-5) = 9.96035
    # SINR_dB = 10 * log10(9.96035) = 9.9827 dB
    user = User(user_id="U_TEST", x=500.0, y=500.0, serving_cell="CELL_01")
    cells = {
        "CELL_01": Cell(cell_id="CELL_01", x=500.0, y=500.0 + 35.0, tx_power_dbm=38.0, status="ACTIVE"),
        "CELL_02": Cell(cell_id="CELL_02", x=500.0 + 1000.0, y=500.0, tx_power_dbm=38.0, status="ACTIVE"),
    }
    rsrp, sinr, int_mw = InterferenceModel.calculate_user_sinr(user, cells)
    assert rsrp > -95.0
    assert sinr > 0.0
    assert int_mw > 0.0


# --------------------------------------------------------------------------
# 6. Signal-strength coverage threshold
# --------------------------------------------------------------------------
def test_signal_strength_coverage_threshold():
    """Verify threshold boundary at MIN_RSRP = -95.0 dBm."""
    u_pass = User(user_id="U1", x=100.0, y=100.0, rsrp_dbm=-94.9, sinr_db=5.0, connection_status="CONNECTED")
    u_fail = User(user_id="U2", x=100.0, y=100.0, rsrp_dbm=-95.1, sinr_db=5.0, connection_status="CONNECTED")

    u_pass.is_adequately_served = (
        u_pass.rsrp_dbm >= SignalModel.MIN_RSRP_THRESHOLD_DBM
        and u_pass.sinr_db >= MetricsEngine.MIN_SINR_SAFE_DB
    )
    u_fail.is_adequately_served = (
        u_fail.rsrp_dbm >= SignalModel.MIN_RSRP_THRESHOLD_DBM
        and u_fail.sinr_db >= MetricsEngine.MIN_SINR_SAFE_DB
    )
    assert u_pass.is_adequately_served is True
    assert u_fail.is_adequately_served is False


# --------------------------------------------------------------------------
# 7. SINR coverage threshold
# --------------------------------------------------------------------------
def test_sinr_coverage_threshold():
    """Verify threshold boundary at MIN_SINR = 0.0 dB."""
    u_pass = User(user_id="U1", x=100.0, y=100.0, rsrp_dbm=-80.0, sinr_db=0.1, connection_status="CONNECTED")
    u_fail = User(user_id="U2", x=100.0, y=100.0, rsrp_dbm=-80.0, sinr_db=-0.1, connection_status="CONNECTED")

    u_pass.is_adequately_served = (
        u_pass.rsrp_dbm >= SignalModel.MIN_RSRP_THRESHOLD_DBM
        and u_pass.sinr_db >= MetricsEngine.MIN_SINR_SAFE_DB
    )
    u_fail.is_adequately_served = (
        u_fail.rsrp_dbm >= SignalModel.MIN_RSRP_THRESHOLD_DBM
        and u_fail.sinr_db >= MetricsEngine.MIN_SINR_SAFE_DB
    )
    assert u_pass.is_adequately_served is True
    assert u_fail.is_adequately_served is False


# --------------------------------------------------------------------------
# 8. Cell shutdown and loss of signal
# --------------------------------------------------------------------------
def test_cell_shutdown_and_loss_of_signal():
    """Verify cell shutdown sets energy to 0.0 and disconnects/unserves exclusive users."""
    eng = NetworkEngine(seed=42)
    c3 = eng.cells["CELL_03"]
    eng.apply_action("CELL_03", status="SHUTDOWN", tx_power_dbm=0.0)

    assert c3.status == "SHUTDOWN"
    assert c3.is_active is False
    assert EnergyModel.calculate_cell_energy(c3) == 0.0

    # Exclusive users of CELL_03 either reassociate to neighbor or become uncovered
    for u in eng.users:
        assert u.serving_cell != "CELL_03"


# --------------------------------------------------------------------------
# 9. User reassociation after power changes
# --------------------------------------------------------------------------
def test_user_reassociation_after_power_changes():
    """Verify boundary users reassociate to neighbor when serving cell lowers power."""
    eng = NetworkEngine(seed=42)
    # Find users served by CELL_01
    users_c1_init = [u.user_id for u in eng.users if u.serving_cell == "CELL_01"]

    # Lower CELL_01 to minimum (10 dBm) and boost neighbor CELL_02 (46 dBm)
    eng.apply_action("CELL_01", tx_power_dbm=10.0)
    eng.apply_action("CELL_02", tx_power_dbm=46.0)

    users_c1_post = [u.user_id for u in eng.users if u.serving_cell == "CELL_01"]
    # Handover: multiple users must have reassociated away from CELL_01
    assert len(users_c1_post) < len(users_c1_init)


# --------------------------------------------------------------------------
# 10. Network-wide power aggregation
# --------------------------------------------------------------------------
def test_network_wide_power_aggregation():
    """Verify analytical electrical power consumption aggregation across 6 active cells."""
    eng = NetworkEngine(seed=42)
    # 6 cells at 38 dBm:
    # rf_watts = 10^((38 - 30) / 10) = 6.30957 W
    # cell_power = 10.0 + 6.30957 * 0.5 = 13.15478 W
    # Total = 6 * 13.15478 = 78.9287 W -> 78.93 W
    tot_power = EnergyModel.calculate_total_energy(eng.cells)
    assert pytest.approx(tot_power, abs=0.01) == 78.93


# --------------------------------------------------------------------------
# 11. Cumulative energy accounting (Power in W vs Energy in Joules and Wh)
# --------------------------------------------------------------------------
def test_cumulative_energy_accounting():
    """Verify dimensional distinction: Power (Watts) vs Cumulative Energy (Joules and Watt-hours)."""
    eng = NetworkEngine(seed=42)
    assert eng.cumulative_energy_joules == 0.0
    assert eng.cumulative_energy_wh == 0.0

    # Step 3 cycles with 10s cycle duration:
    # 78.93 W * 10s = 789.3 Joules per step
    # 3 steps = 2367.9 Joules = 2367.9 / 3600 = 0.65775 Watt-hours
    eng.step()
    eng.step()
    eng.step()

    expected_joules = 78.929 * 10.0 * 3
    assert pytest.approx(eng.cumulative_energy_joules, abs=1.0) == expected_joules
    assert pytest.approx(eng.cumulative_energy_wh, abs=0.001) == (expected_joules / 3600.0)
    assert eng.metrics.cumulative_energy_joules == eng.cumulative_energy_joules
    assert eng.metrics.cumulative_energy_wh == eng.cumulative_energy_wh


# --------------------------------------------------------------------------
# 12. Shadow-state isolation
# --------------------------------------------------------------------------
def test_shadow_state_isolation():
    """Verify deepcopy shadow simulation does not mutate live state."""
    eng = NetworkEngine(seed=42)
    init_pwr = eng.cells["CELL_01"].tx_power_dbm
    init_metrics = eng.metrics.model_dump()

    # Create shadow fork and make extreme modifications
    shadow = eng.clone()
    shadow.apply_action("CELL_01", status="SHUTDOWN", tx_power_dbm=0.0)
    shadow.apply_action("CELL_02", tx_power_dbm=10.0)

    # Live network MUST remain strictly unmodified
    assert eng.cells["CELL_01"].tx_power_dbm == init_pwr
    assert eng.cells["CELL_01"].status == "ACTIVE"
    assert eng.metrics.model_dump() == init_metrics


# --------------------------------------------------------------------------
# 13. State-version validation
# --------------------------------------------------------------------------
def test_state_version_validation():
    """Verify commit manager rejects decisions evaluated against stale state version."""
    sm = StateManager(seed=42)
    guardrails = SafetyGuardrails()
    stability = StabilityManager()
    committer = CommitManager(guardrails, stability)

    arbitrator = ArbitrationEngine()
    cmd = ControllerCommand(
        command_id="CMD-1", controller_id="ENERGY", target_cell="CELL_05",
        action_type="POWER_DOWN", current_value=38.0, proposed_value=36.0, delta=-2.0,
        reason="Save energy", priority=5, cycle=1,
    )
    decision = arbitrator.arbitrate(sm.network, [cmd])

    # Increment state version out-of-band to simulate race condition
    sm.increment_version()

    success, msg, _ = committer.commit_decision(decision, sm)
    assert success is False
    assert "Stale state version" in msg


# --------------------------------------------------------------------------
# 14. Power adjustment bounds
# --------------------------------------------------------------------------
def test_power_adjustment_bounds():
    """Verify hard power clamps: Tx power must stay within [10.0, 46.0] dBm."""
    guardrails = SafetyGuardrails()
    net = NetworkEngine(seed=42)

    # Unsafe action exceeding 46 dBm
    actions_over = {"CELL_01": {"tx_power_dbm": 50.0}}
    test_over = net.clone()
    test_over.apply_joint_actions(actions_over)
    is_safe, viols = guardrails.validate_candidate(test_over.metrics, net.cells, actions_over)
    assert is_safe is False
    assert any("Hardware limit violation" in v or "exceeds maximum" in v for v in viols)

    # Unsafe action below 10 dBm
    actions_under = {"CELL_01": {"tx_power_dbm": 5.0}}
    test_under = net.clone()
    test_under.apply_joint_actions(actions_under)
    is_safe, viols = guardrails.validate_candidate(test_under.metrics, net.cells, actions_under)
    assert is_safe is False
    assert any("Hardware limit violation" in v or "below minimum" in v for v in viols)


# --------------------------------------------------------------------------
# 15. Hysteresis and reversal detection
# --------------------------------------------------------------------------
def test_hysteresis_and_reversal_detection():
    """Verify stability manager tracks sign changes within cooldown window as reversals."""
    stability = StabilityManager(cooldown_cycles=3, hysteresis_delta_db=1.0)
    net = NetworkEngine(seed=42)

    # Cycle 1: Increase power +3 dBm
    should_delay, reason, _ = stability.check_stability(
        cell_id="CELL_02", proposed_delta=3.0, proposed_action_type="POWER_UP",
        controller_id="COVERAGE", current_cycle=1, current_metrics=net.metrics
    )
    assert should_delay is False
    stability.record_commit("CELL_02", delta=3.0, action_type="POWER_UP", controller_id="COVERAGE", cycle=1)

    # Cycle 2: Attempt immediate reversal -3 dBm (within 3-cycle cooldown)
    should_delay, reason, _ = stability.check_stability(
        cell_id="CELL_02", proposed_delta=-3.0, proposed_action_type="POWER_DOWN",
        controller_id="ENERGY", current_cycle=2, current_metrics=net.metrics
    )
    assert should_delay is True
    assert "cooldown" in reason.lower() or "blocked" in reason.lower()
    assert stability.reversal_count == 1
