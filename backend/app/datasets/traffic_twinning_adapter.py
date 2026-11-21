"""Open RAN Commercial Traffic Twinning Dataset Adapter.

Handles ingestion, validation, and physical normalization for the
Open RAN Commercial Traffic Twinning dataset (WiNES Lab / OpenRAN Gym).
Licensed under Creative Commons Attribution-ShareAlike 4.0 (CC-BY-SA-4.0).
"""

from __future__ import annotations

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


class TrafficTwinningAdapter(DatasetAdapter):
    """Adapter for Open RAN Commercial Traffic Twinning dataset."""

    @property
    def dataset_id(self) -> DatasetID:
        return DatasetID.TRAFFIC_TWINNING

    def is_synthetic(self) -> bool:
        return False

    def get_metadata(self) -> DatasetMetadata:
        return DatasetMetadata(
            id=self.dataset_id,
            name="Open RAN Commercial Traffic Twinning Dataset",
            description=(
                "Replication of commercial cellular traffic traces from Madrid, Spain (at 816 MHz, 1835 MHz, "
                "and 2650 MHz carrier frequencies) within the Colosseum Open RAN digital twin emulator. "
                "Features 500+ hours of cross-layer PHY-, MAC-, and APP-layer Key Performance Measurements (KPMs) "
                "across 5 slicing PRB allocations and Round-Robin / Proportional Fair schedulers."
            ),
            primary_paper_citation=(
                "L. Bonati, R. Shirkhani, C. Fiandrino, S. Maxenti, S. D'Oro, M. Polese, T. Melodia, "
                "'Twinning Commercial Network Traces on Experimental Open RAN Platforms,' in Proceedings of "
                "ACM WiNTECH, Washington, DC, USA, November 2024."
            ),
            repository_url="https://github.com/wineslab/open-ran-commercial-traffic-twinning-dataset",
            doi=None,
            license=LicenseType.CC_BY_SA_4_0,
            attribution_requirement=(
                "Licensed under CC-BY-SA-4.0. Must cite Bonati et al., ACM WiNTECH 2024 and acknowledge "
                "O-RAN ALLIANCE, NSF grants CNS-1925601, CNS-2112471, CNS-2120447, and NTIA PWSCIF Award 25-60-IF011."
            ),
            access_restrictions=(
                "Full archive (>450 GB) is hosted on Northeastern Digital Repository Service (DRS: neu:h989sz017). "
                "Automated public scraping is restricted (HTTP 403 / institutional access). Small local representative "
                "experiment fixture provided for pipeline validation."
            ),
            file_formats=["CSV (.csv)", "MGEN Script (.mgn)", "Text Log (.log)"],
            available_columns={
                "enb_metrics": ["time", "nof_ue", "dl_brate", "ul_brate"],
                "ue_kpm": ["time", "cc", "pci", "earfcn", "rsrp", "pl", "cfo", "dl_mcs", "dl_snr", "dl_brate", "dl_bler"],
                "slice_kpm": [
                    "Timestamp", "num_ues", "IMSI", "RNTI", "slicing_enabled", "slice_id",
                    "slice_prb", "power_multiplier", "scheduling_policy", "tx_brate downlink [Mbps]",
                    "dl_cqi", "ul_sinr", "ul_rssi"
                ],
                "mgen_app": ["time", "seq", "src", "dst", "size", "latency_ms"],
            },
            total_download_size_bytes=483_183_820_800,  # ~450 GB
            sample_download_size_bytes=25_600,          # Representative fixture (~25 KB)
            is_available_locally=True,
            is_synthetic=False,
            notes="Emulates 1 BS serving 8 UEs (4 eMBB + 4 URLLC) with 5 distinct PRB split configurations.",
        )

    def load_raw(self, file_path: Path) -> pd.DataFrame:
        """Load traffic twinning CSV file without mutation."""
        if not file_path.exists():
            raise FileNotFoundError(f"Traffic Twinning file not found: {file_path}")
        return pd.read_csv(file_path)

    def validate(self, df: pd.DataFrame) -> ValidationResult:
        """Auto-detect traffic twinning schema and validate."""
        cols = set(df.columns)
        if "dl_brate" in cols and ("time" in cols or "Timestamp" in cols):
            return DataValidator.validate_traffic_twinning(df, file_type="enb")
        elif "rsrp" in cols and "dl_snr" in cols:
            return DataValidator.validate_traffic_twinning(df, file_type="ue")
        elif "slice_prb" in cols:
            return DataValidator.validate_traffic_twinning(df, file_type="slice")
        elif "seq" in cols and "latency_ms" in cols:
            return ValidationResult(
                is_valid=True,
                total_records=len(df),
                valid_count=len(df),
                invalid_count=0,
                errors=[],
                warnings=[],
            )
        return ValidationResult(
            is_valid=False,
            total_records=len(df),
            valid_count=0,
            invalid_count=len(df),
            errors=[f"Unrecognized Traffic Twinning columns: {list(df.columns)[:5]}"],
        )

    def normalize(
        self,
        df: pd.DataFrame,
        context: Optional[ExperimentContext] = None,
        source_file: Optional[str] = None,
    ) -> List[NormalizedRecord]:
        """Normalize Traffic Twinning records into standard units."""
        records: List[NormalizedRecord] = []
        cols = set(df.columns)
        exp_id = context.experiment_id if context else "cluster1_slicing1_sched0"
        fname = source_file or "traffic_twinning_sample.csv"

        if "dl_brate" in cols and "nof_ue" in cols:
            # Base Station aggregated metrics
            for idx, row in df.iterrows():
                t = int(row["time"]) if pd.notna(row["time"]) else 0
                connected = int(row["nof_ue"]) if pd.notna(row["nof_ue"]) else 0
                dl_mbps = NormalizationEngine.bps_to_mbps(row.get("dl_brate"))
                ul_mbps = NormalizationEngine.bps_to_mbps(row.get("ul_brate"))

                provenance = ProvenanceMetadata(
                    dataset_id=self.dataset_id,
                    source_reference="wineslab/open-ran-commercial-traffic-twinning-dataset",
                    license=LicenseType.CC_BY_SA_4_0,
                    attribution="Bonati et al., ACM WiNTECH 2024",
                    is_synthetic=False,
                    experiment_id=exp_id,
                    node_or_cell_id="gNB_madrid_twin",
                    original_file=fname,
                    original_units={"dl_brate": "bps", "ul_brate": "bps", "time": "ms_epoch"},
                )

                records.append(
                    NormalizedRecord(
                        record_id=f"twinning_enb_{idx}_{t}",
                        timestamp_ms=t,
                        provenance=provenance,
                        category=MeasurementCategory.RADIO_TELEMETRY,
                        cell_id=provenance.node_or_cell_id,
                        connected_users_count=connected,
                        throughput_downlink_mbps=dl_mbps,
                        throughput_uplink_mbps=ul_mbps,
                    )
                )

        elif "slice_prb" in cols or "tx_brate downlink [Mbps]" in cols:
            # Per-slice/UE KPMs
            for idx, row in df.iterrows():
                t = int(row.get("Timestamp", row.get("time", 0)))
                imsi = str(int(row["IMSI"])) if pd.notna(row.get("IMSI")) else None
                slice_raw = row.get("slice_id", 0)
                slice_type = NormalizationEngine.map_slice_id_to_type(slice_raw)
                prb = int(row["slice_prb"]) if pd.notna(row.get("slice_prb")) else None
                dl_mbps = float(row["tx_brate downlink [Mbps]"]) if pd.notna(row.get("tx_brate downlink [Mbps]")) else None
                sinr = float(row["ul_sinr"]) if pd.notna(row.get("ul_sinr")) else None
                cqi = float(row["dl_cqi"]) if pd.notna(row.get("dl_cqi")) else None

                provenance = ProvenanceMetadata(
                    dataset_id=self.dataset_id,
                    source_reference="wineslab/open-ran-commercial-traffic-twinning-dataset",
                    license=LicenseType.CC_BY_SA_4_0,
                    attribution="Bonati et al., ACM WiNTECH 2024",
                    is_synthetic=False,
                    experiment_id=exp_id,
                    ue_imsi_or_id=imsi,
                    original_file=fname,
                    original_units={"tx_brate": "Mbps", "ul_sinr": "dB", "slice_prb": "count"},
                )

                records.append(
                    NormalizedRecord(
                        record_id=f"twinning_slice_{idx}_{t}",
                        timestamp_ms=t,
                        provenance=provenance,
                        category=MeasurementCategory.SLICE_KPM,
                        ue_id=imsi,
                        slice_id=str(slice_raw),
                        slice_type=slice_type,
                        prb_allocated=prb,
                        throughput_downlink_mbps=dl_mbps,
                        sinr_db=sinr,
                        cqi=cqi,
                    )
                )

        elif "rsrp" in cols and "dl_snr" in cols:
            # UE-side metrics
            for idx, row in df.iterrows():
                t = int(row["time"]) if pd.notna(row["time"]) else 0
                rsrp = float(row["rsrp"]) if pd.notna(row["rsrp"]) else None
                snr = float(row["dl_snr"]) if pd.notna(row["dl_snr"]) else None
                dl_mbps = NormalizationEngine.bps_to_mbps(row.get("dl_brate"))
                bler = float(row["dl_bler"]) if pd.notna(row.get("dl_bler")) else None

                provenance = ProvenanceMetadata(
                    dataset_id=self.dataset_id,
                    source_reference="wineslab/open-ran-commercial-traffic-twinning-dataset",
                    license=LicenseType.CC_BY_SA_4_0,
                    attribution="Bonati et al., ACM WiNTECH 2024",
                    is_synthetic=False,
                    experiment_id=exp_id,
                    ue_imsi_or_id="ue_001010123456002",
                    original_file=fname,
                    original_units={"rsrp": "dBm", "dl_snr": "dB", "dl_brate": "bps"},
                )

                records.append(
                    NormalizedRecord(
                        record_id=f"twinning_ue_{idx}_{t}",
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

        return records
