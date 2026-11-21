"""Tests for ML Decision Intelligence Action Surrogate & 3-Panel Audit Engine.

Validates:
1. Feature extraction causality and zero mutation.
2. Surrogate model training, prediction, serialization, and deserialization.
3. Baseline models (Zero-Delta, Mean, Linear Ridge).
4. The 3-phase AI PREDICTS -> DIGITAL TWIN VERIFIES -> REFEREE DECIDES pipeline.
5. Hard safety guarantee: Authoritative digital twin strictly catches unsafe candidates.
6. API routes for decision intelligence and audit logs.
"""

import pytest
import numpy as np
import pandas as pd
from pathlib import Path
from fastapi.testclient import TestClient

from app.main import app
from app.simulation.network_engine import NetworkEngine
from app.referee.guardrails import SafetyGuardrails
from app.referee.shadow_simulator import ShadowSimulator
from app.referee.candidate_generator import CandidateGenerator
from app.referee.arbitration_engine import ArbitrationEngine
from app.models.command import ControllerCommand
from app.ml.surrogate.schemas import PreActionFeatures, SurrogatePrediction
from app.ml.surrogate.feature_extractor import extract_candidate_features, FEATURE_COLUMNS
from app.ml.surrogate.surrogate_model import XGBoostActionSurrogate
from app.ml.surrogate.baseline_models import ZeroDeltaBaseline, MeanDeltaBaseline, LinearRidgeBaseline
from app.ml.surrogate.engine import DecisionIntelligenceEngine


client = TestClient(app)


def test_feature_extractor_causality_and_completeness():
    """Verify all 20 features are extracted without modifying live network state."""
    net = NetworkEngine(seed=42)
    initial_cov = net.metrics.coverage_percentage
    initial_int = net.metrics.interference_level

    cand_def = {
        "candidate_id": "TEST-CAND-01",
        "target_cell": "CELL_03",
        "proposed_power": 34.0,
        "proposed_status": "ACTIVE",
        "joint_actions": {"CELL_03": {"status": "ACTIVE", "tx_power_dbm": 34.0}},
    }

    feats = extract_candidate_features(net, cand_def)
    assert isinstance(feats, dict)
    assert len(feats) == len(FEATURE_COLUMNS)
    for col in FEATURE_COLUMNS:
        assert col in feats, f"Missing feature: {col}"
        assert not np.isnan(feats[col]), f"NaN found in feature: {col}"

    # Verify zero network mutation
    assert net.metrics.coverage_percentage == initial_cov
    assert net.metrics.interference_level == initial_int
    assert net.cells["CELL_03"].tx_power_dbm == 38.0


def test_surrogate_model_fit_predict_save_load(tmp_path: Path):
    """Verify training, inference, and serialization of XGBoostActionSurrogate."""
    # Create small synthetic training matrix
    np.random.seed(42)
    n = 30
    X = pd.DataFrame(np.random.randn(n, len(FEATURE_COLUMNS)), columns=FEATURE_COLUMNS)
    y_cov = pd.Series(np.random.uniform(-5.0, 2.0, size=n))
    y_int = pd.Series(np.random.uniform(-40.0, 50.0, size=n))

    surrogate = XGBoostActionSurrogate(n_estimators=10, max_depth=2, random_state=42)
    surrogate.fit(X, y_cov, y_int)
    assert surrogate.is_fitted is True

    # Batch prediction
    pred_c, pred_i = surrogate.predict_batch(X)
    assert len(pred_c) == n
    assert len(pred_i) == n

    # Save and Load
    surrogate.save(tmp_path)
    loaded = XGBoostActionSurrogate.load(tmp_path)
    assert loaded.is_fitted is True
    pred_c2, pred_i2 = loaded.predict_batch(X)
    np.testing.assert_allclose(pred_c, pred_c2, rtol=1e-5)
    np.testing.assert_allclose(pred_i, pred_i2, rtol=1e-5)


def test_baseline_models_predict():
    """Verify baseline models produce valid shapes and predictions."""
    X = pd.DataFrame([[1.0] * len(FEATURE_COLUMNS)], columns=FEATURE_COLUMNS)
    y_c = np.array([-1.5])
    y_i = np.array([25.0])

    # Zero Delta
    b_zero = ZeroDeltaBaseline().fit(X, y_c, y_i)
    pc, pi = b_zero.predict(X)
    assert pc[0] == 0.0
    assert pi[0] == 0.0

    # Mean Delta
    b_mean = MeanDeltaBaseline().fit(X, y_c, y_i)
    pc, pi = b_mean.predict(X)
    assert pc[0] == -1.5
    assert pi[0] == 25.0

    # Linear Ridge
    X_train = pd.DataFrame(np.random.randn(10, len(FEATURE_COLUMNS)), columns=FEATURE_COLUMNS)
    y_c_train = np.random.randn(10)
    y_i_train = np.random.randn(10)
    b_ridge = LinearRidgeBaseline(alpha=1.0).fit(X_train, y_c_train, y_i_train)
    pc_r, pi_r = b_ridge.predict(X_train)
    assert len(pc_r) == 10
    assert len(pi_r) == 10


def test_decision_intelligence_pipeline_execution():
    """Verify the 3-phase AI PREDICTS -> DIGITAL TWIN VERIFIES -> AUDIT pipeline."""
    net = NetworkEngine(seed=42)
    guardrails = SafetyGuardrails()
    shadow_sim = ShadowSimulator(guardrails)
    engine = DecisionIntelligenceEngine.get_instance()
    engine.toggle(True)

    c_defs = [
        {
            "candidate_id": "CAND-STATUS-QUO",
            "description": "Maintain status quo",
            "target_cell": "ALL",
            "proposed_power": 0.0,
            "proposed_status": "ACTIVE",
            "joint_actions": {},
            "origin": "BASELINE",
        },
        {
            "candidate_id": "CAND-PROP-ENERGY-CELL_03",
            "description": "Energy reduction proposal on CELL_03",
            "target_cell": "CELL_03",
            "proposed_power": 34.0,
            "proposed_status": "ACTIVE",
            "joint_actions": {"CELL_03": {"status": "ACTIVE", "tx_power_dbm": 34.0}},
            "origin": "ENERGY",
        },
    ]

    evaluated, audit = engine.evaluate_with_intelligence_pipeline(net, c_defs, shadow_sim, force_audit=True)
    engine.toggle(False)
    assert len(evaluated) == 2
    assert audit is not None
    assert audit.total_candidates_screened == 2
    assert len(audit.candidate_comparisons) == 2
    assert audit.ml_inference_total_ms >= 0.0
    assert audit.twin_verification_total_ms >= 0.0

    # Check pair fields
    pair = audit.candidate_comparisons[1]
    assert pair.candidate_id == "CAND-PROP-ENERGY-CELL_03"
    assert pair.prediction.predicted_coverage_pct > 0.0
    assert pair.verification.actual_coverage_pct > 0.0
    assert pair.coverage_error_abs >= 0.0
    assert pair.interference_error_abs >= 0.0


def test_safety_guardrails_never_bypassed_by_ml():
    """
    CRITICAL SAFETY GATE:
    Verifies that an unsafe shutdown action is strictly caught and rejected by the Digital Twin,
    regardless of ML surrogate screening.
    """
    net = NetworkEngine(seed=42)
    arbitrator = ArbitrationEngine()

    shutdown_cmd = ControllerCommand(
        command_id="CMD-TEST-SHUTDOWN-CELL_03",
        controller_id="ENERGY",
        target_cell="CELL_03",
        action_type="SHUTDOWN",
        current_value=38.0,
        proposed_value=0.0,
        delta=-38.0,
        reason="Aggressive energy cut test",
        priority=8,
        cycle=1,
    )

    # 1. Baseline mode (Pure shadow twin, AI Risk Lens disabled)
    decision_base = arbitrator.arbitrate(net, [shutdown_cmd], enable_ai_risk_lens=False)
    assert decision_base.verdict in ["MODIFY", "REJECT"]
    assert decision_base.selected_candidate is not None
    assert decision_base.selected_candidate.is_safe is True
    assert decision_base.decision_intelligence is None

    # 2. On-demand AI Risk Lens mode enabled
    decision_lens = arbitrator.arbitrate(net, [shutdown_cmd], enable_ai_risk_lens=True)
    assert decision_lens.verdict in ["MODIFY", "REJECT"]
    assert decision_lens.selected_candidate is not None
    assert decision_lens.selected_candidate.is_safe is True
    assert decision_lens.decision_intelligence is not None
    audit = decision_lens.decision_intelligence
    assert "candidate_comparisons" in audit
    assert len(audit["candidate_comparisons"]) >= 1


def test_api_decision_intelligence_endpoints():
    """Test all FastAPI endpoints powering the AI Risk Lens."""
    # 1. Status endpoint
    s_res = client.get("/api/ml/decision-intelligence/status")
    assert s_res.status_code == 200
    s_data = s_res.json()
    assert "enabled" in s_data
    assert s_data["model_version"] == "xgb-action-surrogate-v1.0"
    assert "Simulated" in s_data["data_provenance"]

    # 2. Toggle endpoint
    t_res = client.post("/api/ml/decision-intelligence/toggle", json={"enabled": True})
    assert t_res.status_code == 200
    assert t_res.json()["enabled"] is True

    # 3. Evaluation metrics endpoint
    e_res = client.get("/api/ml/decision-intelligence/evaluation")
    assert e_res.status_code == 200
    e_data = e_res.json()
    assert e_data["status"] in ["SUCCESS", "PENDING"]

    # 4. Predict candidate endpoint (In-Distribution)
    p_res = client.post("/api/ml/decision-intelligence/predict", json={
        "target_cell": "CELL_03",
        "proposed_power": 34.0,
        "proposed_status": "ACTIVE",
    })
    assert p_res.status_code == 200
    p_data = p_res.json()
    assert "predicted_coverage_delta" in p_data
    assert "predicted_interference_delta" in p_data
    assert "predicted_energy_delta" in p_data
    assert "predicted_is_safe" in p_data
    assert p_data["out_of_distribution"] is False

    # 5. Predict candidate endpoint (Out-of-Distribution guardrail)
    ood_res = client.post("/api/ml/decision-intelligence/predict", json={
        "target_cell": "CELL_03",
        "proposed_power": 52.0,  # > 46 dBm
        "proposed_status": "ACTIVE",
    })
    assert ood_res.status_code == 200
    ood_data = ood_res.json()
    assert ood_data["out_of_distribution"] is True
    assert "outside validated operational envelope" in ood_data["ood_warning"]

    # 6. Audit latest endpoint
    a_res = client.get("/api/ml/decision-intelligence/audit/latest")
    assert a_res.status_code == 200


def test_on_demand_ml_reduces_default_overhead():
    """Verify that disabling AI Risk Lens executes pure shadow simulation without ML overhead."""
    net = NetworkEngine(seed=42)
    arbitrator = ArbitrationEngine()

    cmd = ControllerCommand(
        command_id="CMD-TEST-OVERHEAD",
        controller_id="ENERGY",
        target_cell="CELL_03",
        action_type="POWER_DOWN",
        current_value=38.0,
        proposed_value=34.0,
        delta=-4.0,
        reason="Overhead benchmark test",
        priority=5,
        cycle=1,
    )

    # Disabled mode: no audit overhead
    d_off = arbitrator.arbitrate(net, [cmd], enable_ai_risk_lens=False)
    assert d_off.decision_intelligence is None

    # Enabled mode: generates audit
    d_on = arbitrator.arbitrate(net, [cmd], enable_ai_risk_lens=True)
    assert d_on.decision_intelligence is not None
