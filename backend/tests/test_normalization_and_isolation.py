"""Tests for Physical Normalization and Experiment Isolation Guardrails.

Verifies accurate unit conversions and enforces Requirement 8:
preventing cross-contamination of unrelated network experiments.
"""

import pytest
from app.datasets.normalizer import IncompatibleExperimentError, NormalizationEngine
from app.datasets.schemas import (
    DatasetID,
    LicenseType,
    MeasurementCategory,
    NormalizedRecord,
    ProvenanceMetadata,
)


def test_unit_conversions():
    """Verify bitrates, power, and ratio conversions."""
    assert NormalizationEngine.bps_to_mbps(10_000_000) == 10.0
    assert NormalizationEngine.bps_to_mbps(0) == 0.0
    assert NormalizationEngine.bps_to_mbps(None) is None

    assert NormalizationEngine.kbps_to_mbps(5_000) == 5.0
    assert NormalizationEngine.percentage_to_ratio(50.0) == 0.5
    assert NormalizationEngine.percentage_to_ratio(120.0) == 1.0  # Clamped

    assert NormalizationEngine.mw_to_dbm(1.0) == 0.0
    assert NormalizationEngine.mw_to_dbm(10.0) == 10.0
    assert NormalizationEngine.dbm_to_mw(0.0) == 1.0


def test_slice_type_mapping():
    """Verify 3GPP slice identifier mapping."""
    assert NormalizationEngine.map_slice_id_to_type("0") == "eMBB"
    assert NormalizationEngine.map_slice_id_to_type(0) == "eMBB"
    assert NormalizationEngine.map_slice_id_to_type(0.0) == "eMBB"
    assert NormalizationEngine.map_slice_id_to_type("1") == "URLLC"
    assert NormalizationEngine.map_slice_id_to_type(1) == "URLLC"
    assert NormalizationEngine.map_slice_id_to_type("2") == "MTC"
    assert NormalizationEngine.map_slice_id_to_type(2.0) == "MTC"
    assert NormalizationEngine.map_slice_id_to_type("embb") == "eMBB"
    assert NormalizationEngine.map_slice_id_to_type("custom_99") == "Slice-custom_99"


def test_experiment_isolation_homogeneous_batch():
    """Verify that a batch from the same experiment passes isolation validation."""
    prov = ProvenanceMetadata(
        dataset_id=DatasetID.COLORAN,
        source_reference="wineslab",
        license=LicenseType.GPL_3_0,
        attribution="Polese",
        experiment_id="rome_exp1",
    )
    rec1 = NormalizedRecord(
        record_id="r1", timestamp_ms=1000, provenance=prov, category=MeasurementCategory.RADIO_TELEMETRY
    )
    rec2 = NormalizedRecord(
        record_id="r2", timestamp_ms=2000, provenance=prov, category=MeasurementCategory.RADIO_TELEMETRY
    )

    # Should not raise
    NormalizationEngine.verify_experiment_isolation([rec1, rec2])


def test_experiment_isolation_cross_dataset_violation():
    """Enforce Requirement 8: mixing records from different datasets raises IncompatibleExperimentError."""
    prov_coloran = ProvenanceMetadata(
        dataset_id=DatasetID.COLORAN,
        source_reference="wineslab",
        license=LicenseType.GPL_3_0,
        attribution="Polese",
        experiment_id="rome_exp1",
    )
    prov_milan = ProvenanceMetadata(
        dataset_id=DatasetID.TELECOM_ITALIA_MILAN,
        source_reference="harvard",
        license=LicenseType.ODBL_1_0,
        attribution="Barlacchi",
        experiment_id="milan_cdr",
    )

    rec_coloran = NormalizedRecord(
        record_id="r1", timestamp_ms=1000, provenance=prov_coloran, category=MeasurementCategory.RADIO_TELEMETRY
    )
    rec_milan = NormalizedRecord(
        record_id="r2", timestamp_ms=1000, provenance=prov_milan, category=MeasurementCategory.SPATIAL_TRAFFIC_CDR
    )

    with pytest.raises(IncompatibleExperimentError) as exc_info:
        NormalizationEngine.verify_experiment_isolation([rec_coloran, rec_milan])

    assert "Experiment isolation violation" in str(exc_info.value)
    assert "coloran" in str(exc_info.value)
    assert "telecom_italia_milan" in str(exc_info.value)


def test_experiment_isolation_cross_experiment_violation():
    """Enforce Requirement 8: mixing different experiments from same dataset raises error."""
    prov1 = ProvenanceMetadata(
        dataset_id=DatasetID.COLORAN,
        source_reference="wineslab",
        license=LicenseType.GPL_3_0,
        attribution="Polese",
        experiment_id="rome_exp1",
    )
    prov2 = ProvenanceMetadata(
        dataset_id=DatasetID.COLORAN,
        source_reference="wineslab",
        license=LicenseType.GPL_3_0,
        attribution="Polese",
        experiment_id="rome_exp2",  # Different experiment run
    )

    rec1 = NormalizedRecord(record_id="r1", timestamp_ms=1000, provenance=prov1, category=MeasurementCategory.RADIO_TELEMETRY)
    rec2 = NormalizedRecord(record_id="r2", timestamp_ms=1000, provenance=prov2, category=MeasurementCategory.RADIO_TELEMETRY)

    with pytest.raises(IncompatibleExperimentError) as exc_info:
        NormalizationEngine.verify_experiment_isolation([rec1, rec2])

    assert "Attempted to mix multiple distinct experiments" in str(exc_info.value)
