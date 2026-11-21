from typing import Dict, List
import numpy as np
from ..models.cell import Cell
from ..models.metrics import NetworkMetrics
from ..models.decision import CandidateAction


class ObjectiveOptimizer:
    """
    Evaluates and scores feasible candidates using a normalized multi-objective function.
    Weights:
      Energy improvement: 0.30
      Interference improvement: 0.25
      Coverage quality: 0.25
      Minimum action magnitude: 0.20
    """
    WEIGHT_ENERGY: float = 0.30
    WEIGHT_INTERFERENCE: float = 0.25
    WEIGHT_COVERAGE: float = 0.25
    WEIGHT_MIN_CHANGE: float = 0.20

    @classmethod
    def score_candidates(
        cls,
        candidates: List[CandidateAction],
        baseline_metrics: NetworkMetrics,
        current_cells: Dict[str, Cell],
    ) -> List[CandidateAction]:
        scored_candidates = []

        base_energy = max(baseline_metrics.total_energy, 1.0)
        base_interference = max(baseline_metrics.interference_level, 0.01)
        base_coverage = baseline_metrics.coverage_percentage

        for cand in candidates:
            if not cand.is_safe:
                cand.objective_score = -999.0
                cand.energy_score = -1.0
                cand.interference_score = -1.0
                cand.coverage_score = -1.0
                cand.change_score = -1.0
                scored_candidates.append(cand)
                continue

            pred = cand.predicted_metrics

            # 1. Energy score: Lower is better. Relative reduction from baseline.
            # Range: [-1.0, 1.0]
            energy_diff = (base_energy - pred.total_energy) / base_energy
            e_score = float(np.clip(energy_diff * 2.0, -1.0, 1.0))

            # 2. Interference score: Lower is better. Relative reduction from baseline.
            int_diff = (base_interference - pred.interference_level) / base_interference
            i_score = float(np.clip(int_diff * 1.5, -1.0, 1.0))

            # 3. Coverage quality score: Higher is better.
            # Baseline maintenance and margin above safe 95% threshold.
            cov_delta = (pred.coverage_percentage - base_coverage) / 5.0
            cov_margin = (pred.coverage_percentage - 95.0) / 5.0
            c_score = float(np.clip(cov_delta + cov_margin, -1.0, 1.0))

            # 4. Action magnitude score: Smallest safe change is preferred.
            # Compute total dB power adjustments made by candidate.
            total_delta_db = 0.0
            for cid, act in cand.joint_actions.items():
                if cid in current_cells and "tx_power_dbm" in act:
                    total_delta_db += abs(act["tx_power_dbm"] - current_cells[cid].tx_power_dbm)
            # Delta 0 gives 1.0; delta 10 dB gives 0.0; larger delta can become negative
            m_score = float(np.clip(1.0 - (total_delta_db / 10.0), -1.0, 1.0))

            total_score = (
                cls.WEIGHT_ENERGY * e_score
                + cls.WEIGHT_INTERFERENCE * i_score
                + cls.WEIGHT_COVERAGE * c_score
                + cls.WEIGHT_MIN_CHANGE * m_score
            )

            cand.energy_score = round(e_score, 3)
            cand.interference_score = round(i_score, 3)
            cand.coverage_score = round(c_score, 3)
            cand.change_score = round(m_score, 3)
            cand.objective_score = round(total_score, 4)

            scored_candidates.append(cand)

        # Sort feasible candidates by objective score descending
        # Unsafe candidates will be at the bottom (-999.0)
        scored_candidates.sort(key=lambda c: (c.is_safe, c.objective_score), reverse=True)
        return scored_candidates

    @classmethod
    def explain(
        cls,
        cand: CandidateAction,
        baseline_metrics: NetworkMetrics,
        current_cells: Dict[str, Cell],
    ) -> List[Dict]:
        """
        Display-ready breakdown of score_candidates(): for each objective the formula with
        the real inputs, the clipped score, its weight and its contribution to the total.
        """
        if not cand.is_safe:
            return []
        pred = cand.predicted_metrics
        be = max(baseline_metrics.total_energy, 1.0)
        bi = max(baseline_metrics.interference_level, 0.01)
        bc = baseline_metrics.coverage_percentage
        total_delta = 0.0
        for cid, act in cand.joint_actions.items():
            if cid in current_cells and "tx_power_dbm" in act:
                total_delta += abs(act["tx_power_dbm"] - current_cells[cid].tx_power_dbm)
        terms = [
            {
                "key": "energy",
                "label": "Energy saving",
                "weight": cls.WEIGHT_ENERGY,
                "score": cand.energy_score,
                "formula": f"({be:.2f} − {pred.total_energy:.2f}) ÷ {be:.2f} × 2",
                "raw": (be - pred.total_energy) / be * 2.0,
            },
            {
                "key": "interference",
                "label": "Interference reduction",
                "weight": cls.WEIGHT_INTERFERENCE,
                "score": cand.interference_score,
                "formula": f"({bi:.1f} − {pred.interference_level:.1f}) ÷ {bi:.1f} × 1.5",
                "raw": (bi - pred.interference_level) / bi * 1.5,
            },
            {
                "key": "coverage",
                "label": "Coverage quality",
                "weight": cls.WEIGHT_COVERAGE,
                "score": cand.coverage_score,
                "formula": f"({pred.coverage_percentage:.1f} − {bc:.1f}) ÷ 5  +  ({pred.coverage_percentage:.1f} − 95) ÷ 5",
                "raw": (pred.coverage_percentage - bc) / 5.0 + (pred.coverage_percentage - 95.0) / 5.0,
            },
            {
                "key": "change",
                "label": "Smallest change",
                "weight": cls.WEIGHT_MIN_CHANGE,
                "score": cand.change_score,
                "formula": f"1 − {total_delta:.1f} dB ÷ 10",
                "raw": 1.0 - total_delta / 10.0,
            },
        ]
        for t in terms:
            t["raw"] = round(t["raw"], 3)
            t["contribution"] = round(t["weight"] * t["score"], 4)
        return terms
