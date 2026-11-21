"""XGBoost traffic forecaster implementation."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import numpy as np
import pandas as pd
import xgboost as xgb

from .schemas import ForecasterMode


class XGBoostTrafficForecaster:
    """XGBoost regressor for cellular traffic demand forecasting.

    Supports two formulation modes:
    1. LEVEL: Directly models y(t+1) = f(X_t).
    2. DELTA: Models innovation delta(t) = y(t+1) - y(t) = g(X_t),
       producing final forecast y_hat(t+1) = max(0, y(t) + delta_hat(t)).
       Residual formulation regularizes against drift and anchors to the persistence baseline.
    """

    def __init__(
        self,
        mode: ForecasterMode = ForecasterMode.XGBOOST_DELTA,
        n_estimators: int = 50,
        max_depth: int = 3,
        learning_rate: float = 0.04,
        subsample: float = 0.85,
        colsample_bytree: float = 0.85,
        reg_lambda: float = 3.0,
        reg_alpha: float = 0.5,
        random_state: int = 42,
    ):
        self.mode = mode
        self.params: Dict[str, Any] = {
            "n_estimators": n_estimators,
            "max_depth": max_depth,
            "learning_rate": learning_rate,
            "subsample": subsample,
            "colsample_bytree": colsample_bytree,
            "reg_lambda": reg_lambda,
            "reg_alpha": reg_alpha,
            "random_state": random_state,
            "objective": "reg:squarederror",
            "eval_metric": "rmse",
            "n_jobs": 1,
        }
        self.model: xgb.XGBRegressor = xgb.XGBRegressor(**self.params)
        self.feature_names_: List[str] = []
        self.is_fitted: bool = False

    def fit(
        self,
        X: pd.DataFrame,
        y: pd.Series,
    ) -> XGBoostTrafficForecaster:
        """Fits the XGBoost model on chronological training features and target.

        In DELTA mode, y must be the target_delta (y(t+1) - lag_1).
        In LEVEL mode, y must be the absolute target (y(t+1)).
        """
        self.feature_names_ = list(X.columns)
        self.model.fit(X, y)
        self.is_fitted = True
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Generates predictions for feature matrix X."""
        if not self.is_fitted:
            raise RuntimeError("Cannot predict with unfitted XGBoostTrafficForecaster.")

        raw_preds = self.model.predict(X[self.feature_names_])

        if self.mode == ForecasterMode.XGBOOST_DELTA:
            if "lag_1" not in X.columns:
                raise ValueError("DELTA mode requires 'lag_1' column in feature matrix to compute level forecast.")
            current_level = X["lag_1"].to_numpy(dtype=float)
            # Level forecast = lag_1 + delta_prediction, bounded below by 0
            final_forecast = np.maximum(0.0, current_level + raw_preds)
            return final_forecast
        else:
            return np.maximum(0.0, raw_preds)

    def get_feature_importances(self) -> Dict[str, float]:
        """Returns sorted feature importances (gain / weight)."""
        if not self.is_fitted:
            raise RuntimeError("Model is not fitted.")
        importances = self.model.feature_importances_
        res = {
            feat: round(float(imp), 4)
            for feat, imp in zip(self.feature_names_, importances)
        }
        return dict(sorted(res.items(), key=lambda item: item[1], reverse=True))

    def save(self, filepath: Union[str, Path]) -> None:
        """Serializes model weights and configuration to disk."""
        path = Path(filepath)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Save XGBoost native model
        model_path = path.with_suffix(".json")
        self.model.save_model(str(model_path))

        # Save metadata
        meta = {
            "mode": self.mode.value,
            "params": self.params,
            "feature_names": self.feature_names_,
            "is_fitted": self.is_fitted,
        }
        meta_path = path.with_suffix(".meta.json")
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

    @classmethod
    def load(cls, filepath: Union[str, Path]) -> XGBoostTrafficForecaster:
        """Loads serialized model and configuration."""
        path = Path(filepath)
        meta_path = path.with_suffix(".meta.json")
        model_path = path.with_suffix(".json")

        if not meta_path.exists() or not model_path.exists():
            raise FileNotFoundError(f"Model artifacts not found at {filepath}")

        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

        instance = cls(mode=ForecasterMode(meta["mode"]))
        instance.params = meta["params"]
        instance.feature_names_ = meta["feature_names"]
        instance.model = xgb.XGBRegressor(**instance.params)
        instance.model.load_model(str(model_path))
        instance.is_fitted = meta["is_fitted"]
        return instance
