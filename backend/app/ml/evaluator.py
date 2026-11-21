"""Chronological, leakage-free ML evaluation suite for RAN traffic forecasting."""

from __future__ import annotations

import time
from typing import Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from .baseline import PersistenceForecaster
from .feature_pipeline import MilanFeaturePipeline
from .model import XGBoostTrafficForecaster
from .schemas import (
    EvaluationSummary,
    ForecastMetrics,
    ForecasterMode,
    PredictionRecord,
)


class ChronologicalEvaluator:
    """Evaluates time series forecasting models under strict chronological ordering."""

    def __init__(
        self,
        feature_df: pd.DataFrame,
        split_ratio: float = 0.8,
    ):
        """Initializes evaluator with feature-engineered dataframe.

        Args:
            feature_df: DataFrame from MilanFeaturePipeline.build_features()
            split_ratio: Fraction of chronological time intervals for training (default 0.8)
        """
        self.feature_df = feature_df.sort_values(["time_interval", "square_id"]).reset_index(drop=True)
        self.split_ratio = split_ratio

        # Determine chronological split boundary strictly by timestamp
        unique_timestamps = np.sort(self.feature_df["time_interval"].unique())
        split_idx = int(len(unique_timestamps) * self.split_ratio)
        self.split_timestamp = int(unique_timestamps[split_idx])

        # Partition data: Train strictly < split_timestamp, Test strictly >= split_timestamp
        self.train_df = self.feature_df[self.feature_df["time_interval"] < self.split_timestamp].copy()
        self.test_df = self.feature_df[self.feature_df["time_interval"] >= self.split_timestamp].copy()

        # Verify zero temporal lookahead leakage
        if not self.test_df.empty and not self.train_df.empty:
            assert self.train_df["time_interval"].max() < self.test_df["time_interval"].min(), (
                "Leakage violation: train timestamps overlap or exceed test timestamps!"
            )

    @staticmethod
    def compute_metrics(
        y_true: np.ndarray,
        y_pred: np.ndarray,
        baseline_metrics: Optional[ForecastMetrics] = None,
        eps: float = 1e-4,
    ) -> ForecastMetrics:
        """Compute standard forecast evaluation metrics."""
        y_true = np.asarray(y_true, dtype=float)
        y_pred = np.asarray(y_pred, dtype=float)

        mae = float(mean_absolute_error(y_true, y_pred))
        rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
        r2 = float(r2_score(y_true, y_pred))

        # Absolute percentage error with epsilon protection against zero activity
        abs_err = np.abs(y_true - y_pred)
        mape = float(np.mean(abs_err / (np.abs(y_true) + eps)) * 100.0)

        # Symmetric MAPE
        smape = float(np.mean(2.0 * abs_err / (np.abs(y_true) + np.abs(y_pred) + eps)) * 100.0)

        imp_mae = None
        imp_rmse = None
        if baseline_metrics is not None and baseline_metrics.mae > 0:
            imp_mae = round(((baseline_metrics.mae - mae) / baseline_metrics.mae) * 100.0, 2)
        if baseline_metrics is not None and baseline_metrics.rmse > 0:
            imp_rmse = round(((baseline_metrics.rmse - rmse) / baseline_metrics.rmse) * 100.0, 2)

        return ForecastMetrics(
            mae=round(mae, 4),
            rmse=round(rmse, 4),
            r2=round(r2, 4),
            mape=round(mape, 2),
            smape=round(smape, 2),
            improvement_mae_pct=imp_mae,
            improvement_rmse_pct=imp_rmse,
            sample_count=len(y_true),
        )

    def evaluate_all(
        self,
        feature_cols: Optional[List[str]] = None,
    ) -> Tuple[EvaluationSummary, List[PredictionRecord]]:
        """Executes full chronological evaluation across Persistence and XGBoost models."""
        if feature_cols is None:
            feature_cols = MilanFeaturePipeline.FEATURE_COLUMNS

        X_train = self.train_df[feature_cols]
        y_train_target = self.train_df["target"]
        y_train_delta = self.train_df["target_delta"]

        X_test = self.test_df[feature_cols]
        y_test = self.test_df["target"].to_numpy(dtype=float)

        # 1. Persistence Baseline (lag-1)
        persistence = PersistenceForecaster(mode=ForecasterMode.PERSISTENCE_LAG1)
        y_pred_persist = persistence.predict(X_test)
        base_metrics = self.compute_metrics(y_test, y_pred_persist)

        # 2. XGBoost Level Model
        xgb_level = XGBoostTrafficForecaster(
            mode=ForecasterMode.XGBOOST_LEVEL,
            n_estimators=50,
            max_depth=3,
            learning_rate=0.05,
            subsample=0.85,
            colsample_bytree=0.85,
            reg_lambda=3.0,
            random_state=42,
        )
        xgb_level.fit(X_train, y_train_target)
        y_pred_xgb_level = xgb_level.predict(X_test)
        level_metrics = self.compute_metrics(y_test, y_pred_xgb_level, baseline_metrics=base_metrics)

        # 3. XGBoost Delta Model (Primary Architecture)
        xgb_delta = XGBoostTrafficForecaster(
            mode=ForecasterMode.XGBOOST_DELTA,
            n_estimators=45,
            max_depth=3,
            learning_rate=0.035,
            subsample=0.85,
            colsample_bytree=0.85,
            reg_lambda=4.0,
            random_state=42,
        )
        xgb_delta.fit(X_train, y_train_delta)

        # Measure inference latency
        t0 = time.perf_counter()
        for _ in range(100):
            _ = xgb_delta.predict(X_test.iloc[:1])
        t1 = time.perf_counter()
        avg_latency_ms = round(((t1 - t0) / 100.0) * 1000.0, 3)

        y_pred_xgb_delta = xgb_delta.predict(X_test)
        delta_metrics = self.compute_metrics(y_test, y_pred_xgb_delta, baseline_metrics=base_metrics)

        # Pooled metrics dictionary
        pooled_metrics = {
            "persistence_lag1": base_metrics,
            "xgboost_level": level_metrics,
            "xgboost_delta": delta_metrics,
        }

        # Cell-by-cell breakdown
        cell_metrics: Dict[str, Dict[str, ForecastMetrics]] = {}
        for square_id in sorted(self.test_df["square_id"].unique()):
            sq_mask = (self.test_df["square_id"] == square_id).to_numpy()
            y_test_sq = y_test[sq_mask]
            persist_sq = y_pred_persist[sq_mask]
            delta_sq = y_pred_xgb_delta[sq_mask]

            base_sq_m = self.compute_metrics(y_test_sq, persist_sq)
            delta_sq_m = self.compute_metrics(y_test_sq, delta_sq, baseline_metrics=base_sq_m)

            cell_metrics[f"CELL_SQ_{square_id}"] = {
                "persistence_lag1": base_sq_m,
                "xgboost_delta": delta_sq_m,
            }

        # Prediction records for detailed residual analysis
        records: List[PredictionRecord] = []
        for i, row in self.test_df.reset_index(drop=True).iterrows():
            act = float(row["target"])
            pred_p = float(y_pred_persist[i])
            pred_x = float(y_pred_xgb_delta[i])
            records.append(
                PredictionRecord(
                    timestamp=int(row["target_timestamp"]),
                    square_id=int(row["square_id"]),
                    actual=round(act, 4),
                    predicted_persistence=round(pred_p, 4),
                    predicted_xgboost=round(pred_x, 4),
                    residual_persistence=round(act - pred_p, 4),
                    residual_xgboost=round(act - pred_x, 4),
                )
            )

        summary = EvaluationSummary(
            dataset_name="Harvard Telecom Italia Milan CDR (Nov 1, 2013)",
            target_variable="activity",
            total_samples=len(self.feature_df),
            train_samples=len(self.train_df),
            test_samples=len(self.test_df),
            split_timestamp=self.split_timestamp,
            split_ratio=self.split_ratio,
            feature_names=feature_cols,
            pooled_metrics=pooled_metrics,
            cell_metrics=cell_metrics,
            feature_importances=xgb_delta.get_feature_importances(),
            inference_latency_ms=avg_latency_ms,
        )

        return summary, records
