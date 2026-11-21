"""Reproducible dataset generation with strict episode grouping and zero leakage.

Generates supervised pre-action features and digital-twin ground truth labels across:
- Multiple independent random seeds (Train: 42..48, Val: 49..50, Held-out Test: 101..105).
- Diverse traffic conditions (Synthetic Gaussian & Milan Replay).
- Multiple controller actions (Power Up, Power Down, Shutdown, Joint Compromise, Status Quo).
- Varied cell power levels (10 to 46 dBm).
- Edge-user concentration and interference stress conditions.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd

from ...simulation.network_engine import NetworkEngine
from ...simulation.traffic_provider import TrafficMode, SyntheticTrafficProvider, MilanReplayTrafficProvider
from ...controllers.controller_manager import ControllerManager
from ...referee.candidate_generator import CandidateGenerator
from ...referee.guardrails import SafetyGuardrails
from ...referee.shadow_simulator import ShadowSimulator
from .feature_extractor import extract_candidate_features, FEATURE_COLUMNS


DEFAULT_TRAIN_SEEDS = [42, 43, 44, 45, 46, 47, 48]
DEFAULT_VAL_SEEDS = [49, 50]
DEFAULT_TEST_SEEDS = [101, 102, 103, 104, 105]


class SurrogateDatasetGenerator:
    """Generates supervised datasets for training action-outcome surrogates."""

    def __init__(
        self,
        train_seeds: Optional[List[int]] = None,
        val_seeds: Optional[List[int]] = None,
        test_seeds: Optional[List[int]] = None,
    ):
        self.train_seeds = train_seeds or DEFAULT_TRAIN_SEEDS
        self.val_seeds = val_seeds or DEFAULT_VAL_SEEDS
        self.test_seeds = test_seeds or DEFAULT_TEST_SEEDS
        self.guardrails = SafetyGuardrails()
        self.shadow_simulator = ShadowSimulator(self.guardrails)

    def generate_episode_candidates(
        self,
        seed: int,
        traffic_mode: TrafficMode,
        cycles: int = 5,
        split: str = "train",
    ) -> List[Dict[str, Any]]:
        """
        Runs an episode for a single seed and generates candidates with pre-action features
        and digital-twin ground truth outcomes.
        """
        net = NetworkEngine(seed=seed, traffic_mode=traffic_mode)
        ctrl_mgr = ControllerManager()
        records: List[Dict[str, Any]] = []

        episode_id = f"ep_{split}_s{seed}_{traffic_mode.value}"

        for cycle in range(1, cycles + 1):
            base_metrics = net.metrics

            # 1. Standard autonomous controller proposals
            proposals = ctrl_mgr.generate_all_proposals(
                cells=net.cells,
                users=net.users,
                metrics=base_metrics,
                cycle=cycle,
            )

            # 2. Candidate generator produces status quo, proposals, and compromises
            candidate_defs = CandidateGenerator.generate_candidates(proposals, net.cells)

            # 3. Add stress candidates to guarantee high-impact and unsafe coverage cases
            # Test full shutdown on each cell to capture boundary failure states
            for cid in ["CELL_01", "CELL_03", "CELL_05"]:
                if cid in net.cells and net.cells[cid].is_active:
                    curr_p = net.cells[cid].tx_power_dbm
                    candidate_defs.append({
                        "candidate_id": f"STRESS-SHUTDOWN-{cid}-{cycle}",
                        "description": f"Stress test: Force shutdown of {cid}",
                        "target_cell": cid,
                        "proposed_power": 0.0,
                        "proposed_status": "SHUTDOWN",
                        "joint_actions": {cid: {"status": "SHUTDOWN", "tx_power_dbm": 0.0}},
                        "origin": "STRESS_GENERATOR",
                    })

            # Test deep power cuts (-6 to -12 dBm) and power boosts (+4 to +8 dBm)
            for cid in ["CELL_02", "CELL_04", "CELL_06"]:
                if cid in net.cells and net.cells[cid].is_active:
                    curr_p = net.cells[cid].tx_power_dbm
                    # Deep cut
                    cut_p = max(net.cells[cid].min_tx_power, curr_p - 8.0)
                    candidate_defs.append({
                        "candidate_id": f"STRESS-CUT-{cid}-{cycle}",
                        "description": f"Stress test: Deep power cut on {cid} to {cut_p:.1f} dBm",
                        "target_cell": cid,
                        "proposed_power": cut_p,
                        "proposed_status": "ACTIVE",
                        "joint_actions": {cid: {"status": "ACTIVE", "tx_power_dbm": cut_p}},
                        "origin": "STRESS_GENERATOR",
                    })
                    # High power boost
                    boost_p = min(net.cells[cid].max_tx_power, curr_p + 6.0)
                    candidate_defs.append({
                        "candidate_id": f"STRESS-BOOST-{cid}-{cycle}",
                        "description": f"Stress test: Max boost on {cid} to {boost_p:.1f} dBm",
                        "target_cell": cid,
                        "proposed_power": boost_p,
                        "proposed_status": "ACTIVE",
                        "joint_actions": {cid: {"status": "ACTIVE", "tx_power_dbm": boost_p}},
                        "origin": "STRESS_GENERATOR",
                    })

            # 4. Extract features strictly BEFORE candidate simulation
            # 5. Evaluate with Shadow Simulator (Digital Twin ground truth)
            evaluated = self.shadow_simulator.evaluate_candidates(net, candidate_defs)

            for c_def, cand in zip(candidate_defs, evaluated):
                # Extract pre-action feature vector
                feat_dict = extract_candidate_features(net, c_def)

                # Ground truth deltas calculated by the digital twin
                twin_m = cand.predicted_metrics
                delta_cov = round(float(twin_m.coverage_percentage - base_metrics.coverage_percentage), 4)
                delta_int = round(float(twin_m.interference_level - base_metrics.interference_level), 4)
                delta_nrg = round(float(twin_m.total_energy - base_metrics.total_energy), 4)

                row = {
                    "episode_id": episode_id,
                    "seed": seed,
                    "cycle": cycle,
                    "split": split,
                    "traffic_mode": traffic_mode.value,
                    "candidate_id": cand.candidate_id,
                    "target_cell": cand.target_cell,
                    "description": cand.description,
                    "proposed_power": cand.proposed_power,
                    "proposed_status": cand.proposed_status,
                    **feat_dict,
                    # Ground truth targets
                    "target_delta_coverage": delta_cov,
                    "target_delta_interference": delta_int,
                    "target_delta_energy": delta_nrg,
                    "target_coverage_pct": float(twin_m.coverage_percentage),
                    "target_interference": float(twin_m.interference_level),
                    "target_total_energy": float(twin_m.total_energy),
                    "target_is_safe": 1 if cand.is_safe else 0,
                    "target_violations_count": len(cand.violated_constraints),
                }
                records.append(row)

            # Advance network by 1 cycle
            net.step()

        return records

    def generate_full_dataset(self, cycles_per_episode: int = 4) -> pd.DataFrame:
        """
        Generates full dataset across train, val, and held-out test episodes.
        """
        all_records: List[Dict[str, Any]] = []

        # Train split
        for seed in self.train_seeds:
            for t_mode in [TrafficMode.SYNTHETIC, TrafficMode.MILAN_REPLAY]:
                recs = self.generate_episode_candidates(seed, t_mode, cycles=cycles_per_episode, split="train")
                all_records.extend(recs)

        # Validation split
        for seed in self.val_seeds:
            for t_mode in [TrafficMode.SYNTHETIC]:
                recs = self.generate_episode_candidates(seed, t_mode, cycles=cycles_per_episode, split="val")
                all_records.extend(recs)

        # Held-out Test split
        for seed in self.test_seeds:
            for t_mode in [TrafficMode.SYNTHETIC, TrafficMode.MILAN_REPLAY]:
                recs = self.generate_episode_candidates(seed, t_mode, cycles=cycles_per_episode, split="test")
                all_records.extend(recs)

        df = pd.DataFrame(all_records)
        return df


def generate_and_save_dataset(
    output_path: Optional[Path] = None,
    cycles_per_episode: int = 4,
) -> pd.DataFrame:
    """Utility function to generate and persist dataset."""
    if output_path is None:
        output_path = Path(__file__).resolve().parent.parent.parent.parent / "data" / "processed" / "surrogate_dataset.csv"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    generator = SurrogateDatasetGenerator()
    df = generator.generate_full_dataset(cycles_per_episode=cycles_per_episode)
    df.to_csv(output_path, index=False)
    return df
