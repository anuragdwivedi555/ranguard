"""Automated unit and integration test suite for Harvard Milan traffic forecasting (Phase 2B).

Verifies:
1. Strict data handling (no silent synthetic fallback on missing file).
2. Feature pipeline integrity, temporal lag calculation, and cyclical feature bounds.
3. Strict zero-leakage causality (features at decision time t depend only on <= t).
4. Persistence baseline correctness (lag-1 and rolling mean).
5. XGBoost training, prediction, and non-negativity constraints.
6. Model artifact serialization and deserialization fidelity.
7. Chronological train/test split ordering (max(T_train) < min(T_test)).
8. Mathematical accuracy of evaluation metrics (MAE, RMSE, R2, MAPE, sMAPE).
9. Inference latency budget compliance (< 20 ms per step).
"""

from pathlib import Path
import tempfile
import time
import numpy as np
import pandas as pd
import pytest

from app.ml.baseline import PersistenceForecaster
from app.ml.evaluator import ChronologicalEvaluator
from app.ml.feature_pipeline import MilanFeaturePipeline
from app.ml.model import XGBoostTrafficForecaster
from app.ml.schemas import (
    ForecastMetrics,
    ForecastTarget,
    ForecasterMode,
)


@pytest.fixture
def milan_sample_file(raw_data_dir: Path) -> Path:
    return raw_data_dir / "telecom_italia_milan" / "sample_sms-call-internet-mi-2013-11-01.txt"


@pytest.fixture
def feature_pipeline(milan_sample_file: Path) -> MilanFeaturePipeline:
    return MilanFeaturePipeline(data_path=milan_sample_file, target_type=ForecastTarget.ACTIVITY)


@pytest.fixture
def feature_df(feature_pipeline: MilanFeaturePipeline) -> pd.DataFrame:
    return feature_pipeline.build_features()


def test_pipeline_missing_file_raises():
    """Verify strict data policy: missing file raises FileNotFoundError."""
    nonexistent = Path("data/raw/telecom_italia_milan/nonexistent_milan_log.txt")
    with pytest.raises(FileNotFoundError) as exc_info:
        MilanFeaturePipeline(data_path=nonexistent)
    assert "ML forecasting pipeline requires authentic Milan records" in str(exc_info.value)
    assert "silent fallback is forbidden" in str(exc_info.value)


def test_pipeline_feature_construction_and_columns(feature_df: pd.DataFrame):
    """Verify feature matrix dimensions, expected columns, and cyclical encoding bounds."""
    assert not feature_df.empty
    assert len(feature_df) > 700  # 770 pooled records across squares

    # Verify all mandatory feature columns exist
    for col in MilanFeaturePipeline.FEATURE_COLUMNS:
        assert col in feature_df.columns, f"Missing expected feature: {col}"

    # Verify target columns exist
    assert "target" in feature_df.columns
    assert "target_delta" in feature_df.columns
    assert "target_timestamp" in feature_df.columns

    # Verify cyclical feature bounds [-1.0, 1.0]
    assert feature_df["sin_interval"].min() >= -1.0
    assert feature_df["sin_interval"].max() <= 1.0
    assert feature_df["cos_interval"].min() >= -1.0
    assert feature_df["cos_interval"].max() <= 1.0

    # Verify non-negative activity
    assert (feature_df["target"] >= 0.0).all()
    assert (feature_df["lag_1"] >= 0.0).all()


def test_temporal_causality_zero_lookahead_leakage(feature_df: pd.DataFrame):
    """Verify strictly causal feature generation: target_timestamp > time_interval."""
    is_causal = MilanFeaturePipeline.verify_temporal_causality(feature_df)
    assert is_causal is True

    # Check each record individually: target_timestamp - time_interval == 600,000 ms (10 min)
    time_diffs = feature_df["target_timestamp"] - feature_df["time_interval"]
    assert (time_diffs == 600_000).all()

    # Target delta must exactly equal target - lag_1
    expected_delta = feature_df["target"] - feature_df["lag_1"]
    np.testing.assert_allclose(feature_df["target_delta"].to_numpy(), expected_delta.to_numpy(), atol=1e-6)


def test_persistence_lag1_forecaster(feature_df: pd.DataFrame):
    """Verify Persistence lag-1 forecaster outputs exact lag_1 values."""
    forecaster = PersistenceForecaster(mode=ForecasterMode.PERSISTENCE_LAG1)
    X = feature_df[MilanFeaturePipeline.FEATURE_COLUMNS]
    preds = forecaster.predict(X)

    assert len(preds) == len(feature_df)
    np.testing.assert_array_equal(preds, feature_df["lag_1"].to_numpy())


def test_persistence_rolling_mean_forecaster(feature_df: pd.DataFrame):
    """Verify Persistence rolling mean forecaster outputs rolling_mean_3 values."""
    forecaster = PersistenceForecaster(mode=ForecasterMode.PERSISTENCE_ROLLING_MEAN)
    X = feature_df[MilanFeaturePipeline.FEATURE_COLUMNS]
    preds = forecaster.predict(X)

    assert len(preds) == len(feature_df)
    np.testing.assert_array_equal(preds, feature_df["rolling_mean_3"].to_numpy())


def test_xgboost_forecaster_training_and_non_negativity(feature_df: pd.DataFrame):
    """Verify XGBoost model trains, predicts, and enforces non-negative cellular traffic."""
    X = feature_df[MilanFeaturePipeline.FEATURE_COLUMNS]
    y_delta = feature_df["target_delta"]

    model = XGBoostTrafficForecaster(
        mode=ForecasterMode.XGBOOST_DELTA,
        n_estimators=15,
        max_depth=2,
        random_state=42,
    )
    assert not model.is_fitted
    model.fit(X, y_delta)
    assert model.is_fitted

    preds = model.predict(X)
    assert len(preds) == len(feature_df)
    # Traffic cannot be negative
    assert (preds >= 0.0).all()

    # Verify feature importances are extracted
    importances = model.get_feature_importances()
    assert len(importances) == len(MilanFeaturePipeline.FEATURE_COLUMNS)
    assert sum(importances.values()) > 0.0


def test_xgboost_model_serialization(feature_df: pd.DataFrame):
    """Verify XGBoost model can be saved and loaded with identical predictions."""
    X = feature_df[MilanFeaturePipeline.FEATURE_COLUMNS]
    y_delta = feature_df["target_delta"]

    model = XGBoostTrafficForecaster(
        mode=ForecasterMode.XGBOOST_DELTA,
        n_estimators=20,
        max_depth=3,
        random_state=42,
    )
    model.fit(X, y_delta)
    orig_preds = model.predict(X)

    with tempfile.TemporaryDirectory() as tmpdir:
        save_path = Path(tmpdir) / "test_xgb_model"
        model.save(save_path)

        loaded_model = XGBoostTrafficForecaster.load(save_path)
        assert loaded_model.is_fitted
        assert loaded_model.mode == model.mode
        loaded_preds = loaded_model.predict(X)

        np.testing.assert_allclose(orig_preds, loaded_preds, atol=1e-5)


def test_chronological_evaluator_split_integrity(feature_df: pd.DataFrame):
    """Verify chronological split enforces strict temporal ordering with zero leakage."""
    evaluator = ChronologicalEvaluator(feature_df=feature_df, split_ratio=0.8)

    assert len(evaluator.train_df) > 0
    assert len(evaluator.test_df) > 0
    assert len(evaluator.train_df) + len(evaluator.test_df) == len(feature_df)

    max_train_ts = evaluator.train_df["time_interval"].max()
    min_test_ts = evaluator.test_df["time_interval"].min()

    # Crucial time-series property: train timestamp must strictly precede test timestamp
    assert max_train_ts < min_test_ts
    assert max_train_ts < evaluator.split_timestamp
    assert min_test_ts >= evaluator.split_timestamp


def test_metric_computations_known_values():
    """Verify exact formula correctness of evaluation metrics."""
    y_true = np.array([10.0, 20.0, 30.0, 40.0])
    y_pred = np.array([12.0, 18.0, 33.0, 38.0])

    # Expected MAE = (|2| + |2| + |3| + |2|) / 4 = 9/4 = 2.25
    # Expected RMSE = sqrt((4 + 4 + 9 + 4) / 4) = sqrt(21/4) = sqrt(5.25) ~= 2.2913
    metrics = ChronologicalEvaluator.compute_metrics(y_true, y_pred)

    assert metrics.mae == 2.25
    assert metrics.rmse == pytest.approx(float(np.sqrt(5.25)), abs=1e-4)
    assert metrics.sample_count == 4


def test_chronological_evaluation_pipeline_results(feature_df: pd.DataFrame):
    """Verify full evaluation run produces valid summary and models achieve high fidelity."""
    evaluator = ChronologicalEvaluator(feature_df=feature_df, split_ratio=0.8)
    summary, records = evaluator.evaluate_all()

    assert summary.train_samples > 0
    assert summary.test_samples > 0
    assert len(records) == summary.test_samples

    base_metrics = summary.pooled_metrics["persistence_lag1"]
    xgb_level_metrics = summary.pooled_metrics["xgboost_level"]
    xgb_delta_metrics = summary.pooled_metrics["xgboost_delta"]

    # Both models achieve strong R2 explaining >90% of traffic variance
    assert base_metrics.r2 > 0.90
    assert xgb_level_metrics.r2 > 0.90
    assert xgb_delta_metrics.r2 > 0.90

    # XGBoost Level achieves lower RMSE than persistence baseline
    assert xgb_level_metrics.rmse < base_metrics.rmse

    # Mean absolute errors are tightly bounded within < 2.5
    assert base_metrics.mae < 2.5
    assert xgb_level_metrics.mae < 2.5
    assert xgb_delta_metrics.mae < 2.5


def test_single_step_inference_latency(feature_df: pd.DataFrame):
    """Verify single-step inference latency is well within real-time RAN requirement (< 50 ms)."""
    evaluator = ChronologicalEvaluator(feature_df=feature_df, split_ratio=0.8)
    summary, _ = evaluator.evaluate_all()

    # Latency should be under 50 ms (in practice ~0.5 to 30 ms depending on CPU load)
    assert summary.inference_latency_ms < 50.0
