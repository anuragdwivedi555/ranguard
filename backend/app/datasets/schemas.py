"""Schemas for RANGUARD Dataset Ingestion Architecture.

Defines standardized Pydantic models for dataset metadata, provenance tracking,
normalized measurements, and ingestion validation summaries.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field, field_validator


class DatasetID(str, Enum):
    """Identifier for integrated research datasets and synthetic source."""
    COLORAN = "coloran"
    TELECOM_ITALIA_MILAN = "telecom_italia_milan"
    TRAFFIC_TWINNING = "traffic_twinning"
    SYNTHETIC = "synthetic_generator"


class DatasetMode(str, Enum):
    """Explicit operational mode for the data engine."""
    REAL = "REAL"
    SYNTHETIC = "SYNTHETIC"


class LicenseType(str, Enum):
    """Software and data licenses applicable to ingested datasets."""
    GPL_3_0 = "GPL-3.0"
    ODBL_1_0 = "ODbL-1.0"
    CC_BY_SA_4_0 = "CC-BY-SA-4.0"
    PROPRIETARY_SYNTHETIC = "MIT-Synthetic-Generated"


class MeasurementCategory(str, Enum):
    """Category of radio or traffic measurement."""
    RADIO_TELEMETRY = "RADIO_TELEMETRY"      # UE/BS physical layer (RSRP, SNR, BLER)
    SLICE_KPM = "SLICE_KPM"                  # O-RAN slice metrics (PRB, buffer, bitrates)
    SPATIAL_TRAFFIC_CDR = "SPATIAL_TRAFFIC_CDR" # Aggregated CDR telecom activity
    APPLICATION_TRAFFIC = "APPLICATION_TRAFFIC" # MGEN or packet delivery metrics


class ExperimentContext(BaseModel):
    """Isolates dataset experiment boundaries to prevent mixing unrelated experiments."""
    dataset_id: DatasetID
    experiment_id: str
    scenario_name: str
    carrier_frequency_mhz: Optional[float] = None
    bandwidth_mhz: Optional[float] = 10.0
    total_prbs: Optional[int] = 50
    scheduling_policy: Optional[str] = None
    slice_configuration: Optional[str] = None

    def matches(self, other: ExperimentContext) -> bool:
        """Check if another context belongs to the exact same experiment."""
        return (
            self.dataset_id == other.dataset_id
            and self.experiment_id == other.experiment_id
            and self.scenario_name == other.scenario_name
        )


class ProvenanceMetadata(BaseModel):
    """Audit trail tracking the exact provenance and origin of every measurement record."""
    dataset_id: DatasetID
    source_reference: str
    license: LicenseType
    attribution: str
    is_synthetic: bool = False
    synthetic_seed: Optional[int] = None
    experiment_id: Optional[str] = None
    node_or_cell_id: Optional[str] = None
    ue_imsi_or_id: Optional[str] = None
    original_file: Optional[str] = None
    raw_record_hash: Optional[str] = None
    original_units: Dict[str, str] = Field(default_factory=dict)


class NormalizedRecord(BaseModel):
    """Normalized network telemetry record with standardized physical units.

    Units:
    - Throughput: Mbps (Megabits per second)
    - Signal power / RSRP / RSSI: dBm
    - SNR / SINR: dB
    - BLER: Ratio (0.0 to 1.0)
    - Traffic demand index: Normalized score (0.0 to 100.0) or active count
    - Timestamps: Unix epoch in milliseconds
    """
    record_id: str
    timestamp_ms: int
    provenance: ProvenanceMetadata
    category: MeasurementCategory
    cell_id: Optional[str] = None
    ue_id: Optional[str] = None

    # Radio Physical Layer Metrics (Normalized)
    rsrp_dbm: Optional[float] = None
    snr_db: Optional[float] = None
    sinr_db: Optional[float] = None
    cqi: Optional[float] = None
    bler_downlink: Optional[float] = None
    bler_uplink: Optional[float] = None

    # Throughput & Bitrates (Normalized to Mbps)
    throughput_downlink_mbps: Optional[float] = None
    throughput_uplink_mbps: Optional[float] = None

    # Traffic Demand & Resource Allocation
    traffic_demand_index: Optional[float] = None
    connected_users_count: Optional[int] = None
    prb_allocated: Optional[int] = None
    prb_requested: Optional[int] = None

    # Slicing Attributes
    slice_id: Optional[str] = None
    slice_type: Optional[str] = None  # eMBB, URLLC, MTC

    # Spatial Geometry (Grid Coordinates if applicable)
    spatial_grid_x: Optional[float] = None
    spatial_grid_y: Optional[float] = None

    @field_validator("bler_downlink", "bler_uplink")
    @classmethod
    def validate_bler(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not (0.0 <= v <= 1.0):
            # Clamp or allow warning in validator
            return max(0.0, min(1.0, v))
        return v


class ValidationResult(BaseModel):
    """Validation report for an ingested batch or record."""
    is_valid: bool
    total_records: int
    valid_count: int
    invalid_count: int
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class DatasetMetadata(BaseModel):
    """Comprehensive descriptive inventory and provenance metadata for a dataset."""
    id: DatasetID
    name: str
    description: str
    primary_paper_citation: str
    repository_url: str
    doi: Optional[str] = None
    license: LicenseType
    attribution_requirement: str
    access_restrictions: str
    file_formats: List[str]
    available_columns: Dict[str, List[str]]
    total_download_size_bytes: int
    sample_download_size_bytes: int
    is_available_locally: bool
    is_synthetic: bool = False
    notes: Optional[str] = None


class IngestionSummary(BaseModel):
    """Summary metrics emitted after an adapter completes an ingestion run."""
    dataset_id: DatasetID
    total_records_read: int
    valid_records_count: int
    invalid_records_count: int
    time_range_ms: Optional[Tuple[int, int]] = None
    is_synthetic: bool = False
    validation_result: ValidationResult
    source_files: List[str] = Field(default_factory=list)
