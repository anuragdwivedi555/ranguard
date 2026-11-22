"""Operator-in-the-loop review: shadow forks, recommendation and human-selected commit."""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _prepare(scenario):
    r = client.post("/api/scenarios/prepare", json={"scenario": scenario})
    assert r.status_code == 200
    return r.json()["commands"]


def test_shadow_review_lists_every_fork_with_calculation():
    commands = _prepare("CELL_SHUTDOWN")
    r = client.post("/api/referee/shadow", json={"commands": commands}).json()
    ids = [c["candidate_id"] for c in r["candidates"]]
    assert "CAND-STATUS-QUO" in ids and "CAND-PROP-ENERGY-CELL_03" in ids
    best = next(c for c in r["candidates"] if c["is_recommended"])
    assert best["candidate_id"] == r["recommended_id"]
    # the displayed score must equal the weighted sum of the displayed terms
    assert sum(t["contribution"] for t in best["score_terms"]) == pytest.approx(best["score"], abs=2e-3)
    unsafe = [c for c in r["candidates"] if not c["is_safe"]]
    assert unsafe and all(c["score"] is None for c in unsafe)
    assert any(not k["passed"] for k in unsafe[0]["checks"])


def test_shadow_review_does_not_mutate_live_network():
    commands = _prepare("CELL_SHUTDOWN")
    before = client.get("/api/network/state").json()
    client.post("/api/referee/shadow", json={"commands": commands})
    after = client.get("/api/network/state").json()
    assert before["state_version"] == after["state_version"]
    assert before["cells"]["CELL_03"]["tx_power_dbm"] == after["cells"]["CELL_03"]["tx_power_dbm"]


def test_operator_cannot_commit_unsafe_fork():
    commands = _prepare("CELL_SHUTDOWN")
    r = client.post("/api/referee/commit-candidate", json={"commands": commands, "candidate_id": "CAND-PROP-ENERGY-CELL_03"})
    assert r.status_code == 422
    assert client.get("/api/network/state").json()["cells"]["CELL_03"]["status"] == "ACTIVE"


def test_operator_commit_recommended_and_override():
    commands = _prepare("CELL_SHUTDOWN")
    r = client.post("/api/referee/commit-candidate", json={"commands": commands, "candidate_id": "CAND-PARTIAL-REDUCTION-CELL_03"}).json()
    assert r["success"] and not r["was_override"]
    assert client.get("/api/network/state").json()["cells"]["CELL_03"]["tx_power_dbm"] == 34.0

    commands = _prepare("CELL_SHUTDOWN")
    r = client.post("/api/referee/commit-candidate", json={"commands": commands, "candidate_id": "CAND-STATUS-QUO"}).json()
    assert r["success"] and r["was_override"]
    assert client.get("/api/network/state").json()["cells"]["CELL_03"]["tx_power_dbm"] == 38.0


def test_traffic_spike_prepare_and_review():
    commands = _prepare("TRAFFIC_SPIKE")
    assert len(commands) == 3
    r = client.post("/api/referee/shadow", json={"commands": commands}).json()
    assert r["conflicts"] and r["recommended_id"]


def test_intelligence_evaluation_metrics_are_served():
    """The held-out evaluation table must load from results/ (regression: wrong parent depth returned PENDING)."""
    r = client.get("/api/ml/decision-intelligence/evaluation").json()
    assert r["status"] == "SUCCESS"
    assert any("XGBoost" in m["model_name"] for m in r["metrics"])
