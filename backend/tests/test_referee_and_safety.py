import pytest
from app.simulation.network_engine import NetworkEngine
from app.simulation.state_manager import StateManager
from app.referee.arbitration_engine import ArbitrationEngine
from app.referee.commit_manager import CommitManager
from app.models.command import ControllerCommand


def test_unsafe_cell_shutdown_is_modified_or_blocked():
    state_mgr = StateManager(seed=42)
    arbitrator = ArbitrationEngine()
    commit_mgr = CommitManager(arbitrator.guardrails, arbitrator.stability_manager)

    # Energy Controller proposes shutting down CELL_03
    cmd = ControllerCommand(
        command_id="CMD-TEST-SHUTDOWN",
        controller_id="ENERGY",
        target_cell="CELL_03",
        action_type="SHUTDOWN",
        current_value=38.0,
        proposed_value=0.0,
        delta=-38.0,
        reason="Aggressive power saving",
        priority=8,
        cycle=1,
    )

    decision = arbitrator.arbitrate(state_mgr.network, [cmd])

    # Verdict must be MODIFY (replacing full shutdown with safe partial reduction)
    assert decision.verdict == "MODIFY"
    assert "Full shutdown would violate the minimum coverage requirement" in decision.reason

    # The full shutdown candidate must have been rejected as unsafe
    shutdown_cands = [
        c for c in decision.rejected_alternatives
        if "Full shutdown" in c["description"]
    ]
    assert len(shutdown_cands) == 1
    assert shutdown_cands[0]["is_safe"] is False

    # The selected candidate must be safe and maintain coverage >= 95%
    assert decision.selected_candidate.is_safe is True
    assert decision.selected_candidate.predicted_metrics.coverage_percentage >= 95.0

    # Commit decision
    success, msg, post_metrics = commit_mgr.commit_decision(decision, state_mgr)
    assert success is True
    assert post_metrics.coverage_percentage >= 95.0
    # State version should increment
    assert state_mgr.state_version == 2


def test_approve_verdict_for_safe_beneficial_proposal():
    state_mgr = StateManager(seed=42)
    arbitrator = ArbitrationEngine()

    # Small safe power trim on CELL_05 (-2 dBm)
    cmd = ControllerCommand(
        command_id="CMD-TEST-SAFE-TRIM",
        controller_id="ENERGY",
        target_cell="CELL_05",
        action_type="POWER_DOWN",
        current_value=38.0,
        proposed_value=36.0,
        delta=-2.0,
        reason="Minor trim to save power",
        priority=5,
        cycle=1,
    )

    decision = arbitrator.arbitrate(state_mgr.network, [cmd])
    assert decision.verdict in ["APPROVE", "MODIFY"]
    assert decision.selected_candidate.is_safe is True


def test_cooldown_and_delay_verdict():
    state_mgr = StateManager(seed=42)
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
        reason="Save power",
        priority=5,
        cycle=1,
    )
    d1 = arbitrator.arbitrate(state_mgr.network, [cmd1])
    commit_mgr.commit_decision(d1, state_mgr)

    # Cycle 2: attempt to modify CELL_02 immediately (within 3-cycle cooldown)
    cmd2 = ControllerCommand(
        command_id="CMD-2",
        controller_id="COVERAGE",
        target_cell="CELL_02",
        action_type="POWER_UP",
        current_value=34.0,
        proposed_value=38.0,
        delta=4.0,
        reason="Restore coverage",
        priority=6,
        cycle=2,
    )
    d2 = arbitrator.arbitrate(state_mgr.network, [cmd2])
    assert d2.verdict == "DELAY"
    assert "Cooldown active" in d2.reason


def test_stale_state_version_commit_rejection():
    state_mgr = StateManager(seed=42)
    arbitrator = ArbitrationEngine()
    commit_mgr = CommitManager(arbitrator.guardrails, arbitrator.stability_manager)

    cmd = ControllerCommand(
        command_id="CMD-1",
        controller_id="COVERAGE",
        target_cell="CELL_01",
        action_type="POWER_UP",
        current_value=38.0,
        proposed_value=41.0,
        delta=3.0,
        reason="Boost",
        priority=7,
        cycle=1,
    )
    decision = arbitrator.arbitrate(state_mgr.network, [cmd])
    assert decision.state_version == 1

    # Simulate an exogenous state change in the background before commit
    state_mgr.increment_version()
    assert state_mgr.state_version == 2

    # Attempt to commit decision with stale state_version 1
    success, msg, _ = commit_mgr.commit_decision(decision, state_mgr)
    assert success is False
    assert "Stale state version" in msg
