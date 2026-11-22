"""Baseline benchmark models for candidate action surrogate evaluation."""

from __future__ import annotations

from typing import Dict, List, Tuple
import numpy as np
import pandas as pd


class ZeroDeltaBaseline:
    """
    Persistence / No-Effect Baseline.
    Predicts zero change for both coverage and interference (delta = 0).
    """
    def __init__(self):
        self.name = "Zero-Delta Persistence Baseline"

    def fit(self, X: pd.DataFrame, y_cov: np.ndarray, y_int: np.ndarray) -> ZeroDeltaBaseline:
        return self

    def predict(self, X: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        n = len(X)
        pred_cov = np.zeros(n, dtype=float)
        pred_int = np.zeros(n, dtype=float)
        return pred_cov, pred_int


class MeanDeltaBaseline:
    """
    Mean Outcome Baseline.
    Predicts the mean training set delta for coverage and interference.
    """
    def __init__(self):
        self.name = "Training Mean Baseline"
        self.mean_cov: float = 0.0
        self.mean_int: float = 0.0

    def fit(self, X: pd.DataFrame, y_cov: np.ndarray, y_int: np.ndarray) -> MeanDeltaBaseline:
        self.mean_cov = float(np.mean(y_cov))
        self.mean_int = float(np.mean(y_int))
        return self

    def predict(self, X: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        n = len(X)
        pred_cov = np.full(n, self.mean_cov, dtype=float)
        pred_int = np.full(n, self.mean_int, dtype=float)
        return pred_cov, pred_int


class LinearRidgeBaseline:
    """
    Ridge Linear Regression Baseline.
    Linear regularized mapping from features to coverage and interference deltas.
    """
    def __init__(self, alpha: float = 1.0):
        self.name = "Linear Ridge Regression Baseline"
        self.alpha = alpha
        self.weights_cov: Optional[np.ndarray] = None
        self.intercept_cov: float = 0.0
        self.weights_int: Optional[np.ndarray] = None
        self.intercept_int: float = 0.0
        self.mean_: Optional[np.ndarray] = None
        self.std_: Optional[np.ndarray] = None

    def fit(self, X: pd.DataFrame, y_cov: np.ndarray, y_int: np.ndarray) -> LinearRidgeBaseline:
        X_mat = X.to_numpy(dtype=float)
        self.mean_ = np.mean(X_mat, axis=0)
        self.std_ = np.std(X_mat, axis=0)
        self.std_[self.std_ == 0] = 1.0

        X_norm = (X_mat - self.mean_) / self.std_
        n, d = X_norm.shape

        # Closed-form Ridge: w = (X^T X + alpha * I)^(-1) X^T (y - y_mean)
        A = X_norm.T @ X_norm + self.alpha * np.eye(d)

        y_cov_c = y_cov - np.mean(y_cov)
        self.weights_cov = np.linalg.solve(A, X_norm.T @ y_cov_c)
        self.intercept_cov = float(np.mean(y_cov))

        y_int_c = y_int - np.mean(y_int)
        self.weights_int = np.linalg.solve(A, X_norm.T @ y_int_c)
        self.intercept_int = float(np.mean(y_int))

        return self

    def predict(self, X: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        X_mat = X.to_numpy(dtype=float)
        X_norm = (X_mat - self.mean_) / self.std_
        pred_cov = X_norm @ self.weights_cov + self.intercept_cov
        pred_int = X_norm @ self.weights_int + self.intercept_int
        return pred_cov, pred_int
