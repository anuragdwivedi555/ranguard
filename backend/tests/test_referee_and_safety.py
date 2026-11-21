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


def test_verdict_taxonomy_four_quadrants():
    """
    Validates the architectural conditions for all 4 referee verdicts:
    APPROVE, MODIFY, DELAY, REJECT.
    Explains why multi-controller benchmark runs produce 830 MODIFY and 70 DELAY.
    """
    state_mgr = StateManager(seed=42)
    arbitrator = ArbitrationEngine()

    # 1. APPROVE: Single controller, beneficial proposal, no conflicts
    cmd_approve = ControllerCommand(
        command_id="CMD-APP", controller_id="ENERGY", target_cell="CELL_05",
        action_type="POWER_DOWN", current_value=38.0, proposed_value=36.0, delta=-2.0,
        reason="Safe power reduction", priority=5, cycle=1,
    )
    d_app = arbitrator.arbitrate(state_mgr.network, [cmd_approve])
    assert d_app.verdict == "APPROVE"

    # 2. MODIFY: Multi-controller concurrent proposals (the benchmark reality)
    cmd_mod1 = ControllerCommand(
        command_id="CMD-MOD1", controller_id="ENERGY", target_cell="CELL_01",
        action_type="POWER_DOWN", current_value=38.0, proposed_value=34.0, delta=-4.0,
        reason="Cut energy", priority=5, cycle=1,
    )
    cmd_mod2 = ControllerCommand(
        command_id="CMD-MOD2", controller_id="COVERAGE", target_cell="CELL_02",
        action_type="POWER_UP", current_value=38.0, proposed_value=41.0, delta=3.0,
        reason="Boost edge", priority=7, cycle=1,
    )
    # When multiple controllers run concurrently (len(commands) > 1), verdict is ALWAYS MODIFY
    d_mod = arbitrator.arbitrate(state_mgr.network, [cmd_mod1, cmd_mod2])
    assert d_mod.verdict == "MODIFY"

    # 3. DELAY: Stability manager triggers cooldown
    # Directly record an action on CELL_02 in history to activate cooldown
    arbitrator.stability_manager.record_commit(
        cell_id="CELL_02", delta=-3.0, action_type="POWER_DOWN", controller_id="ENERGY", cycle=1
    )
    cmd_delay = ControllerCommand(
        command_id="CMD-DELAY", controller_id="COVERAGE", target_cell="CELL_02",
        action_type="POWER_UP", current_value=35.0, proposed_value=38.0, delta=3.0,
        reason="Rapid follow-up within 3-cycle cooldown", priority=6, cycle=2,
    )
    d_delay = arbitrator.arbitrate(state_mgr.network, [cmd_delay])
    assert d_delay.verdict == "DELAY"

    # 4. REJECT: Hard safety constraint breach where no candidate is safe
    # Construct a degraded state where status quo has coverage < 95% and proposed actions also breach
    degraded_net = NetworkEngine(seed=42)
    for c in degraded_net.cells.values():
        c.tx_power_dbm = 10.0
    degraded_net.recalculate()
    assert degraded_net.metrics.coverage_percentage < 95.0

    cmd_unsafe = ControllerCommand(
        command_id="CMD-UNSAFE", controller_id="ENERGY", target_cell="CELL_01",
        action_type="SHUTDOWN", current_value=10.0, proposed_value=0.0, delta=-10.0,
        reason="Unsafe cut during outage", priority=8, cycle=1,
    )
    d_reject = arbitrator.arbitrate(degraded_net, [cmd_unsafe])
    # When status quo and all candidate actions fail hard safety constraints, verdict is REJECT
    assert d_reject.verdict == "REJECT"
    assert "Hard safety constraint violation" in d_reject.reason


def test_intra_cycle_overwriting_explains_zero_end_of_cycle_violations():
    """
    Demonstrates why stress scenarios recorded 0 post-cycle safety violations in NO_REFEREE:
    Sequential execution of conflicting commands within the same cycle allows subsequent
    commands to overwrite an earlier shutdown back to ACTIVE before the cycle ends.
    """
    net = NetworkEngine(seed=103)

    # 1. First command: Shutdown CELL_03
    cmd_shutdown = ControllerCommand(
        command_id="CMD-SD", controller_id="ENERGY", target_cell="CELL_03",
        action_type="SHUTDOWN", current_value=38.0, proposed_value=0.0, delta=-38.0,
        reason="Shutdown disturbance", priority=8, cycle=1,
    )
    # 2. Subsequent uncoordinated proposal in same cycle: Overwrite CELL_03 power
    cmd_restore = ControllerCommand(
        command_id="CMD-RESTORE", controller_id="INTERFERENCE", target_cell="CELL_03",
        action_type="POWER_DOWN", current_value=0.0, proposed_value=35.0, delta=35.0,
        reason="Interference trim unaware of shutdown", priority=2, cycle=1,
    )

    # In NO_REFEREE, commands are executed sequentially in loop:
    # Action 1 applies:
    net.apply_action(cmd_shutdown.target_cell, status="SHUTDOWN", tx_power_dbm=0.0)
    cov_intra_cycle = net.metrics.coverage_percentage
    assert cov_intra_cycle < 95.0  # Temporarily drops below 95% safety floor!

    # Action 2 applies in same cycle, overwriting the shutdown:
    net.apply_action(cmd_restore.target_cell, status="ACTIVE", tx_power_dbm=cmd_restore.proposed_value)
    cov_end_of_cycle = net.metrics.coverage_percentage

    # At end-of-cycle check, CELL_03 is ACTIVE again at 35 dBm, so post-cycle coverage is >= 95%
    assert cov_end_of_cycle >= 95.0

