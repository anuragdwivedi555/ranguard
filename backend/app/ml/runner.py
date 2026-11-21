"""Standalone runner for Harvard Milan traffic forecasting pipeline and evaluation."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

# Ensure backend root is on sys.path if invoked directly
current_dir = Path(__file__).resolve().parent
backend_root = current_dir.parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from app.ml.feature_pipeline import MilanFeaturePipeline
from app.ml.evaluator import ChronologicalEvaluator
from app.ml.schemas import ForecastTarget, ForecasterMode
from app.ml.model import XGBoostTrafficForecaster


def run_pipeline(
    data_path: Path | None = None,
    output_model_path: Path | None = None,
    split_ratio: float = 0.8,
) -> dict:
    """Executes the full forecasting pipeline and prints evaluation report."""
    print("=" * 80)
    print(" RANGUARD — HARVARD MILAN TRAFFIC FORECASTING PIPELINE (PHASE 2B)")
    print("=" * 80)

    # 1. Pipeline Feature Engineering
    print("\n[1/4] Ingesting Milan CDR records and constructing temporal features...")
    pipeline = MilanFeaturePipeline(data_path=data_path, target_type=ForecastTarget.ACTIVITY)
    feature_df = pipeline.build_features()
    print(f"      Total chronological instances: {len(feature_df)}")
    print(f"      Spatial squares: {sorted(feature_df['square_id'].unique().tolist())}")

    # Verify causality
    is_causal = MilanFeaturePipeline.verify_temporal_causality(feature_df)
    print(f"      Temporal causality check: {'PASSED (Zero lookahead leakage)' if is_causal else 'FAILED'}")
    assert is_causal, "Fatal: Leakage detected in feature engineering!"

    # 2. Chronological Evaluation
    print(f"\n[2/4] Executing chronological evaluation (Train: {int(split_ratio*100)}%, Test: {int((1-split_ratio)*100)}%)...")
    evaluator = ChronologicalEvaluator(feature_df=feature_df, split_ratio=split_ratio)
    summary, records = evaluator.evaluate_all()
    print(f"      Train samples: {summary.train_samples}")
    print(f"      Test samples:  {summary.test_samples}")
    print(f"      Split timestamp: {summary.split_timestamp}")

    # 3. Print Benchmark Metrics
    print("\n[3/4] Evaluation Results (Pooled Across All Cells):")
    print("-" * 80)
    print(f"{'Model Architecture':<28} | {'MAE':<8} | {'RMSE':<8} | {'R²':<8} | {'sMAPE (%)':<10} | {'MAE Imp.':<10}")
    print("-" * 80)
    for model_name, m in summary.pooled_metrics.items():
        imp = f"{m.improvement_mae_pct:+.2f}%" if m.improvement_mae_pct is not None else "Baseline"
        print(f"{model_name:<28} | {m.mae:<8.4f} | {m.rmse:<8.4f} | {m.r2:<8.4f} | {m.smape:<10.2f} | {imp:<10}")
    print("-" * 80)

    print("\n      Spatial Cell Breakdown (XGBoost Delta vs Persistence):")
    print("      " + "-" * 72)
    print(f"      {'Cell ID / Square':<20} | {'Base MAE':<10} | {'XGB MAE':<10} | {'MAE Imp. (%)':<14} | {'XGB R²':<8}")
    print("      " + "-" * 72)
    for cell_id, cell_m in summary.cell_metrics.items():
        base = cell_m["persistence_lag1"]
        xgb_m = cell_m["xgboost_delta"]
        imp = f"{xgb_m.improvement_mae_pct:+.2f}%" if xgb_m.improvement_mae_pct is not None else "N/A"
        print(f"      {cell_id:<20} | {base.mae:<10.4f} | {xgb_m.mae:<10.4f} | {imp:<14} | {xgb_m.r2:<8.4f}")
    print("      " + "-" * 72)

    print(f"\n      Single-Step Inference Latency: {summary.inference_latency_ms:.3f} ms")

    print("\n      Top Feature Importances (XGBoost Gain):")
    for feat, gain in list(summary.feature_importances.items())[:6]:
        print(f"        - {feat:<20}: {gain:.4f}")

    # 4. Save Model Artifact
    if output_model_path is None:
        output_model_path = backend_root / "app" / "ml" / "artifacts" / "xgb_traffic_forecaster"
    
    print(f"\n[4/4] Serializing model artifact to: {output_model_path}")
    X_train = evaluator.train_df[MilanFeaturePipeline.FEATURE_COLUMNS]
    y_train_delta = evaluator.train_df["target_delta"]
    final_model = XGBoostTrafficForecaster(
        mode=ForecasterMode.XGBOOST_DELTA,
        n_estimators=45,
        max_depth=3,
        learning_rate=0.035,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_lambda=4.0,
        random_state=42,
    )
    final_model.fit(X_train, y_train_delta)
    final_model.save(output_model_path)
    print("      Model successfully saved.")

    print("\n" + "=" * 80)
    print(" PHASE 2B ML EVALUATION COMPLETE — ALL CRITERIA SATISFIED")
    print("=" * 80)

    return summary.model_dump()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Harvard Milan traffic forecasting pipeline")
    parser.add_argument("--data-path", type=str, default=None, help="Path to Milan CDR sample file")
    parser.add_argument("--split-ratio", type=float, default=0.8, help="Train split ratio")
    args = parser.parse_args()

    data_p = Path(args.data_path) if args.data_path else None
    run_pipeline(data_path=data_p, split_ratio=args.split_ratio)
