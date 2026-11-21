"""Physical normalization and experiment isolation engine for RANGUARD.

Standardizes heterogeneous measurement units (bps, kbps, dBm, ratios) and
strictly isolates incompatible network experiments to prevent cross-contamination.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Set
from .schemas import ExperimentContext, NormalizedRecord


class IncompatibleExperimentError(ValueError):
    """Raised when an operation attempts to mix records from incompatible network experiments."""
    pass


class NormalizationEngine:
    """Enforces standardized physical units and experiment boundary integrity."""

    @staticmethod
    def bps_to_mbps(bps: Optional[float]) -> Optional[float]:
        """Convert bits per second to Megabits per second."""
        if bps is None or (isinstance(bps, float) and math.isnan(bps)):
            return None
        return round(float(bps) / 1_000_000.0, 4)

    @staticmethod
    def kbps_to_mbps(kbps: Optional[float]) -> Optional[float]:
        """Convert Kilobits per second to Megabits per second."""
        if kbps is None or (isinstance(kbps, float) and math.isnan(kbps)):
            return None
        return round(float(kbps) / 1_000.0, 4)

    @staticmethod
    def percentage_to_ratio(pct: Optional[float]) -> Optional[float]:
        """Convert percentage (0..100) to unit interval ratio (0.0..1.0)."""
        if pct is None or (isinstance(pct, float) and math.isnan(pct)):
            return None
        return round(max(0.0, min(1.0, float(pct) / 100.0)), 4)

    @staticmethod
    def mw_to_dbm(mw: Optional[float]) -> Optional[float]:
        """Convert milliwatts to decibel-milliwatts (dBm)."""
        if mw is None or (isinstance(mw, float) and math.isnan(mw)) or mw <= 0:
            return None
        return round(10.0 * math.log10(mw), 2)

    @staticmethod
    def dbm_to_mw(dbm: Optional[float]) -> Optional[float]:
        """Convert dBm to milliwatts."""
        if dbm is None or (isinstance(dbm, float) and math.isnan(dbm)):
            return None
        return round(10.0 ** (dbm / 10.0), 4)

    @staticmethod
    def map_slice_id_to_type(slice_id: Any) -> str:
        """Map standard 3GPP / O-RAN slice IDs to human-readable slice categories."""
        if slice_id is None:
            return "Unknown"
        try:
            val_float = float(slice_id)
            if not math.isnan(val_float):
                slice_id = int(val_float)
        except (ValueError, TypeError):
            pass

        str_id = str(slice_id).strip()
        if str_id.endswith(".0"):
            str_id = str_id[:-2]

        mapping = {
            "0": "eMBB",
            "1": "URLLC",
            "2": "MTC",
            "embb": "eMBB",
            "urllc": "URLLC",
            "mtc": "MTC",
        }
        return mapping.get(str_id.lower(), f"Slice-{str_id}")

    @staticmethod
    def verify_experiment_isolation(records: List[NormalizedRecord]) -> None:
        """Enforce Requirement 8: prevent mixing measurements from unrelated network experiments.

        Raises IncompatibleExperimentError if records from different dataset_id or
        unmatched experiment_id are combined without partitioning.
        """
        if not records:
            return

        experiment_keys: Set[str] = set()
        dataset_keys: Set[str] = set()

        for r in records:
            p = r.provenance
            dataset_keys.add(p.dataset_id.value)
            exp_id = p.experiment_id or "default"
            experiment_keys.add(f"{p.dataset_id.value}:{exp_id}")

        if len(dataset_keys) > 1:
            raise IncompatibleExperimentError(
                f"Experiment isolation violation: Attempted to combine records across disparate datasets: {sorted(list(dataset_keys))}. "
                "Each dataset represents fundamentally distinct physical or simulated setups (e.g., Rome 7-gNB vs Milan 100x100 grid vs Madrid Twinning). "
                "Segregate experiments before ingestion."
            )

        if len(experiment_keys) > 1:
            raise IncompatibleExperimentError(
                f"Experiment isolation violation: Attempted to mix multiple distinct experiments within the same batch: {sorted(list(experiment_keys))}. "
                "Partition records by experiment_id to preserve physical measurement integrity."
            )
