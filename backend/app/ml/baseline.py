"""Persistence baseline forecaster implementations for traffic forecasting."""

from __future__ import annotations

from typing import Optional
import numpy as np
import pandas as pd

from .schemas import ForecasterMode


class PersistenceForecaster:
    """Non-parametric persistence baseline models for chronological time series.

    Supports:
    1. LAG_1 (Naive Persistence): y_hat(t+1) = y(t).
       Standard reference benchmark in telecom time-series forecasting.
    2. ROLLING_MEAN: y_hat(t+1) = (1/k) * sum_{i=0}^{k-1} y(t-i).
    """

    def __init__(self, mode: ForecasterMode = ForecasterMode.PERSISTENCE_LAG1):
        self.mode = mode
        self.is_fitted = True

    def fit(self, X: pd.DataFrame, y: Optional[pd.Series] = None) -> PersistenceForecaster:
        """Persistence requires no parameter estimation; satisfies scikit-learn interface."""
        self.is_fitted = True
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Generate forecasts based on the selected persistence rule."""
        if self.mode == ForecasterMode.PERSISTENCE_LAG1:
            if "lag_1" not in X.columns:
                raise ValueError("Persistence lag-1 forecaster requires 'lag_1' column in feature matrix.")
            return np.maximum(0.0, X["lag_1"].to_numpy(dtype=float))
        elif self.mode == ForecasterMode.PERSISTENCE_ROLLING_MEAN:
            col = "rolling_mean_3" if "rolling_mean_3" in X.columns else "lag_1"
            return np.maximum(0.0, X[col].to_numpy(dtype=float))
        else:
            raise ValueError(f"Unsupported persistence mode: {self.mode}")
