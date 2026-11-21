"""Tests for Colosseum ColO-RAN Dataset Adapter using actual research records."""

from pathlib import Path
import pytest
from app.datasets.coloran_adapter import ColORANAdapter
from app.datasets.schemas import DatasetID, LicenseType, MeasurementCategory


def test_coloran_metadata(coloran_adapter: ColORANAdapter):
    """Verify ColO-RAN dataset metadata, licensing, and citations."""
    meta = coloran_adapter.get_metadata()
    assert meta.id == DatasetID.COLORAN
    assert meta.license == LicenseType.GPL_3_0
    assert "Polese" in meta.primary_paper_citation
    assert "wineslab/colosseum-oran-coloran-dataset" in meta.repository_url
    assert not meta.is_synthetic
    assert "base_station" in meta.available_columns
    assert "slice_kpm" in meta.available_columns


def test_coloran_ingest_bs_actual_records(coloran_adapter: ColORANAdapter, raw_data_dir: Path):
    """Test ingestion and physical normalization of actual ColO-RAN base station telemetry."""
    bs_file = raw_data_dir / "coloran" / "bs1.csv"
    assert bs_file.exists(), "Actual bs1.csv must exist in raw data"

    records, summary = coloran_adapter.ingest(bs_file)

    assert summary.total_records_read > 2000
    assert summary.valid_records_count == summary.total_records_read
    assert summary.dataset_id == DatasetID.COLORAN
    assert not summary.is_synthetic
    assert summary.validation_result.is_valid

    # Inspect first normalized record
    rec = records[0]
    assert rec.category == MeasurementCategory.RADIO_TELEMETRY
    assert rec.timestamp_ms == 1617070465976
    assert rec.cell_id == "bs1"
    assert rec.connected_users_count == 0
    assert rec.throughput_downlink_mbps == 0.0

    # Provenance verification
    prov = rec.provenance
    assert prov.dataset_id == DatasetID.COLORAN
    assert prov.license == LicenseType.GPL_3_0
    assert not prov.is_synthetic
    assert prov.original_file == "bs1.csv"
    assert prov.original_units.get("dl_brate") == "bps"


def test_coloran_ingest_ue_actual_records(coloran_adapter: ColORANAdapter, raw_data_dir: Path):
    """Test ingestion and physical normalization of actual ColO-RAN UE telemetry."""
    ue_file = raw_data_dir / "coloran" / "sample_ue1.csv"
    assert ue_file.exists(), "Actual sample_ue1.csv must exist in raw data"

    records, summary = coloran_adapter.ingest(ue_file)

    assert summary.total_records_read > 500
    assert summary.valid_records_count == summary.total_records_read
    assert summary.validation_result.is_valid

    # Check non-empty record
    attached_records = [r for r in records if r.rsrp_dbm is not None]
    assert len(attached_records) > 0
    first = attached_records[0]
    assert first.ue_id == "ue_0"
    assert first.provenance.license == LicenseType.GPL_3_0


def test_coloran_ingest_slice_actual_records(coloran_adapter: ColORANAdapter, raw_data_dir: Path):
    """Test ingestion of actual ColO-RAN slice KPM records."""
    slice_file = raw_data_dir / "coloran" / "sample_slice_1010123456002_metrics.csv"
    assert slice_file.exists(), "Actual slice metrics CSV must exist in raw data"

    records, summary = coloran_adapter.ingest(slice_file)

    assert summary.total_records_read > 400
    assert summary.valid_records_count == summary.total_records_read
    assert summary.validation_result.is_valid

    rec = records[0]
    assert rec.category == MeasurementCategory.SLICE_KPM
    assert rec.ue_id == "1010123456002"
    assert rec.slice_type == "MTC"  # slice_id = 2 is MTC in ColO-RAN
    assert rec.prb_allocated is not None
    assert rec.throughput_downlink_mbps is not None
    assert rec.sinr_db is not None
    assert rec.provenance.license == LicenseType.GPL_3_0
