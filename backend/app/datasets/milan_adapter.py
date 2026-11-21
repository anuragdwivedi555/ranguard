"""Harvard Telecom Italia Milan Dataset Adapter.

Handles ingestion, validation, spatial indexing, and traffic activity normalization
for the Telecom Italia Big Data Challenge dataset (Milan, Nov-Dec 2013).
Hosted on Harvard Dataverse under the Open Database License (ODbL 1.0).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import numpy as np
import pandas as pd

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
from .validator import DataValidator


class MilanAdapter(DatasetAdapter):
    """Adapter for Harvard Telecom Italia Milan Spatiotemporal Telecommunications Dataset."""

    EXPECTED_COLUMNS = [
        "square_id", "time_interval", "country_code",
        "sms_in", "sms_out", "call_in", "call_out", "internet_traffic"
    ]

    @property
    def dataset_id(self) -> DatasetID:
        return DatasetID.TELECOM_ITALIA_MILAN

    def is_synthetic(self) -> bool:
        return False

    def get_metadata(self) -> DatasetMetadata:
        return DatasetMetadata(
            id=self.dataset_id,
            name="Telecom Italia Milan Telecommunications Activity Dataset",
            description=(
                "Aggregated Call Detail Records (CDRs) over the metropolitan area of Milan, Italy. "
                "The city is divided into a 100x100 grid (10,000 spatial squares of ~235m x 235m). "
                "Tracks 10-minute activity levels for SMS, voice calls, and cellular Internet traffic."
            ),
            primary_paper_citation=(
                "G. Barlacchi, M. De Nadai, R. Larcher, A. Casella, C. Chitic, G. Torrisi, F. Antonelli, "
                "A. Vespignani, A. Pentland, B. Lepri, 'A multi-source dataset of urban life in the city "
                "of Milan and the Province of Trentino,' Scientific Data 2, Article 150055, 2015."
            ),
            repository_url="https://doi.org/10.7910/DVN/EGZHFV",
            doi="10.7910/DVN/EGZHFV",
            license=LicenseType.ODBL_1_0,
            attribution_requirement=(
                "Data is released under Open Database License (ODbL 1.0). "
                "Must attribute Telecom Italia Big Data Challenge 2014 and cite Barlacchi et al., Scientific Data 2015."
            ),
            access_restrictions=(
                "Automated public API downloads require completing Dataverse Guestbook ID 96 "
                "('Privacy risk assessment'). Governed by ODbL 1.0 terms."
            ),
            file_formats=["Tab-separated text (.txt / .tsv)"],
            available_columns={
                "cdr_activity": self.EXPECTED_COLUMNS,
            },
            total_download_size_bytes=20_805_443_584,  # ~19.38 GB across 62 daily logs
            sample_download_size_bytes=152_104,        # Local representative sample slice (~152 KB)
            is_available_locally=True,
            is_synthetic=False,
            notes="10-minute temporal intervals (600,000 ms). Missing values indicate 0 activity in that window.",
        )

    def load_raw(self, file_path: Path) -> pd.DataFrame:
        """Load Milan TSV file without headers into a labeled DataFrame."""
        if not file_path.exists():
            raise FileNotFoundError(f"Milan dataset file not found: {file_path}")
        df = pd.read_csv(
            file_path,
            sep=r"\s+",
            header=None,
            names=self.EXPECTED_COLUMNS,
            engine="python",
        )
        return df

    def validate(self, df: pd.DataFrame) -> ValidationResult:
        """Validate Milan CDR DataFrame structure and physical bounds."""
        return DataValidator.validate_milan_cdr(df)

    def normalize(
        self,
        df: pd.DataFrame,
        context: Optional[ExperimentContext] = None,
        source_file: Optional[str] = None,
    ) -> List[NormalizedRecord]:
        """Aggregate country-code breakdown per square and time window into normalized demand records."""
        records: List[NormalizedRecord] = []
        fname = source_file or "sample_sms-call-internet-mi-2013-11-01.txt"
        exp_id = context.experiment_id if context else "milan_nov_2013"

        # Group by square_id and time_interval to compute net demand per spatial cell
        # Fill NaN activity with 0.0
        work_df = df.copy()
        for col in ["sms_in", "sms_out", "call_in", "call_out", "internet_traffic"]:
            work_df[col] = work_df[col].fillna(0.0)

        # Calculate a combined traffic demand score:
        # Standard formulation combines internet volume + weighted voice/sms events
        work_df["total_activity"] = (
            work_df["internet_traffic"]
            + 0.5 * (work_df["call_in"] + work_df["call_out"])
            + 0.2 * (work_df["sms_in"] + work_df["sms_out"])
        )

        grouped = work_df.groupby(["square_id", "time_interval"], as_index=False).agg({
            "internet_traffic": "sum",
            "call_in": "sum",
            "call_out": "sum",
            "sms_in": "sum",
            "sms_out": "sum",
            "total_activity": "sum",
            "country_code": "count",  # Number of distinct country streams active
        })

        for idx, row in grouped.iterrows():
            sq_id = int(row["square_id"])
            t_ms = int(row["time_interval"])
            total_act = float(row["total_activity"])
            net_mbps_approx = round(float(row["internet_traffic"]) * 0.05, 4)

            # Spatial grid coordinates (100x100 grid)
            grid_x = float((sq_id - 1) % 100)
            grid_y = float((sq_id - 1) // 100)

            provenance = ProvenanceMetadata(
                dataset_id=self.dataset_id,
                source_reference="Harvard Dataverse: doi:10.7910/DVN/EGZHFV",
                license=LicenseType.ODBL_1_0,
                attribution="Telecom Italia / Barlacchi et al., Scientific Data 2015",
                is_synthetic=False,
                experiment_id=exp_id,
                node_or_cell_id=f"GRID_SQ_{sq_id:05d}",
                original_file=fname,
                original_units={
                    "internet_traffic": "cdr_index",
                    "time_interval": "ms_epoch_10min",
                    "calls": "cdr_events",
                    "sms": "cdr_events",
                },
            )

            records.append(
                NormalizedRecord(
                    record_id=f"milan_{sq_id}_{t_ms}",
                    timestamp_ms=t_ms,
                    provenance=provenance,
                    category=MeasurementCategory.SPATIAL_TRAFFIC_CDR,
                    cell_id=provenance.node_or_cell_id,
                    traffic_demand_index=round(total_act, 4),
                    throughput_downlink_mbps=net_mbps_approx,
                    spatial_grid_x=grid_x,
                    spatial_grid_y=grid_y,
                )
            )

        return records
