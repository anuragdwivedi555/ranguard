"""Colosseum ColO-RAN Dataset Adapter.

Handles ingestion, schema validation, and physical unit normalization for the
Colosseum ColO-RAN research dataset (WiNES Lab, Northeastern University).
Licensed under GPL-3.0.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import pandas as pd

from .base import DatasetAdapter
from .normalizer import NormalizationEngine
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


class ColORANAdapter(DatasetAdapter):
    """Adapter for Colosseum ColO-RAN multi-slice network dataset."""

    @property
    def dataset_id(self) -> DatasetID:
        return DatasetID.COLORAN

    def is_synthetic(self) -> bool:
        return False

    def get_metadata(self) -> DatasetMetadata:
        return DatasetMetadata(
            id=self.dataset_id,
            name="Colosseum ColO-RAN Multi-Slice Dataset",
            description=(
                "Emulated multi-slice cellular network telemetry traces collected on the Colosseum wireless "
                "emulator using the SCOPE O-RAN framework. Models a Rome urban cellular deployment with 7 gNBs "
                "and 42 UEs across eMBB, URLLC, and MTC traffic slices under Round-Robin, Waterfilling, and "
                "Proportional Fair scheduling."
            ),
            primary_paper_citation=(
                "M. Polese, L. Bonati, S. D'Oro, S. Basagni, T. Melodia, "
                "'ColO-RAN: Developing Machine Learning-based xApps for Open RAN Closed-loop Control on "
                "Programmable Experimental Platforms,' IEEE Transactions on Mobile Computing, July 2022."
            ),
            repository_url="https://github.com/wineslab/colosseum-oran-coloran-dataset",
            doi=None,
            license=LicenseType.GPL_3_0,
            attribution_requirement=(
                "Must cite Polese et al., IEEE TMC 2022 and acknowledge NSF Grants CNS-1923789, CNS-1925601, "
                "CNS-2120447, CNS-2112471, and ONR Grant N00014-20-1-2132."
            ),
            access_restrictions="Public open access via GitHub repository under GNU General Public License v3.0.",
            file_formats=["CSV (.csv)"],
            available_columns={
                "base_station": ["time", "nof_ue", "dl_brate", "ul_brate"],
                "user_equipment": [
                    "time", "cc", "pci", "earfcn", "rsrp", "pl", "cfo", "dl_mcs", "dl_snr",
                    "dl_turbo", "dl_brate", "dl_bler", "ul_ta", "ul_mcs", "ul_buff", "ul_brate",
                    "ul_bler", "rf_o", "rf_u", "rf_l", "is_attached"
                ],
                "slice_kpm": [
                    "Timestamp", "num_ues", "IMSI", "RNTI", "slicing_enabled", "slice_id",
                    "slice_prb", "power_multiplier", "scheduling_policy", "dl_mcs", "dl_n_samples",
                    "dl_buffer [bytes]", "tx_brate downlink [Mbps]", "tx_pkts downlink",
                    "tx_errors downlink (%)", "dl_cqi", "ul_mcs", "ul_n_samples", "ul_buffer [bytes]",
                    "rx_brate uplink [Mbps]", "rx_pkts uplink", "rx_errors uplink (%)", "ul_rssi", "ul_sinr"
                ],
            },
            total_download_size_bytes=1_485_716_480,  # ~1.45 GB
            sample_download_size_bytes=193_411,       # Local representative sample subset (~193 KB)
            is_available_locally=True,
            is_synthetic=False,
            notes="Sub-second granularity (typically 250 ms) telemetry for dense urban 7-cell layout.",
        )

    def load_raw(self, file_path: Path) -> pd.DataFrame:
        """Load ColO-RAN CSV without mutation."""
        if not file_path.exists():
            raise FileNotFoundError(f"ColO-RAN file not found: {file_path}")
        return pd.read_csv(file_path)

    def validate(self, df: pd.DataFrame) -> ValidationResult:
        """Auto-detect file schema and validate contents."""
        cols = set(df.columns)
        if "dl_brate" in cols and "nof_ue" in cols:
            return DataValidator.validate_coloran_bs(df)
        elif "rsrp" in cols and "dl_snr" in cols:
            return DataValidator.validate_coloran_ue(df)
        elif "slice_prb" in cols or "tx_brate downlink [Mbps]" in cols:
            return DataValidator.validate_coloran_slice(df)
        else:
            return ValidationResult(
                is_valid=False,
                total_records=len(df),
                valid_count=0,
                invalid_count=len(df),
                errors=[f"Unrecognized ColO-RAN CSV schema with columns: {list(df.columns)[:5]}"],
            )

    def normalize(
        self,
        df: pd.DataFrame,
        context: Optional[ExperimentContext] = None,
        source_file: Optional[str] = None,
    ) -> List[NormalizedRecord]:
        """Normalize ColO-RAN records to standard physical units with provenance preserved."""
        records: List[NormalizedRecord] = []
        cols = set(df.columns)
        exp_id = context.experiment_id if context else "sched0_tr0_exp1"
        fname = source_file or "unknown_file.csv"

        if "dl_brate" in cols and "nof_ue" in cols:
            # Base Station Metrics (bitrates in bps -> convert to Mbps)
            for idx, row in df.iterrows():
                t = int(row["time"]) if pd.notna(row["time"]) else 0
                connected = int(row["nof_ue"]) if pd.notna(row["nof_ue"]) else 0
                dl_mbps = NormalizationEngine.bps_to_mbps(row.get("dl_brate"))
                ul_mbps = NormalizationEngine.bps_to_mbps(row.get("ul_brate"))

                provenance = ProvenanceMetadata(
                    dataset_id=self.dataset_id,
                    source_reference="wineslab/colosseum-oran-coloran-dataset",
                    license=LicenseType.GPL_3_0,
                    attribution="Polese et al., IEEE TMC 2022",
                    is_synthetic=False,
                    experiment_id=exp_id,
                    node_or_cell_id=context.scenario_name if context else "bs1",
                    original_file=fname,
                    original_units={"dl_brate": "bps", "ul_brate": "bps", "time": "ms_epoch"},
                )

                records.append(
                    NormalizedRecord(
                        record_id=f"coloran_bs_{idx}_{t}",
                        timestamp_ms=t,
                        provenance=provenance,
                        category=MeasurementCategory.RADIO_TELEMETRY,
                        cell_id=provenance.node_or_cell_id,
                        connected_users_count=connected,
                        throughput_downlink_mbps=dl_mbps,
                        throughput_uplink_mbps=ul_mbps,
                    )
                )

        elif "rsrp" in cols and "dl_snr" in cols:
            # User Equipment Metrics
            for idx, row in df.iterrows():
                t = int(row["time"]) if pd.notna(row["time"]) else 0
                rsrp = float(row["rsrp"]) if pd.notna(row["rsrp"]) else None
                snr = float(row["dl_snr"]) if pd.notna(row["dl_snr"]) else None
                dl_mbps = NormalizationEngine.bps_to_mbps(row.get("dl_brate"))
                bler = float(row["dl_bler"]) if pd.notna(row.get("dl_bler")) else None

                provenance = ProvenanceMetadata(
                    dataset_id=self.dataset_id,
                    source_reference="wineslab/colosseum-oran-coloran-dataset",
                    license=LicenseType.GPL_3_0,
                    attribution="Polese et al., IEEE TMC 2022",
                    is_synthetic=False,
                    experiment_id=exp_id,
                    ue_imsi_or_id=f"ue_{idx}",
                    original_file=fname,
                    original_units={"rsrp": "dBm", "dl_snr": "dB", "dl_brate": "bps", "dl_bler": "ratio"},
                )

                records.append(
                    NormalizedRecord(
                        record_id=f"coloran_ue_{idx}_{t}",
                        timestamp_ms=t,
                        provenance=provenance,
                        category=MeasurementCategory.RADIO_TELEMETRY,
                        ue_id=provenance.ue_imsi_or_id,
                        rsrp_dbm=rsrp,
                        snr_db=snr,
                        throughput_downlink_mbps=dl_mbps,
                        bler_downlink=bler,
                    )
                )

        elif "slice_prb" in cols or "tx_brate downlink [Mbps]" in cols:
            # Slice KPM Metrics
            for idx, row in df.iterrows():
                t = int(row["Timestamp"]) if pd.notna(row["Timestamp"]) else 0
                imsi = str(int(row["IMSI"])) if pd.notna(row.get("IMSI")) else None
                slice_raw = row.get("slice_id", 0)
                slice_type = NormalizationEngine.map_slice_id_to_type(slice_raw)
                prb = int(row["slice_prb"]) if pd.notna(row.get("slice_prb")) else None
                dl_mbps = float(row["tx_brate downlink [Mbps]"]) if pd.notna(row.get("tx_brate downlink [Mbps]")) else None
                ul_mbps = float(row["rx_brate uplink [Mbps]"]) if pd.notna(row.get("rx_brate uplink [Mbps]")) else None
                sinr = float(row["ul_sinr"]) if pd.notna(row.get("ul_sinr")) else None
                cqi = float(row["dl_cqi"]) if pd.notna(row.get("dl_cqi")) else None
                bler_pct = float(row["tx_errors downlink (%)"]) if pd.notna(row.get("tx_errors downlink (%)")) else None

                provenance = ProvenanceMetadata(
                    dataset_id=self.dataset_id,
                    source_reference="wineslab/colosseum-oran-coloran-dataset",
                    license=LicenseType.GPL_3_0,
                    attribution="Polese et al., IEEE TMC 2022",
                    is_synthetic=False,
                    experiment_id=exp_id,
                    ue_imsi_or_id=imsi,
                    original_file=fname,
                    original_units={
                        "tx_brate": "Mbps", "rx_brate": "Mbps", "ul_sinr": "dB",
                        "tx_errors": "percentage", "slice_prb": "count"
                    },
                )

                records.append(
                    NormalizedRecord(
                        record_id=f"coloran_slice_{idx}_{t}",
                        timestamp_ms=t,
                        provenance=provenance,
                        category=MeasurementCategory.SLICE_KPM,
                        ue_id=imsi,
                        slice_id=str(slice_raw),
                        slice_type=slice_type,
                        prb_allocated=prb,
                        throughput_downlink_mbps=dl_mbps,
                        throughput_uplink_mbps=ul_mbps,
                        sinr_db=sinr,
                        cqi=cqi,
                        bler_downlink=NormalizationEngine.percentage_to_ratio(bler_pct),
                    )
                )

        return records
