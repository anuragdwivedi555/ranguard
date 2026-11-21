"""Tests for Harvard Telecom Italia Milan Dataset Adapter using actual CDR records."""

from pathlib import Path
import pytest
from app.datasets.milan_adapter import MilanAdapter
from app.datasets.schemas import DatasetID, LicenseType, MeasurementCategory


def test_milan_metadata(milan_adapter: MilanAdapter):
    """Verify Milan dataset metadata, licensing, and citations."""
    meta = milan_adapter.get_metadata()
    assert meta.id == DatasetID.TELECOM_ITALIA_MILAN
    assert meta.license == LicenseType.ODBL_1_0
    assert meta.doi == "10.7910/DVN/EGZHFV"
    assert "Barlacchi" in meta.primary_paper_citation
    assert "Guestbook ID 96" in meta.access_restrictions
    assert not meta.is_synthetic


def test_milan_ingest_actual_records(milan_adapter: MilanAdapter, raw_data_dir: Path):
    """Test ingestion, aggregation, and spatial mapping of actual Milan CDR records."""
    sample_file = raw_data_dir / "telecom_italia_milan" / "sample_sms-call-internet-mi-2013-11-01.txt"
    assert sample_file.exists(), "Actual sample Milan file must exist"

    records, summary = milan_adapter.ingest(sample_file)

    assert summary.total_records_read > 2000
    assert summary.valid_records_count > 0
    assert summary.dataset_id == DatasetID.TELECOM_ITALIA_MILAN
    assert summary.validation_result.is_valid
    assert not summary.is_synthetic

    # Inspect first aggregated square record
    rec = records[0]
    assert rec.category == MeasurementCategory.SPATIAL_TRAFFIC_CDR
    assert rec.cell_id == "GRID_SQ_00001"
    assert rec.spatial_grid_x == 0.0  # (1 - 1) % 100
    assert rec.spatial_grid_y == 0.0  # (1 - 1) // 100
    assert rec.timestamp_ms == 1383260400000
    assert rec.traffic_demand_index is not None
    assert rec.traffic_demand_index >= 0.0

    # Provenance verification
    prov = rec.provenance
    assert prov.dataset_id == DatasetID.TELECOM_ITALIA_MILAN
    assert prov.license == LicenseType.ODBL_1_0
    assert not prov.is_synthetic
    assert "doi:10.7910/DVN/EGZHFV" in prov.source_reference
