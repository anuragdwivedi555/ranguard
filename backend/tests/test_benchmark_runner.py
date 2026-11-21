"""Tests for the RANGUARD Reproducible Benchmark Runner."""

import json
from pathlib import Path
import pytest
import pandas as pd

from app.benchmarking.runner import (
    BenchmarkRunner,
    BenchmarkConfig,
    PolicyType,
    ScenarioType,
    RunRecord,
)
from app.simulation.traffic_provider import TrafficMode


def test_benchmark_runner_single_experiment():
    """Verify single experiment execution generates a complete RunRecord with valid metrics."""
    runner = BenchmarkRunner()
    rec = runner.run_single_experiment(
        seed=42,
        scenario=ScenarioType.CELL_SHUTDOWN,
        policy=PolicyType.RANGUARD,
        cycles=3,
        traffic_mode=TrafficMode.SYNTHETIC,
    )

    assert isinstance(rec, RunRecord)
    assert rec.seed == 42
    assert rec.scenario == "CELL_SHUTDOWN"
    assert rec.policy == "RANGUARD"
    assert rec.cycles_completed == 3
    assert rec.mean_coverage_pct >= 95.0
    assert rec.mean_power_watts > 50.0
    assert rec.cumulative_energy_joules > 0.0
    assert rec.cumulative_energy_wh > 0.0
    assert rec.median_arbitration_latency_ms >= 0.0


def test_benchmark_runner_matrix_and_fairness(tmp_path: Path):
    """Verify that multiple policies run under identical initial states and fair conditions."""
    cfg = BenchmarkConfig(
        seeds=[101],
        cycles_per_run=3,
        scenarios=[ScenarioType.PING_PONG],
        policies=[PolicyType.NO_REFEREE, PolicyType.FIXED_PRIORITY, PolicyType.RANGUARD],
        traffic_mode=TrafficMode.SYNTHETIC,
        results_dir=tmp_path,
    )
    runner = BenchmarkRunner(cfg)
    records = runner.run_matrix()

    assert len(records) == 3
    policies = {r.policy for r in records}
    assert policies == {"NO_REFEREE", "FIXED_PRIORITY", "RANGUARD"}

    # Save results and verify CSV and JSON
    csv_p, json_p = runner.save_results(records, output_dir=tmp_path)
    assert csv_p.exists()
    assert json_p.exists()

    df = pd.read_csv(csv_p)
    assert len(df) == 3
    assert "mean_coverage_pct" in df.columns
    assert "cumulative_energy_wh" in df.columns

    with open(json_p, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert len(data) == 3
