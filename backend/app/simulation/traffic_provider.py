"""Traffic Provider Interface and Implementations for RANGUARD Simulation.

Supports:
1. SYNTHETIC: Deterministic baseline user traffic demand.
2. MILAN_REPLAY: Deterministic temporal replay of normalized historical
   Call Detail Records (CDRs) from the Harvard Telecom Italia Milan dataset.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional
import numpy as np
import pandas as pd

from ..models.cell import Cell
from ..models.user import User
from ..datasets.milan_adapter import MilanAdapter


class TrafficMode(str, Enum):
    """Traffic generation / replay mode."""
    SYNTHETIC = "SYNTHETIC"
    MILAN_REPLAY = "MILAN_REPLAY"


class TrafficProvider(ABC):
    """Abstract interface for traffic demand generation and replay."""

    @property
    @abstractmethod
    def mode(self) -> TrafficMode:
        """Return the active traffic mode."""
        pass

    @abstractmethod
    def update_cycle(
        self,
        users: List[User],
        cells: Dict[str, Cell],
        cycle: int,
    ) -> Dict[str, float]:
        """Update traffic demands across users/cells for the given simulation cycle.

        Returns:
            Dict mapping cell_id to its relative demand multiplier for this cycle.
        """
        pass

    @abstractmethod
    def get_relative_demand_factor(self, cell_id: str, cycle: int) -> float:
        """Return the relative traffic scaling factor for a specific cell in cycle."""
        pass


class SyntheticTrafficProvider(TrafficProvider):
    """Provides deterministic synthetic user traffic demand."""

    def __init__(self):
        self._mode = TrafficMode.SYNTHETIC

    @property
    def mode(self) -> TrafficMode:
        return self._mode

    def update_cycle(
        self,
        users: List[User],
        cells: Dict[str, Cell],
        cycle: int,
    ) -> Dict[str, float]:
        """In synthetic mode, users preserve their deterministic baseline demand."""
        for u in users:
            base = getattr(u, "base_traffic_demand", u.traffic_demand)
            u.traffic_demand = base
        return {cid: 1.0 for cid in cells}

    def get_relative_demand_factor(self, cell_id: str, cycle: int) -> float:
        return 1.0


class MilanReplayTrafficProvider(TrafficProvider):
    """Replays historical Telecom Italia Milan CDR internet and telecommunications activity.

    Deterministic Transformation:
    -----------------------------
    Milan CDR records provide aggregated 10-minute activity levels for SMS, calls, and Internet.
    These activity values are NOT interpreted as raw Mbps throughput measurements.
    Instead, they are normalized into a relative demand index:

        Activity(s, t) = internet_traffic + 0.5 * (call_in + call_out) + 0.2 * (sms_in + sms_out)
        MeanActivity(s) = (1 / T) * sum_{t=1}^T Activity(s, t)
        RelativeFactor(s, t) = clamp(Activity(s, t) / MeanActivity(s), min_factor, max_factor)

    User traffic demand at cycle t is then scaled relative to their deterministic baseline:
        Demand_u(t) = BaseDemand_u * RelativeFactor(serving_cell(u), t)

    This preserves the physical units of Mbps from the base simulation, while faithfully
    replaying the non-stationary diurnal cycles and spatial heterogeneity of the Milan telecom network.

    Strict Data Rule:
    -----------------
    Does not silently fall back to synthetic data if source files are missing; raises FileNotFoundError.
    """

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
        data_path: Optional[Path] = None,
        cell_to_square_map: Optional[Dict[str, int]] = None,
        min_factor: float = 0.1,
        max_factor: float = 4.0,
    ):
        self._mode = TrafficMode.MILAN_REPLAY
        self.min_factor = min_factor
        self.max_factor = max_factor
        self.cell_to_square = cell_to_square_map or self.DEFAULT_CELL_TO_SQUARE

        # Resolve path
        if data_path is not None:
            resolved_path = Path(data_path)
        else:
            # Default to repo raw data location
            base_dir = Path(__file__).resolve().parent.parent.parent.parent
            resolved_path = base_dir / "data" / "raw" / "telecom_italia_milan" / "sample_sms-call-internet-mi-2013-11-01.txt"

        if not resolved_path.exists():
            raise FileNotFoundError(
                f"Milan CDR dataset file not found at: {resolved_path}. "
                "MILAN_REPLAY mode requires valid Milan source records; silent fallback to synthetic is forbidden."
            )

        self.data_path = resolved_path
        self._load_and_preprocess()

    @property
    def mode(self) -> TrafficMode:
        return self._mode

    def _load_and_preprocess(self) -> None:
        """Ingests Milan CDR data via MilanAdapter and pre-computes normalized relative demand curves."""
        adapter = MilanAdapter(data_dir=self.data_path.parent)
        raw_df = adapter.load_raw(self.data_path)

        validation = adapter.validate(raw_df)
        if not validation.is_valid:
            raise ValueError(f"Milan dataset validation failed: {validation.errors}")

        # Fill NaNs with 0.0
        df = raw_df.copy()
        for col in ["sms_in", "sms_out", "call_in", "call_out", "internet_traffic"]:
            df[col] = df[col].fillna(0.0)

        # Activity formulation: Internet volume + weighted telephony events
        df["activity"] = (
            df["internet_traffic"]
            + 0.5 * (df["call_in"] + df["call_out"])
            + 0.2 * (df["sms_in"] + df["sms_out"])
        )

        # Aggregate across country codes for each (square_id, time_interval)
        grouped = df.groupby(["square_id", "time_interval"], as_index=False)["activity"].sum()

        # Extract chronological unique timestamps
        self.timestamps: List[int] = sorted(grouped["time_interval"].unique().tolist())
        if not self.timestamps:
            raise ValueError("No valid time intervals found in Milan dataset records.")

        # Compute mean activity per square across the full trace
        square_means = grouped.groupby("square_id")["activity"].mean().to_dict()

        # Build pivot table: rows = timestamps, columns = square_id
        pivot = grouped.pivot(index="time_interval", columns="square_id", values="activity").fillna(0.0)

        # Compute relative demand factor matrix: Activity(s, t) / MeanActivity(s)
        self.factors_by_timestamp: Dict[int, Dict[int, float]] = {}
        for t in self.timestamps:
            self.factors_by_timestamp[t] = {}
            for sq in pivot.columns:
                mean_act = square_means.get(sq, 1.0)
                if mean_act <= 1e-6:
                    rel_factor = 1.0
                else:
                    raw_factor = float(pivot.loc[t, sq]) / mean_act
                    rel_factor = float(np.clip(raw_factor, self.min_factor, self.max_factor))
                self.factors_by_timestamp[t][int(sq)] = round(rel_factor, 4)

    def get_relative_demand_factor(self, cell_id: str, cycle: int) -> float:
        """Determines the relative demand scaling factor for a cell at the given simulation cycle."""
        if not self.timestamps:
            return 1.0
        time_idx = (max(1, cycle) - 1) % len(self.timestamps)
        ts = self.timestamps[time_idx]
        square_id = self.cell_to_square.get(cell_id, 1)
        return self.factors_by_timestamp.get(ts, {}).get(square_id, 1.0)

    def update_cycle(
        self,
        users: List[User],
        cells: Dict[str, Cell],
        cycle: int,
    ) -> Dict[str, float]:
        """Applies deterministic relative demand modulation across users and cells."""
        # 1. Fetch factor for each cell
        cell_factors = {cid: self.get_relative_demand_factor(cid, cycle) for cid in cells}

        # 2. Update user traffic demand
        for u in users:
            # Determine target cell factor (serving cell or nearest active cell)
            target_cid = u.serving_cell
            if not target_cid or target_cid not in cells:
                # Find nearest active cell
                best_cid = "CELL_01"
                min_dist = 1e9
                for cid, c in cells.items():
                    d = np.hypot(u.x - c.x, u.y - c.y)
                    if d < min_dist:
                        min_dist = d
                        best_cid = cid
                target_cid = best_cid

            factor = cell_factors.get(target_cid, 1.0)
            base = getattr(u, "base_traffic_demand", u.traffic_demand)
            u.traffic_demand = float(round(base * factor, 2))

        return cell_factors
