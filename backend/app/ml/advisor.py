"""
Predictive Network Traffic Advisory Engine for RANGUARD.

Integrates trained XGBoost cellular traffic forecaster with real-time arbitration:
1. Loads serialized XGBoost regressor once from artifacts.
2. In-memory forecast caching per (cell_id, cycle) to ensure < 1 ms latency on cache hit.
3. Milan 10-minute activity index units explicitly handled (not Mbps).
4. Predicts short-term forward demand trends (SURGE, STABLE, DECLINE).
5. Detects premature power cuts (e.g. shutdown / deep power cuts during forecasted traffic surge).
6. Fail-safe fallback to pure physics arbitration if model is disabled or unavailable.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import pandas as pd

from .model import XGBoostTrafficForecaster
from .feature_pipeline import MilanFeaturePipeline
from ..simulation.traffic_provider import TrafficProvider, TrafficMode, MilanReplayTrafficProvider

logger = logging.getLogger(__name__)


class TrafficAdvisoryEngine:
    """Lightweight ML advisory engine evaluating forward traffic demand trends."""

    _instance: Optional[TrafficAdvisoryEngine] = None

    DEFAULT_CELL_TO_SQUARE: Dict[str, int] = {
        "CELL_01": 1,
        "CELL_02": 10,
        "CELL_03": 100,
        "CELL_04": 1000,
        "CELL_05": 1001,
        "CELL_06": 10000,
    }

    def __init__(
        self,
        artifact_dir: Optional[Path] = None,
        enabled: bool = True,
    ):
        self.ml_enabled = enabled
        self.model: Optional[XGBoostTrafficForecaster] = None
        self.feature_names: List[str] = MilanFeaturePipeline.FEATURE_COLUMNS
        self._forecast_cache: Dict[str, Dict[str, Any]] = {}
        self._milan_features_by_square: Dict[int, List[pd.DataFrame]] = {}
        self._model_load_attempted: bool = False
        self._load_error: Optional[str] = None

        if artifact_dir is None:
            self.artifact_dir = Path(__file__).resolve().parent / "artifacts"
        else:
            self.artifact_dir = Path(artifact_dir)

        self._initialize_model_and_features()

    @classmethod
    def get_instance(cls) -> TrafficAdvisoryEngine:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        cls._instance = None

    def toggle(self, enabled: bool) -> bool:
        """Enables or disables ML advisory signals."""
        self.ml_enabled = enabled
        self._forecast_cache.clear()
        return self.ml_enabled

    def _initialize_model_and_features(self) -> None:
        """Loads model artifacts and prepares Milan feature slices for fast O(1) inference."""
        self._model_load_attempted = True
        try:
            model_path = self.artifact_dir / "xgb_traffic_forecaster"
            if model_path.with_suffix(".json").exists() and model_path.with_suffix(".meta.json").exists():
                self.model = XGBoostTrafficForecaster.load(model_path)
                logger.info("TrafficAdvisoryEngine: Loaded XGBoost traffic forecaster successfully.")
            else:
                self._load_error = f"Model artifact not found at {model_path}"
                logger.warning(f"TrafficAdvisoryEngine: {self._load_error}. Operating in physics fallback mode.")
                return

            # Pre-slice Milan features for instant inference lookup
            data_file = Path(__file__).resolve().parent.parent.parent.parent / "data" / "raw" / "telecom_italia_milan" / "sample_sms-call-internet-mi-2013-11-01.txt"
            if data_file.exists():
                pipeline = MilanFeaturePipeline(data_path=data_file)
                full_df = pipeline.build_features()
                for sq_id, grp in full_df.groupby("square_id"):
                    sorted_grp = grp.sort_values("time_interval").reset_index(drop=True)
                    self._milan_features_by_square[sq_id] = [
                        sorted_grp.iloc[[i]] for i in range(len(sorted_grp))
                    ]
                logger.info(f"TrafficAdvisoryEngine: Pre-indexed features for {len(self._milan_features_by_square)} squares.")
        except Exception as e:
            self._load_error = str(e)
            logger.warning(f"TrafficAdvisoryEngine: Initialization failed: {e}. Falling back to physics referee.")

    def get_cell_advisory(
        self,
        cell_id: str,
        cycle: int,
        traffic_provider: Optional[TrafficProvider] = None,
        proposed_action_type: str = "POWER_ADJUST",
        proposed_delta_dbm: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Evaluates forward cellular traffic demand and issues capacity preservation advisory.
        All forecasts and metrics represent Milan CDR 10-minute activity index units.
        """
        # Base default report (when disabled or fallback)
        if not self.ml_enabled or self.model is None or not self.model.is_fitted:
            return {
                "cell_id": cell_id,
                "cycle": cycle,
                "ml_enabled": self.ml_enabled,
                "model_loaded": self.model is not None and self.model.is_fitted,
                "fallback_mode": True,
                "current_activity_index": 1.0,
                "predicted_activity_index": 1.0,
                "trend_delta": 0.0,
                "predicted_trend": "STABLE",
                "is_surge_predicted": False,
                "is_premature_power_cut": False,
                "advisory_signal": "NONE",
                "explanation": "ML advisory disabled or unavailable. Pure physics referee active.",
                "unit": "activity_index",
            }

        cache_key = f"{cell_id}_{cycle}"
        if cache_key in self._forecast_cache:
            advisory = dict(self._forecast_cache[cache_key])
            # Re-evaluate premature power cut flag based on specific proposed action
            return self._evaluate_action_against_advisory(advisory, proposed_action_type, proposed_delta_dbm)

        try:
            square_id = self.DEFAULT_CELL_TO_SQUARE.get(cell_id, 1)

            if square_id in self._milan_features_by_square and len(self._milan_features_by_square[square_id]) > 0:
                rows = self._milan_features_by_square[square_id]
                idx = (cycle - 1) % len(rows)
                row_df = rows[idx]
                X = row_df[self.feature_names]
                current_activity = float(row_df["lag_1"].values[0])
                predicted_activity = float(self.model.predict(X)[0])
            else:
                # Default heuristic for non-Milan cells
                current_activity = 1.0
                predicted_activity = 1.0

            trend_delta = round(predicted_activity - current_activity, 3)
            current_act_safe = max(current_activity, 0.1)
            surge_ratio = predicted_activity / current_act_safe

            # Classification of demand trend:
            # A surge is flagged if forward activity increases by >= 8% AND delta >= 0.3 units
            if surge_ratio >= 1.08 and trend_delta >= 0.3:
                trend = "SURGE"
                is_surge = True
            elif surge_ratio <= 0.92 and trend_delta <= -0.3:
                trend = "DECLINE"
                is_surge = False
            else:
                trend = "STABLE"
                is_surge = False

            base_advisory = {
                "cell_id": cell_id,
                "cycle": cycle,
                "ml_enabled": True,
                "model_loaded": True,
                "fallback_mode": False,
                "current_activity_index": round(current_activity, 2),
                "predicted_activity_index": round(predicted_activity, 2),
                "trend_delta": trend_delta,
                "predicted_trend": trend,
                "is_surge_predicted": is_surge,
                "unit": "activity_index",
            }
            # Cache the base forecast for this cycle
            self._forecast_cache[cache_key] = base_advisory

            return self._evaluate_action_against_advisory(base_advisory, proposed_action_type, proposed_delta_dbm)

        except Exception as e:
            logger.warning(f"TrafficAdvisoryEngine: Forecast failed for {cell_id} cycle {cycle}: {e}")
            return {
                "cell_id": cell_id,
                "cycle": cycle,
                "ml_enabled": self.ml_enabled,
                "model_loaded": False,
                "fallback_mode": True,
                "current_activity_index": 1.0,
                "predicted_activity_index": 1.0,
                "trend_delta": 0.0,
                "predicted_trend": "STABLE",
                "is_surge_predicted": False,
                "is_premature_power_cut": False,
                "advisory_signal": "NONE",
                "explanation": f"Forecast exception ({str(e)}). Pure physics referee fallback.",
                "unit": "activity_index",
            }

    def _evaluate_action_against_advisory(
        self,
        advisory: Dict[str, Any],
        proposed_action_type: str,
        proposed_delta_dbm: float,
    ) -> Dict[str, Any]:
        """Determines if a proposed controller action constitutes a premature power cut."""
        report = dict(advisory)
        is_surge = report.get("is_surge_predicted", False)
        cid = report.get("cell_id", "CELL")
        curr_act = report.get("current_activity_index", 1.0)
        pred_act = report.get("predicted_activity_index", 1.0)
        trend_d = report.get("trend_delta", 0.0)

        # Premature cut definition: shutdown or power cut <= -3.0 dBm during predicted surge
        is_cut = (proposed_action_type == "SHUTDOWN") or (proposed_delta_dbm <= -3.0)

        if is_surge and is_cut:
            report["is_premature_power_cut"] = True
            report["advisory_signal"] = "PREVENT_PREMATURE_CUT"
            report["explanation"] = (
                f"ML Advisory: Upcoming traffic surge forecasted on {cid} "
                f"({curr_act:.2f} -> {pred_act:.2f} activity index, +{trend_d:.2f} units). "
                f"Deep power reduction or shutdown risks severe capacity breach."
            )
        elif is_surge:
            report["is_premature_power_cut"] = False
            report["advisory_signal"] = "CAPACITY_MAINTAINED"
            report["explanation"] = (
                f"ML Advisory: Traffic surge projected on {cid} "
                f"({curr_act:.2f} -> {pred_act:.2f} activity index). Proposed configuration preserves headroom."
            )
        elif report.get("predicted_trend") == "DECLINE":
            report["is_premature_power_cut"] = False
            report["advisory_signal"] = "ALLOW_CONSERVATION"
            report["explanation"] = (
                f"ML Advisory: Traffic demand projected to decline on {cid} "
                f"({curr_act:.2f} -> {pred_act:.2f} activity index). Safe for aggressive energy conservation."
            )
        else:
            report["is_premature_power_cut"] = False
            report["advisory_signal"] = "ALLOW"
            report["explanation"] = (
                f"ML Advisory: Traffic demand projected stable on {cid} "
                f"({curr_act:.2f} -> {pred_act:.2f} activity index)."
            )

        return report
