"""
Reproducible Script: Train and Quantify ML Decision Intelligence Surrogate (Priorities 2 & 3).

1. Generates supervised dataset across varied network conditions and independent seeds:
   - Train seeds: [42, 43, 44, 45, 46, 47, 48]
   - Validation seeds: [49, 50]
   - Held-out Test seeds: [101, 102, 103, 104, 105]
2. Trains lightweight XGBoost action surrogates (Coverage Delta & Interference Delta).
3. Benchmarks against Zero-Delta (Persistence), Training Mean, and Linear Ridge baselines.
4. Evaluates on strictly held-out test episodes:
   - MAE, RMSE, R^2
   - Candidate ranking concordance (Top-1 agreement & Spearman rho)
   - Safety risk precision, recall, and false negative counts
   - Inference latency (Mean, P50, P95 across 1,000 iterations)
5. Exports:
   - results/ml_decision_intelligence_metrics.csv
   - results/ml_decision_intelligence_predictions.csv
   - backend/app/ml/artifacts/xgb_coverage_surrogate.json
   - backend/app/ml/artifacts/xgb_interference_surrogate.json
   - backend/app/ml/artifacts/surrogate_meta.json
"""

import sys
from pathlib import Path
import json

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.ml.surrogate.dataset_generator import SurrogateDatasetGenerator
from app.ml.surrogate.evaluator import SurrogateEvaluator


def main():
    root_dir = Path(__file__).resolve().parent.parent
    data_dir = root_dir / "data" / "processed"
    results_dir = root_dir / "results"
    artifacts_dir = backend_dir / "app" / "ml" / "artifacts"

    data_dir.mkdir(parents=True, exist_ok=True)
    results_dir.mkdir(parents=True, exist_ok=True)
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    dataset_path = data_dir / "surrogate_dataset.csv"

    print("=" * 70)
    print("STEP 1: Generating reproducible supervised surrogate dataset...")
    print("=" * 70)
    generator = SurrogateDatasetGenerator()
    df = generator.generate_full_dataset(cycles_per_episode=4)
    df.to_csv(dataset_path, index=False)
    print(f"Generated {len(df)} total candidate-action observations.")
    print(f"  Train samples: {len(df[df['split'] == 'train'])} (Seeds 42..48)")
    print(f"  Val samples:   {len(df[df['split'] == 'val'])} (Seeds 49..50)")
    print(f"  Test samples:  {len(df[df['split'] == 'test'])} (Seeds 101..105, STRICTLY HELD-OUT)")
    print(f"Saved dataset to: {dataset_path}")

    print("\n" + "=" * 70)
    print("STEP 2: Training surrogate models and benchmarking against baselines...")
    print("=" * 70)
    evaluator = SurrogateEvaluator(dataset_path=dataset_path, results_dir=results_dir)
    summary, pred_df = evaluator.run_full_evaluation(artifact_dir=artifacts_dir)

    print("\n" + "=" * 70)
    print("HELD-OUT EVALUATION RESULTS (Seeds 101..105):")
    print("=" * 70)
    print(f"{'Model':<35} | {'Target':<18} | {'MAE':<7} | {'RMSE':<7} | {'R^2':<7} | {'P50 (ms)':<8}")
    print("-" * 95)
    for row in summary["metrics_summary"]:
        print(f"{row['model_name']:<35} | {row['target']:<18} | {str(row['mae']):<7} | {str(row['rmse']):<7} | {str(row['r2']):<7} | {str(row['inference_p50_ms']):<8}")

    print("\n" + "=" * 70)
    print("SAFETY CLASSIFICATION & RANKING CONCORDANCE:")
    print("=" * 70)
    safety = summary["xgb_safety_metrics"]
    print(f"Safety Violation Precision: {safety['precision']:.4f}")
    print(f"Safety Violation Recall:    {safety['recall']:.4f}")
    print(f"Safety Violation F1 Score:  {safety['f1']:.4f}")
    print(f"Unsafe False Negatives:     {safety['false_negatives']} (out of {safety['total_actual_unsafe']} actual unsafe actions)")
    print(f"Top-1 Candidate Match:      {summary['top1_agreement_pct']:.2f}%")
    print(f"Mean Spearman Rank Rho:     {summary['mean_spearman_rho']:.4f}")
    print(f"Inference Latency P50:      {summary['inference_latency']['p50_ms']:.3f} ms")
    print(f"Inference Latency P95:      {summary['inference_latency']['p95_ms']:.3f} ms")

    print("\n" + "=" * 70)
    print("SAVED ARTIFACTS:")
    print("=" * 70)
    print(f"Metrics CSV:     {summary['metrics_csv_path']}")
    print(f"Predictions CSV: {summary['predictions_csv_path']}")
    print(f"Model Artifacts: {artifacts_dir}")
    print("\nTraining and evaluation pipeline completed successfully.")


if __name__ == "__main__":
    main()
