"""RANGUARD Dataset Ingestion Architecture Package.

Provides modular adapters, schema validation, physical normalization,
provenance preservation, and transparent synthetic operation for cellular network controllers.
"""

from .base import DatasetAdapter
from .coloran_adapter import ColORANAdapter
from .milan_adapter import MilanAdapter
from .normalizer import IncompatibleExperimentError, NormalizationEngine
from .registry import DatasetRegistry, DatasetUnavailableError
from .schemas import (
    DatasetID,
    DatasetMetadata,
    DatasetMode,
    ExperimentContext,
    IngestionSummary,
    LicenseType,
    MeasurementCategory,
    NormalizedRecord,
    ProvenanceMetadata,
    ValidationResult,
)
from .synthetic_generator import SyntheticNetworkGenerator
from .traffic_twinning_adapter import TrafficTwinningAdapter
from .validator import DataValidator

__all__ = [
    "DatasetAdapter",
    "ColORANAdapter",
    "MilanAdapter",
    "TrafficTwinningAdapter",
    "SyntheticNetworkGenerator",
    "DatasetRegistry",
    "DatasetUnavailableError",
    "NormalizationEngine",
    "IncompatibleExperimentError",
    "DataValidator",
    "DatasetID",
    "DatasetMode",
    "LicenseType",
    "MeasurementCategory",
    "NormalizedRecord",
    "ProvenanceMetadata",
    "ValidationResult",
    "DatasetMetadata",
    "IngestionSummary",
    "ExperimentContext",
]
