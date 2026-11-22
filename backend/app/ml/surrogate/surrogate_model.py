"""Lightweight XGBoost Action-Outcome Surrogate Model.

Predicts continuous coverage and interference changes resulting from proposed controller actions.
Integrates exact deterministic mathematical modeling for electrical power calculations.
"""

from __future__ import annotations

import json
from pathlib import Path
import time
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd
import xgboost as xgb

from ...simulation.network_engine import NetworkEngine
from ...simulation.energy_model import EnergyModel
from ...models.cell import Cell
from .feature_extractor import extract_candidate_features, FEATURE_COLUMNS
from .schemas import SurrogatePrediction


class XGBoostActionSurrogate:
    """Lightweight dual XGBoost regressor for cellular controller action outcomes."""

    def __init__(
        self,
        n_estimators: int = 45,
        max_depth: int = 3,
        learning_rate: float = 0.06,
        subsample: float = 0.85,
        colsample_bytree: float = 0.85,
        reg_lambda: float = 2.0,
        random_state: int = 42,
        **kwargs,
    ):
        self.params: Dict[str, Any] = {
            "n_estimators": n_estimators,
            "max_depth": max_depth,
            "learning_rate": learning_rate,
            "subsample": subsample,
            "colsample_bytree": colsample_bytree,
            "reg_lambda": reg_lambda,
            "random_state": random_state,
            "objective": kwargs.get("objective", "reg:squarederror"),
            "eval_metric": kwargs.get("eval_metric", "rmse"),
            "n_jobs": kwargs.get("n_jobs", 1),
        }
        self.model_coverage: xgb.XGBRegressor = xgb.XGBRegressor(**self.params)
        self.model_interference: xgb.XGBRegressor = xgb.XGBRegressor(**self.params)
        self.feature_names: List[str] = list(FEATURE_COLUMNS)
        self.is_fitted: bool = False

    def fit(
        self,
        X: pd.DataFrame,
        y_coverage: pd.Series,
        y_interference: pd.Series,
    ) -> XGBoostActionSurrogate:
        """Fits both coverage and interference surrogates."""
        self.feature_names = list(X.columns)
        self.model_coverage.fit(X[self.feature_names], y_coverage)
        self.model_interference.fit(X[self.feature_names], y_interference)
        self.is_fitted = True
        return self

    def predict_batch(self, X: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """Predicts coverage and interference delta arrays for batch features."""
        if not self.is_fitted:
            raise RuntimeError("Cannot predict with unfitted surrogate model.")
        X_mat = X[self.feature_names]
        pred_cov = self.model_coverage.predict(X_mat)
        pred_int = self.model_interference.predict(X_mat)
        return pred_cov, pred_int

    def predict_single_candidate(
        self,
        live_network: NetworkEngine,
        candidate_def: Dict[str, Any],
    ) -> SurrogatePrediction:
        """
        Generates a timestamped surrogate prediction for a candidate action before simulation.
        Includes deterministic energy calculation and multi-objective surrogate scoring.
        """
        t0 = time.perf_counter()

        # 1. Extract pre-action feature vector
        feat_dict = extract_candidate_features(live_network, candidate_def)
        feat_df = pd.DataFrame([feat_dict], columns=self.feature_names)

        # 2. Predict coverage and interference deltas
        if self.is_fitted:
            pred_cov_delta = float(self.model_coverage.predict(feat_df)[0])
            pred_int_delta = float(self.model_interference.predict(feat_df)[0])
        else:
            # Fallback zero-delta if uninitialized
            pred_cov_delta = 0.0
            pred_int_delta = 0.0

        base_cov = feat_dict["base_coverage_pct"]
        base_int = feat_dict["base_interference"]
        base_energy = feat_dict["base_total_energy"]

        # Clamp predicted metrics to physical bounds
        pred_coverage_pct = float(np.clip(base_cov + pred_cov_delta, 0.0, 100.0))
        pred_interference = float(max(0.0, base_int + pred_int_delta))

        # 3. Deterministic exact electrical power calculation
        # Electrical power model is mathematically exact and inexpensive:
        # P_cell = 0 if shutdown, else 10 + 0.5 * 10^((tx_power - 30)/10)
        joint_actions = candidate_def.get("joint_actions", {})
        delta_energy = 0.0
        for cid, act in joint_actions.items():
            if cid in live_network.cells:
                orig_cell = live_network.cells[cid]
                orig_energy = EnergyModel.calculate_cell_energy(orig_cell)

                # Shadow modified cell
                new_status = act.get("status", orig_cell.status)
                new_pwr = float(act.get("tx_power_dbm", orig_cell.tx_power_dbm))
                temp_cell = Cell(
                    cell_id=cid,
                    x=orig_cell.x,
                    y=orig_cell.y,
                    tx_power_dbm=new_pwr,
                    status=new_status,
                )
                new_energy = EnergyModel.calculate_cell_energy(temp_cell)
                delta_energy += (new_energy - orig_energy)

        delta_energy = round(float(delta_energy), 3)
        pred_total_energy = round(max(0.0, base_energy + delta_energy), 3)

        # 4. Predict safety compliance (Coverage threshold >= 95.0%)
        # Safety risk score: Sigmoid on margin (95.0 - pred_coverage)
        margin = 95.0 - pred_coverage_pct
        safety_risk_score = float(1.0 / (1.0 + np.exp(-margin))) if abs(margin) < 20.0 else (1.0 if margin > 0 else 0.0)
        predicted_is_safe = bool(pred_coverage_pct >= 95.0 and feat_dict["target_cell_proposed_pwr"] <= 46.0)

        # 5. Multi-objective surrogate scoring
        # Energy score
        e_diff = (base_energy - pred_total_energy) / max(base_energy, 1.0)
        e_score = float(np.clip(e_diff * 2.0, -1.0, 1.0))
        # Interference score
        i_diff = (base_int - pred_interference) / max(base_int, 0.01)
        i_score = float(np.clip(i_diff * 1.5, -1.0, 1.0))
        # Coverage score
        cov_delta = pred_cov_delta / 5.0
        cov_margin = (pred_coverage_pct - 95.0) / 5.0
        c_score = float(np.clip(cov_delta + cov_margin, -1.0, 1.0))
        # Change magnitude score
        m_score = float(np.clip(1.0 - (feat_dict["action_total_delta_db"] / 10.0), -1.0, 1.0))

        if predicted_is_safe:
            surrogate_score = round(0.30 * e_score + 0.25 * i_score + 0.25 * c_score + 0.20 * m_score, 4)
        else:
            surrogate_score = -999.0

        latency_ms = round((time.perf_counter() - t0) * 1000.0, 3)

        return SurrogatePrediction(
            candidate_id=candidate_def["candidate_id"],
            target_cell=candidate_def.get("target_cell", "ALL"),
            predicted_coverage_delta=round(pred_cov_delta, 3),
            predicted_coverage_pct=round(pred_coverage_pct, 2),
            predicted_interference_delta=round(pred_int_delta, 3),
            predicted_interference=round(pred_interference, 3),
            predicted_energy_delta=delta_energy,
            predicted_total_energy=pred_total_energy,
            predicted_is_safe=predicted_is_safe,
            safety_risk_score=round(safety_risk_score, 4),
            surrogate_objective_score=surrogate_score,
            prediction_latency_ms=latency_ms,
        )

    def get_feature_importances(self) -> Dict[str, Dict[str, float]]:
        """Returns sorted feature importances for both models."""
        if not self.is_fitted:
            raise RuntimeError("Surrogate models are not fitted.")

        imp_cov = self.model_coverage.feature_importances_
        imp_int = self.model_interference.feature_importances_

        res_cov = {f: round(float(v), 4) for f, v in zip(self.feature_names, imp_cov)}
        res_int = {f: round(float(v), 4) for f, v in zip(self.feature_names, imp_int)}

        return {
            "coverage": dict(sorted(res_cov.items(), key=lambda x: x[1], reverse=True)),
            "interference": dict(sorted(res_int.items(), key=lambda x: x[1], reverse=True)),
        }

    def save(self, artifact_dir: Union[str, Path]) -> None:
        """Serializes both XGBoost models and metadata."""
        path = Path(artifact_dir)
        path.mkdir(parents=True, exist_ok=True)

        self.model_coverage.save_model(str(path / "xgb_coverage_surrogate.json"))
        self.model_interference.save_model(str(path / "xgb_interference_surrogate.json"))

        meta = {
            "params": self.params,
            "feature_names": self.feature_names,
            "is_fitted": self.is_fitted,
            "version": "xgb-action-surrogate-v1.0",
            "saved_at": time.time(),
        }
        with open(path / "surrogate_meta.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

    @classmethod
    def load(cls, artifact_dir: Union[str, Path]) -> XGBoostActionSurrogate:
        """Loads serialized models and metadata."""
        path = Path(artifact_dir)
        meta_file = path / "surrogate_meta.json"
        cov_file = path / "xgb_coverage_surrogate.json"
        int_file = path / "xgb_interference_surrogate.json"

        if not meta_file.exists() or not cov_file.exists() or not int_file.exists():
            raise FileNotFoundError(f"Surrogate artifacts missing in {path}")

        with open(meta_file, "r", encoding="utf-8") as f:
            meta = json.load(f)

        instance = cls(**meta.get("params", {}))
        instance.feature_names = meta.get("feature_names", list(FEATURE_COLUMNS))
        instance.model_coverage = xgb.XGBRegressor(**instance.params)
        instance.model_interference = xgb.XGBRegressor(**instance.params)

        instance.model_coverage.load_model(str(cov_file))
        instance.model_interference.load_model(str(int_file))
        instance.is_fitted = meta.get("is_fitted", True)
        return instance
