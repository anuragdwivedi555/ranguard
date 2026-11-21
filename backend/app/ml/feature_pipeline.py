"""Feature engineering and temporal data pipeline for Harvard Milan traffic forecasting.

Strict Causality Rules:
1. No future leakage: Features for predicting traffic at time t+1 are constructed
   strictly using observations available at or before decision time t.
2. Chronological integrity: Observations are ordered strictly by time interval per spatial square.
3. No silent synthetic fallback: Requires valid Milan dataset records; raises FileNotFoundError if missing.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd

from ..datasets.milan_adapter import MilanAdapter
from .schemas import ForecastTarget


class MilanFeaturePipeline:
    """End-to-end data ingestion and temporal feature engineering pipeline."""

    FEATURE_COLUMNS: List[str] = [
        "lag_1",
        "lag_2",
        "lag_3",
        "lag_6",
        "rolling_mean_3",
        "rolling_std_3",
        "rolling_mean_6",
        "rolling_max_6",
        "rolling_min_6",
        "delta_1",
        "delta_3",
        "sin_interval",
        "cos_interval",
        "call_activity_lag1",
        "sms_activity_lag1",
        "square_id",
    ]

    def __init__(
        self,
        data_path: Optional[Union[str, Path]] = None,
        target_type: ForecastTarget = ForecastTarget.ACTIVITY,
    ):
        self.target_type = target_type
        if data_path is not None:
            resolved_path = Path(data_path)
        else:
            base_dir = Path(__file__).resolve().parent.parent.parent.parent
            resolved_path = base_dir / "data" / "raw" / "telecom_italia_milan" / "sample_sms-call-internet-mi-2013-11-01.txt"

        if not resolved_path.exists():
            raise FileNotFoundError(
                f"Milan dataset file not found at: {resolved_path}. "
                "ML forecasting pipeline requires authentic Milan records; silent fallback is forbidden."
            )

        self.data_path = resolved_path
        self._raw_df: Optional[pd.DataFrame] = None
        self._feature_df: Optional[pd.DataFrame] = None

    def load_raw_data(self) -> pd.DataFrame:
        """Load and validate raw Milan CDR records using MilanAdapter."""
        adapter = MilanAdapter(data_dir=self.data_path.parent)
        df = adapter.load_raw(self.data_path)
        validation = adapter.validate(df)
        if not validation.is_valid:
            raise ValueError(f"Milan dataset validation failed: {validation.errors}")
        self._raw_df = df
        return df

    def prepare_time_series(self, raw_df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
        """Aggregate records per square and 10-minute interval, computing traffic channels."""
        if raw_df is None:
            raw_df = self.load_raw_data() if self._raw_df is None else self._raw_df

        df = raw_df.copy()
        for col in ["sms_in", "sms_out", "call_in", "call_out", "internet_traffic"]:
            df[col] = df[col].fillna(0.0)

        # Composite activity formulation as defined in Milan CDR literature and simulation bridge
        df["call_activity"] = df["call_in"] + df["call_out"]
        df["sms_activity"] = df["sms_in"] + df["sms_out"]
        df["activity"] = (
            df["internet_traffic"]
            + 0.5 * df["call_activity"]
            + 0.2 * df["sms_activity"]
        )

        # Aggregate across country codes for each (square_id, time_interval)
        grouped = df.groupby(["square_id", "time_interval"], as_index=False)[
            ["activity", "internet_traffic", "call_activity", "sms_activity"]
        ].sum()

        return grouped

    def build_features(self, ts_df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
        """Generate strictly causal lag, rolling, and temporal cyclical features."""
        if ts_df is None:
            ts_df = self.prepare_time_series()

        target_col = self.target_type.value
        all_squares_records: List[pd.DataFrame] = []

        for square_id, group in ts_df.groupby("square_id"):
            sq = group.sort_values("time_interval").copy().reset_index(drop=True)
            y = sq[target_col]

            # Forward target at t+1 (to be predicted at decision time t)
            sq["target"] = y.shift(-1)
            sq["target_timestamp"] = sq["time_interval"].shift(-1)

            # Known observations at decision time t:
            # lag_1 is y(t) (the current observed value at time t)
            sq["lag_1"] = y
            sq["lag_2"] = y.shift(1)  # y(t-1)
            sq["lag_3"] = y.shift(2)  # y(t-2)
            sq["lag_6"] = y.shift(5)  # y(t-5)

            # Rolling statistics computed strictly over past observations [t, t-1, t-2, ...]
            # Note: sq[['lag_1', 'lag_2', 'lag_3']] are values at t, t-1, t-2
            sq["rolling_mean_3"] = sq[["lag_1", "lag_2", "lag_3"]].mean(axis=1)
            sq["rolling_std_3"] = sq[["lag_1", "lag_2", "lag_3"]].std(axis=1).fillna(0.0)

            past_6 = [f"lag_{i}" for i in [1, 2, 3]] + [sq[target_col].shift(i) for i in range(3, 6)]
            past_6_df = pd.DataFrame({
                "p0": sq["lag_1"],
                "p1": sq["lag_2"],
                "p2": sq["lag_3"],
                "p3": sq[target_col].shift(3),
                "p4": sq[target_col].shift(4),
                "p5": sq["lag_6"],
            })
            sq["rolling_mean_6"] = past_6_df.mean(axis=1)
            sq["rolling_max_6"] = past_6_df.max(axis=1)
            sq["rolling_min_6"] = past_6_df.min(axis=1)

            # Momentum / delta features
            sq["delta_1"] = sq["lag_1"] - sq["lag_2"]
            sq["delta_3"] = sq["lag_1"] - sq["lag_3"]

            # Innovation / residual target for delta forecasting
            sq["target_delta"] = sq["target"] - sq["lag_1"]

            # Cross-channel exogenous telephony indicators at time t
            sq["call_activity_lag1"] = sq["call_activity"]
            sq["sms_activity_lag1"] = sq["sms_activity"]

            # Temporal cyclical features
            dt = pd.to_datetime(sq["time_interval"], unit="ms")
            interval_of_day = dt.dt.hour * 6 + (dt.dt.minute // 10)
            sq["interval_of_day"] = interval_of_day
            sq["sin_interval"] = np.sin(2.0 * np.pi * interval_of_day / 144.0)
            sq["cos_interval"] = np.cos(2.0 * np.pi * interval_of_day / 144.0)

            all_squares_records.append(sq)

        full_df = pd.concat(all_squares_records, ignore_index=True)

        # Drop rows with NaN resulting from lags (first 5 steps) and final target (last step)
        clean_df = full_df.dropna().sort_values(["time_interval", "square_id"]).reset_index(drop=True)
        self._feature_df = clean_df
        return clean_df

    def get_feature_matrix(
        self,
        df: Optional[pd.DataFrame] = None,
    ) -> Tuple[pd.DataFrame, pd.Series, pd.Series]:
        """Extract (X, y_target, y_delta) from processed feature DataFrame.

        Returns:
            X: DataFrame with FEATURE_COLUMNS
            y_target: Series with absolute target values at t+1
            y_delta: Series with delta values (target - lag_1)
        """
        if df is None:
            df = self._feature_df if self._feature_df is not None else self.build_features()

        X = df[self.FEATURE_COLUMNS].copy()
        y_target = df["target"].copy()
        y_delta = df["target_delta"].copy()
        return X, y_target, y_delta

    @staticmethod
    def verify_temporal_causality(df: pd.DataFrame) -> bool:
        """Verifies strictly causal construction: target_timestamp > time_interval.

        Asserts that every target observation occurs strictly in the future
        relative to the decision timestamp.
        """
        if "target_timestamp" not in df.columns or "time_interval" not in df.columns:
            return False
        # Target timestamp must be strictly greater than decision time interval
        time_diffs = df["target_timestamp"] - df["time_interval"]
        # Expected step is exactly 10 minutes (600,000 ms)
        return bool((time_diffs > 0).all())
