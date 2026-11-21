"""Deterministic Synthetic Network Data Generator.

Provides reproducible fallback telemetry when external research datasets are unavailable.
Strictly flags all generated records with is_synthetic=True and explicit provenance
so synthetic data can NEVER be mistaken for real empirical measurements.
"""

from __future__ import annotations

import math
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from .base import DatasetAdapter
from .schemas import (
    DatasetID,
    DatasetMetadata,
    ExperimentContext,
    LicenseType,
    MeasurementCategory,
    NormalizedRecord,
    ProvenanceMetadata,
    ValidationResult,
)


class SyntheticNetworkGenerator(DatasetAdapter):
    """Deterministic synthetic data generator explicitly tagged as non-empirical."""

    def __init__(self, seed: int = 42, num_cells: int = 6, num_users: int = 100) -> None:
        super().__init__()
        self.seed = seed
        self.num_cells = num_cells
        self.num_users = num_users

    @property
    def dataset_id(self) -> DatasetID:
        return DatasetID.SYNTHETIC

    def is_synthetic(self) -> bool:
        return True

    def get_metadata(self) -> DatasetMetadata:
        return DatasetMetadata(
            id=self.dataset_id,
            name="RANGUARD Deterministic Synthetic Network Generator",
            description=(
                "Parametric synthetic network telemetry generator modeling a 6-cell, 100-user cellular network. "
                "Intended solely for offline testing, CI/CD pipeline execution, and baseline verification when "
                "external datasets are unavailable. NEVER silently substituted for empirical records."
            ),
            primary_paper_citation="RANGUARD System Architecture & Simulation Specification (2026)",
            repository_url="https://github.com/anuragdwivedi555/ranguard",
            doi=None,
            license=LicenseType.PROPRIETARY_SYNTHETIC,
            attribution_requirement="Internal RANGUARD project synthetic generator.",
            access_restrictions="None. Generated on-demand deterministically via configured random seed.",
            file_formats=["Synthetic In-Memory Stream", "CSV Export"],
            available_columns={
                "synthetic_telemetry": [
                    "cycle", "cell_id", "connected_users", "mean_rsrp_dbm",
                    "mean_sinr_db", "total_demand_mbps", "energy_index"
                ]
            },
            total_download_size_bytes=0,
            sample_download_size_bytes=0,
            is_available_locally=True,
            is_synthetic=True,
            notes="WARNING: Generated mathematically via log-distance pathloss and diurnal demand functions.",
        )

    def generate_cycles(
        self,
        num_cycles: int = 10,
        base_timestamp_ms: int = 1700000000000,
    ) -> List[NormalizedRecord]:
        """Generate deterministic synthetic records across multiple network cycles."""
        rng = np.random.default_rng(self.seed)
        records: List[NormalizedRecord] = []

        # Standard RANGUARD 6-cell positions in a 100x100 grid
        cell_positions = {
            "CELL_01": (25.0, 30.0),
            "CELL_02": (75.0, 30.0),
            "CELL_03": (50.0, 50.0),
            "CELL_04": (25.0, 70.0),
            "CELL_05": (75.0, 70.0),
            "CELL_06": (50.0, 85.0),
        }

        for cycle in range(num_cycles):
            t_ms = base_timestamp_ms + (cycle * 1000)  # 1-second cycles
            # Diurnal modulation factor
            diurnal = 1.0 + 0.3 * math.sin(2.0 * math.pi * cycle / 24.0)

            for cell_idx, (cid, (cx, cy)) in enumerate(cell_positions.items()):
                # Connected users per cell (sum ~100)
                base_users = 16 + int(rng.integers(-4, 5))
                connected = max(1, int(base_users * diurnal))

                # Downlink demand per user ~1.5 Mbps
                dl_mbps = round(connected * (1.2 + float(rng.uniform(0.1, 0.6))), 2)
                ul_mbps = round(dl_mbps * 0.15, 2)

                # RF characteristics
                rsrp = round(float(rng.normal(-82.0, 4.0)), 2)
                sinr = round(float(rng.normal(14.0, 3.5)), 2)
                bler = round(float(rng.uniform(0.001, 0.02)), 4)
                prb = min(50, max(5, int(dl_mbps * 2)))

                provenance = ProvenanceMetadata(
                    dataset_id=self.dataset_id,
                    source_reference="RANGUARD Synthetic Model (Offline Fallback)",
                    license=LicenseType.PROPRIETARY_SYNTHETIC,
                    attribution="RANGUARD Synthetic Mode (Seed: %d)" % self.seed,
                    is_synthetic=True,
                    synthetic_seed=self.seed,
                    experiment_id=f"synthetic_seed_{self.seed}_c{self.num_cells}",
                    node_or_cell_id=cid,
                    original_units={"throughput": "Mbps", "rsrp": "dBm", "sinr": "dB", "bler": "ratio"},
                )

                records.append(
                    NormalizedRecord(
                        record_id=f"synth_{cid}_cycle{cycle}_{t_ms}",
                        timestamp_ms=t_ms,
                        provenance=provenance,
                        category=MeasurementCategory.RADIO_TELEMETRY,
                        cell_id=cid,
                        connected_users_count=connected,
                        throughput_downlink_mbps=dl_mbps,
                        throughput_uplink_mbps=ul_mbps,
                        rsrp_dbm=rsrp,
                        sinr_db=sinr,
                        bler_downlink=bler,
                        prb_allocated=prb,
                        spatial_grid_x=cx,
                        spatial_grid_y=cy,
                        traffic_demand_index=round(dl_mbps, 2),
                    )
                )

        return records

    def load_raw(self, file_path: Path) -> pd.DataFrame:
        """For synthetic generator, either loads an exported synthetic CSV or generates on demand."""
        if file_path.exists():
            return pd.read_csv(file_path)
        # Generate default in-memory dataframe
        records = self.generate_cycles(num_cycles=5)
        data = [
            {
                "cycle": int(r.record_id.split("_")[2].replace("cycle", "")),
                "cell_id": r.cell_id,
                "connected_users": r.connected_users_count,
                "mean_rsrp_dbm": r.rsrp_dbm,
                "mean_sinr_db": r.sinr_db,
                "total_demand_mbps": r.throughput_downlink_mbps,
                "time_ms": r.timestamp_ms,
            }
            for r in records
        ]
        return pd.DataFrame(data)

    def validate(self, df: pd.DataFrame) -> ValidationResult:
        """Validate synthetic dataframe."""
        required = ["cell_id", "connected_users", "mean_rsrp_dbm"]
        missing = [c for c in required if c not in df.columns]
        if missing:
            return ValidationResult(
                is_valid=False,
                total_records=len(df),
                valid_count=0,
                invalid_count=len(df),
                errors=[f"Synthetic DataFrame missing: {missing}"],
            )
        return ValidationResult(
            is_valid=True,
            total_records=len(df),
            valid_count=len(df),
            invalid_count=0,
            errors=[],
            warnings=["Operating in SYNTHETIC mode: Data is artificially generated."],
        )

    def normalize(
        self,
        df: pd.DataFrame,
        context: Optional[ExperimentContext] = None,
        source_file: Optional[str] = None,
    ) -> List[NormalizedRecord]:
        """Convert synthetic dataframe to normalized records."""
        records: List[NormalizedRecord] = []
        for idx, row in df.iterrows():
            cid = str(row["cell_id"])
            t_ms = int(row.get("time_ms", 1700000000000 + idx * 1000))
            connected = int(row["connected_users"])
            rsrp = float(row["mean_rsrp_dbm"])
            sinr = float(row.get("mean_sinr_db", 15.0))
            dl_mbps = float(row.get("total_demand_mbps", 20.0))

            provenance = ProvenanceMetadata(
                dataset_id=self.dataset_id,
                source_reference="RANGUARD Synthetic Model (Offline Fallback)",
                license=LicenseType.PROPRIETARY_SYNTHETIC,
                attribution=f"RANGUARD Synthetic Mode (Seed: {self.seed})",
                is_synthetic=True,
                synthetic_seed=self.seed,
                experiment_id=f"synthetic_seed_{self.seed}",
                node_or_cell_id=cid,
                original_units={"throughput": "Mbps", "rsrp": "dBm", "sinr": "dB"},
            )

            records.append(
                NormalizedRecord(
                    record_id=f"synth_{cid}_{idx}_{t_ms}",
                    timestamp_ms=t_ms,
                    provenance=provenance,
                    category=MeasurementCategory.RADIO_TELEMETRY,
                    cell_id=cid,
                    connected_users_count=connected,
                    rsrp_dbm=rsrp,
                    sinr_db=sinr,
                    throughput_downlink_mbps=dl_mbps,
                )
            )
        return records
