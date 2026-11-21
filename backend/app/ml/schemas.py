"""Pydantic schemas and data transfer objects for ML traffic forecasting."""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class ForecastTarget(str, Enum):
    """Target variable to forecast."""
    ACTIVITY = "activity"
    INTERNET_TRAFFIC = "internet_traffic"
    CALLS = "calls"
    SMS = "sms"


class ForecasterMode(str, Enum):
    """Forecasting operational mode."""
    PERSISTENCE_LAG1 = "persistence_lag1"
    PERSISTENCE_ROLLING_MEAN = "persistence_rolling_mean"
    XGBOOST_LEVEL = "xgboost_level"
    XGBOOST_DELTA = "xgboost_delta"


class ForecastMetrics(BaseModel):
    """Evaluation metrics for time-series forecast."""
    mae: float = Field(..., description="Mean Absolute Error")
    rmse: float = Field(..., description="Root Mean Squared Error")
    r2: float = Field(..., description="Coefficient of Determination (R^2)")
    mape: Optional[float] = Field(None, description="Mean Absolute Percentage Error (%)")
    smape: Optional[float] = Field(None, description="Symmetric Mean Absolute Percentage Error (%)")
    improvement_mae_pct: Optional[float] = Field(None, description="MAE improvement percentage over baseline")
    improvement_rmse_pct: Optional[float] = Field(None, description="RMSE improvement percentage over baseline")
    sample_count: int = Field(..., description="Number of evaluated samples")


class PredictionRecord(BaseModel):
    """Single-step forecast prediction record."""
    timestamp: int = Field(..., description="Target time interval in ms")
    square_id: int = Field(..., description="Milan spatial square ID")
    actual: float = Field(..., description="Ground truth observed value")
    predicted_persistence: float = Field(..., description="Lag-1 persistence prediction")
    predicted_xgboost: float = Field(..., description="XGBoost model prediction")
    residual_persistence: float = Field(..., description="Actual - persistence")
    residual_xgboost: float = Field(..., description="Actual - XGBoost")


class EvaluationSummary(BaseModel):
    """Complete summary of chronological ML evaluation across models and cells."""
    dataset_name: str
    target_variable: str
    total_samples: int
    train_samples: int
    test_samples: int
    split_timestamp: int
    split_ratio: float
    feature_names: List[str]
    pooled_metrics: Dict[str, ForecastMetrics]
    cell_metrics: Dict[str, Dict[str, ForecastMetrics]]
    feature_importances: Dict[str, float]
    inference_latency_ms: float
