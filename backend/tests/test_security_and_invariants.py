import pytest
import threading
from backend.app.simulation.state_manager import StateManager
from backend.app.simulation.network_engine import NetworkEngine
from backend.app.referee.arbitration_engine import ArbitrationEngine
from backend.app.referee.commit_manager import CommitManager
from backend.app.referee.optimizer import ObjectiveOptimizer
from backend.app.models.command import ControllerCommand
from backend.app.models.decision import RefereeDecision, CandidateAction
from backend.app.models.metrics import NetworkMetrics


def test_forged_is_safe_payload_rejected_by_commit():
    """Security Gate: Ensure a forged is_safe=True payload cannot bypass pre-commit dry-run guardrails."""
    state_mgr = StateManager.reset_instance(seed=42)
    arbitrator = ArbitrationEngine()
    commit_mgr = CommitManager(arbitrator.guardrails, arbitrator.stability_manager)

    # Forged action: 60 dBm exceeds max 46 dBm hardware limit
    forged_action = {"CELL_01": {"status": "ACTIVE", "tx_power_dbm": 60.0}}
    forged_candidate = CandidateAction(
        candidate_id="CAND-FORGED",
        description="Forged candidate claiming is_safe",
        target_cell="CELL_01",
        proposed_power=60.0,
        proposed_status="ACTIVE",
        joint_actions=forged_action,
        predicted_metrics=state_mgr.network.metrics,
        is_safe=True,  # Attacker forged is_safe
        violated_constraints=[],
        objective_score=999.0,
    )
    forged_decision = RefereeDecision(
        decision_id="DEC-FORGED-001",
        cycle=state_mgr.network.cycle,
        verdict="APPROVE",
        original_proposals=[],
        selected_candidate=forged_candidate,
        selected_action=forged_action,
        reason="Attacker forged payload",
        rejected_alternatives=[],
        safety_validation={"is_safe": True, "violated_constraints": []},
        predicted_kpi_impact={},
        optimization_score=999.0,
        controllers_involved=["ENERGY"],
        state_version=state_mgr.state_version,
    )

    orig_power = state_mgr.network.cells["CELL_01"].tx_power_dbm
    success, message, _ = commit_mgr.commit_decision(forged_decision, state_mgr)

    assert success is False, "Forged payload must be rejected"
    assert "Pre-commit safety check failed" in message
    assert "Hardware limit violation" in message
    assert state_mgr.network.cells["CELL_01"].tx_power_dbm == orig_power, "Live state must not be modified"


def test_invalid_cell_id_rejected():
    """Security Gate: Ensure unknown or malicious target_cell IDs are rejected cleanly."""
    state_mgr = StateManager.reset_instance(seed=42)
    arbitrator = ArbitrationEngine()

    malicious_cmd = ControllerCommand(
        command_id="CMD-MALICIOUS-1",
        controller_id="ENERGY",
        target_cell="CELL_NONEXISTENT_99",
        action_type="POWER_UP",
        current_value=30.0,
        proposed_value=40.0,
        delta=10.0,
        reason="Probe non-existent infrastructure",
        priority=10,
        cycle=1,
    )

    with pytest.raises(ValueError, match="Invalid target cell"):
        arbitrator.arbitrate(state_mgr.network, [malicious_cmd])


def test_concurrent_state_manager_thread_safety():
    """Security Gate: Verify StateManager lock guarantees thread-safe synchronization."""
    state_mgr = StateManager.reset_instance(seed=42)
    errors = []

    def worker(worker_id: int):
        try:
            for _ in range(50):
                state_mgr.increment_version()
                st = state_mgr.get_full_state()
                assert st["state_version"] >= 1
                assert "cells" in st
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(errors) == 0, f"Thread errors encountered: {errors}"
    assert state_mgr.state_version == 1 + (8 * 50)


def test_per_cell_cooldown_does_not_block_unrelated_cells():
    """Safety Gate: Ensure cooldown on CELL_02 does not delay a safe proposal on CELL_05."""
    state_mgr = StateManager.reset_instance(seed=42)
    arbitrator = ArbitrationEngine()
    commit_mgr = CommitManager(arbitrator.guardrails, arbitrator.stability_manager)

    # Cycle 1: modify CELL_02
    cmd1 = ControllerCommand(
        command_id="CMD-1",
        controller_id="ENERGY",
        target_cell="CELL_02",
        action_type="POWER_DOWN",
        current_value=38.0,
        proposed_value=34.0,
        delta=-4.0,
        reason="Save power on cell 2",
        priority=5,
        cycle=1,
    )
    d1 = arbitrator.arbitrate(state_mgr.network, [cmd1])
    commit_mgr.commit_decision(d1, state_mgr)

    # Cycle 2: propose power adjustment on CELL_05 (unrelated cell with no cooldown)
    cmd2 = ControllerCommand(
        command_id="CMD-2",
        controller_id="COVERAGE",
        target_cell="CELL_05",
        action_type="POWER_UP",
        current_value=38.0,
        proposed_value=40.0,
        delta=2.0,
        reason="Boost cell 5",
        priority=6,
        cycle=2,
    )
    d2 = arbitrator.arbitrate(state_mgr.network, [cmd2])
    assert d2.verdict != "DELAY", f"CELL_05 should not be delayed by CELL_02 cooldown. Verdict: {d2.verdict}, reason: {d2.reason}"


def test_shadow_simulation_does_not_mutate_live_state():
    """Safety Gate: Verify that shadow evaluation and operator review never mutate live state."""
    state_mgr = StateManager.reset_instance(seed=42)
    arbitrator = ArbitrationEngine()

    c3_power_before = state_mgr.network.cells["CELL_03"].tx_power_dbm
    cycle_before = state_mgr.network.cycle
    version_before = state_mgr.state_version

    cmd = ControllerCommand(
        command_id="CMD-SHUTDOWN",
        controller_id="ENERGY",
        target_cell="CELL_03",
        action_type="SHUTDOWN",
        current_value=c3_power_before,
        proposed_value=0.0,
        delta=-c3_power_before,
        reason="Shadow simulation test",
        priority=10,
        cycle=cycle_before,
    )

    review_res = arbitrator.review(state_mgr.network, [cmd])
    assert review_res["state_version"] == version_before

    assert state_mgr.network.cells["CELL_03"].tx_power_dbm == c3_power_before
    assert state_mgr.network.cycle == cycle_before
    assert state_mgr.state_version == version_before


def test_read_only_evaluations_do_not_increment_reversals():
    """Safety Gate: Read-only shadow review must not mutate physical or proposed reversal counters."""
    state_mgr = StateManager.reset_instance(seed=42)
    arbitrator = ArbitrationEngine()

    # Establish baseline commit on CELL_02
    arbitrator.stability_manager.record_commit("CELL_02", delta=3.0, action_type="POWER_UP", controller_id="COVERAGE", cycle=1)
    rev_before = arbitrator.stability_manager.reversal_count

    # Review an opposing delta without committing
    rev_cmd = ControllerCommand(
        command_id="CMD-OPPOSE",
        controller_id="ENERGY",
        target_cell="CELL_02",
        action_type="POWER_DOWN",
        current_value=41.0,
        proposed_value=37.0,
        delta=-4.0,
        reason="Opposing review proposal",
        priority=5,
        cycle=2,
    )
    arbitrator.review(state_mgr.network, [rev_cmd])

    assert arbitrator.stability_manager.reversal_count == rev_before, "Read-only review must not increment reversal counter"


def test_numerical_stability_no_nan_or_infinite_scores():
    """Robustness Gate: ObjectiveOptimizer must handle edge cases without NaN or division by zero."""
    net = NetworkEngine(seed=42)
    cand = CandidateAction(
        candidate_id="CAND-TEST",
        description="Candidate test for numerical stability",
        target_cell="CELL_01",
        proposed_power=38.0,
        proposed_status="ACTIVE",
        joint_actions={"CELL_01": {"status": "ACTIVE", "tx_power_dbm": 38.0}},
        predicted_metrics=net.metrics,
        is_safe=True,
    )

    # Zero baseline metrics
    zero_metrics = net.metrics.model_copy(update={
        "coverage_percentage": 0.0,
        "avg_sinr_db": 0.0,
        "min_sinr_db": 0.0,
        "total_energy": 0.0,
        "interference_level": 0.0,
    })

    scored = ObjectiveOptimizer.score_candidates([cand], zero_metrics, net.cells)
    assert len(scored) == 1
    assert not any(v != v for v in [scored[0].objective_score, scored[0].energy_score, scored[0].interference_score])
    assert abs(scored[0].objective_score) < 1000.0
