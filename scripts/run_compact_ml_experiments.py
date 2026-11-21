"""
RANGUARD Compact Comparative Benchmarking Script (Priority 3).

Executes reproducible multi-policy comparison:
- Policies: NO_REFEREE, FIXED_PRIORITY, RANGUARD_ML_OFF, RANGUARD_ML_ON
- Scenarios: CELL_SHUTDOWN, TRAFFIC_SPIKE, PING_PONG
- Traffic Sources: SYNTHETIC, MILAN_REPLAY
- Seeds: [101, 102]
- Measured metrics: Coverage (Mean & Min), Power, Cumulative Energy (Wh), SINR, Interference,
  Safety Violations, Control Reversals (Physical vs Proposed), Arbitration Latency, and ML Advisory Triggers.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
import time
from typing import Any, Dict, List
import pandas as pd

from app.benchmarking.runner import BenchmarkRunner, BenchmarkConfig, PolicyType, ScenarioType, RunRecord
from app.simulation.traffic_provider import TrafficMode
from app.simulation.state_manager import StateManager
from app.ml.advisor import TrafficAdvisoryEngine


def run_compact_experiments(output_dir: Path) -> List[Dict[str, Any]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    seeds = [101, 102]
    scenarios = [ScenarioType.CELL_SHUTDOWN, ScenarioType.TRAFFIC_SPIKE, ScenarioType.PING_PONG]
    cycles_per_run = 20

    records: List[Dict[str, Any]] = []

    runner = BenchmarkRunner(BenchmarkConfig(cycles_per_run=cycles_per_run))
    advisor = TrafficAdvisoryEngine.get_instance()

    total_runs = len(seeds) * len(scenarios) * 2 * 4  # 2 seeds * 3 scenarios * 2 traffic modes * 4 policies = 48 runs
    run_idx = 1

    print(f"Starting Compact Experimental Benchmark: {total_runs} total runs across 4 policies...")

    for traffic_mode in [TrafficMode.SYNTHETIC, TrafficMode.MILAN_REPLAY]:
        for scenario in scenarios:
            for seed in seeds:
                # 1. NO_REFEREE
                rec_no = runner.run_single_experiment(
                    seed=seed,
                    scenario=scenario,
                    policy=PolicyType.NO_REFEREE,
                    cycles=cycles_per_run,
                    traffic_mode=traffic_mode,
                )
                records.append({**rec_no.model_dump(), "policy_label": "NO_REFEREE", "ml_advisory_triggers": 0})

                # 2. FIXED_PRIORITY
                rec_fp = runner.run_single_experiment(
                    seed=seed,
                    scenario=scenario,
                    policy=PolicyType.FIXED_PRIORITY,
                    cycles=cycles_per_run,
                    traffic_mode=traffic_mode,
                )
                records.append({**rec_fp.model_dump(), "policy_label": "FIXED_PRIORITY", "ml_advisory_triggers": 0})

                # 3. RANGUARD (ML OFF)
                advisor.toggle(False)
                rec_ml_off = runner.run_single_experiment(
                    seed=seed,
                    scenario=scenario,
                    policy=PolicyType.RANGUARD,
                    cycles=cycles_per_run,
                    traffic_mode=traffic_mode,
                )
                records.append({**rec_ml_off.model_dump(), "policy_label": "RANGUARD (ML OFF)", "ml_advisory_triggers": 0})

                # 4. RANGUARD (ML ON)
                advisor.toggle(True)
                rec_ml_on = runner.run_single_experiment(
                    seed=seed,
                    scenario=scenario,
                    policy=PolicyType.RANGUARD,
                    cycles=cycles_per_run,
                    traffic_mode=traffic_mode,
                )
                records.append({
                    **rec_ml_on.model_dump(),
                    "policy_label": "RANGUARD (ML ON)",
                    "ml_advisory_triggers": rec_ml_on.ml_advisory_triggers_count,
                })

                run_idx += 4
                print(f"  Completed seed {seed} for scenario {scenario.value} ({traffic_mode.value}) [{run_idx}/{total_runs}]")

    # Save to CSV
    csv_path = output_dir / "compact_experiments_summary.csv"
    df = pd.DataFrame(records)
    df.to_csv(csv_path, index=False)
    print(f"\nSaved CSV summary to: {csv_path}")

    # Save to JSON
    json_path = output_dir / "compact_experiments_summary.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)
    print(f"Saved JSON summary to: {json_path}")

    # Aggregate by policy
    agg = df.groupby("policy_label").agg({
        "mean_coverage_pct": "mean",
        "min_coverage_pct": "mean",
        "mean_power_watts": "mean",
        "cumulative_energy_wh": "mean",
        "mean_sinr_db": "mean",
        "safety_violations_count": "mean",
        "control_reversals_count": "mean",
        "median_arbitration_latency_ms": "mean",
        "ml_advisory_triggers": "mean",
    }).round(2)

    print("\n================ COMPACT BENCHMARK SUMMARY (AGGREGATED) ================")
    print(agg.to_string())
    print("========================================================================\n")

    return records


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "results"
    run_compact_experiments(out)
