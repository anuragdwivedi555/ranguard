import pytest
from app.simulation.state_manager import StateManager
from app.referee.arbitration_engine import ArbitrationEngine
from app.referee.commit_manager import CommitManager
from app.scenarios.cell_shutdown import CellShutdownScenario
from app.scenarios.traffic_spike import TrafficSpikeScenario
from app.scenarios.ping_pong import PingPongScenario
from app.services.benchmark_service import BenchmarkService


def test_cell_shutdown_scenario():
    state_mgr = StateManager(seed=42)
    arbitrator = ArbitrationEngine()
    commit_mgr = CommitManager(arbitrator.guardrails, arbitrator.stability_manager)

    result = CellShutdownScenario.run(state_mgr, arbitrator, commit_mgr)

    assert result["scenario"] == "CELL_SHUTDOWN"
    assert result["decision"]["verdict"] == "MODIFY"
    assert result["commit_status"] is True
    assert result["post_commit_metrics"]["coverage_percentage"] >= 95.0
    # Energy must have been reduced compared to initial
    assert result["post_commit_metrics"]["total_energy"] < result["initial_metrics"]["total_energy"]


def test_traffic_spike_scenario():
    state_mgr = StateManager(seed=42)
    arbitrator = ArbitrationEngine()
    commit_mgr = CommitManager(arbitrator.guardrails, arbitrator.stability_manager)

    result = TrafficSpikeScenario.run(state_mgr, arbitrator, commit_mgr)

    assert result["scenario"] == "TRAFFIC_SPIKE"
    assert result["commit_status"] is True
    assert result["post_commit_metrics"]["coverage_percentage"] >= 90.0


def test_ping_pong_scenario():
    state_mgr = StateManager(seed=42)
    arbitrator = ArbitrationEngine()
    commit_mgr = CommitManager(arbitrator.guardrails, arbitrator.stability_manager)

    result = PingPongScenario.run(state_mgr, arbitrator, commit_mgr)

    assert result["scenario"] == "PING_PONG"
    assert len(result["cycles"]) == 6
    # Stability manager must have suppressed/delayed unnecessary rapid oscillations
    assert result["total_reversals_suppressed"] > 0


def test_benchmark_comparison_three_policies():
    results = BenchmarkService.run_comparison(seed=42, cycles_count=4)

    assert "policies" in results
    policies = results["policies"]
    assert "no_referee" in policies
    assert "fixed_priority" in policies
    assert "ranguard" in policies

    p_a = policies["no_referee"]
    p_b = policies["fixed_priority"]
    p_c = policies["ranguard"]

    # RANGUARD must maintain safety (0 safety violations)
    assert p_c["safety_violations"] == 0
    # RANGUARD must maintain coverage >= 95%
    assert p_c["coverage_pct"] >= 95.0
    # RANGUARD must have fewer or equal reversals than raw no-referee
    assert p_c["control_reversals"] <= p_a["control_reversals"]
    # Median computation latency should be well under 100 ms
    assert p_c["median_latency_ms"] < 100.0
