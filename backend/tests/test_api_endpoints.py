import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check_endpoint():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"


def test_simulation_reset_and_metrics_endpoints():
    res = client.post("/api/simulation/reset", json={"seed": 42})
    assert res.status_code == 200
    metrics = res.json()
    assert metrics["coverage_percentage"] >= 95.0
    assert metrics["total_cells"] == 6

    # Test GET /api/network/metrics
    m_res = client.get("/api/network/metrics")
    assert m_res.status_code == 200
    assert m_res.json()["coverage_percentage"] == metrics["coverage_percentage"]

    # Test GET /api/network/state
    s_res = client.get("/api/network/state")
    assert s_res.status_code == 200
    state = s_res.json()
    assert len(state["cells"]) == 6
    assert len(state["users"]) == 100


def test_controllers_commands_endpoint():
    res = client.get("/api/controllers/commands")
    assert res.status_code == 200
    commands = res.json()
    assert isinstance(commands, list)
    assert len(commands) > 0


def test_controllers_status_endpoint():
    res = client.get("/api/controllers/status")
    assert res.status_code == 200
    status_list = res.json()
    assert isinstance(status_list, list)
    assert len(status_list) == 3
    names = [s["controller_id"] for s in status_list]
    assert "ENERGY" in names
    assert "COVERAGE" in names
    assert "INTERFERENCE" in names


def test_referee_evaluate_and_commit_endpoints():
    client.post("/api/simulation/reset", json={"seed": 42})

    # 1. Fetch commands
    cmd_res = client.get("/api/controllers/commands")
    cmds = cmd_res.json()

    # 2. Evaluate
    eval_res = client.post("/api/referee/evaluate", json={"commands": cmds})
    assert eval_res.status_code == 200
    decision = eval_res.json()
    assert decision["verdict"] in ["APPROVE", "MODIFY", "DELAY", "REJECT"]
    assert "safety_validation" in decision

    # 3. Commit
    commit_res = client.post("/api/referee/commit", json={"decision": decision})
    assert commit_res.status_code == 200
    assert commit_res.json()["success"] is True

    # 4. History
    hist_res = client.get("/api/referee/history")
    assert hist_res.status_code == 200
    assert len(hist_res.json()) >= 1


def test_scenarios_run_endpoint():
    for scenario_name in ["CELL_SHUTDOWN", "TRAFFIC_SPIKE", "PING_PONG"]:
        res = client.post("/api/scenarios/run", json={"scenario": scenario_name})
        assert res.status_code == 200
        data = res.json()
        assert data["scenario"] == scenario_name


def test_comparison_run_endpoint():
    res = client.post("/api/comparison/run", json={"seed": 42, "cycles": 4})
    assert res.status_code == 200
    data = res.json()
    assert "policies" in data
    assert "ranguard" in data["policies"]
