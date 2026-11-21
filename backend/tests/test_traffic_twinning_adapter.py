"""Tests for Open RAN Commercial Traffic Twinning Dataset Adapter."""

from pathlib import Path
import pytest
from app.datasets.traffic_twinning_adapter import TrafficTwinningAdapter
from app.datasets.schemas import DatasetID, LicenseType, MeasurementCategory


def test_traffic_twinning_metadata(traffic_twinning_adapter: TrafficTwinningAdapter):
    """Verify Commercial Traffic Twinning metadata and provenance."""
    meta = traffic_twinning_adapter.get_metadata()
    assert meta.id == DatasetID.TRAFFIC_TWINNING
    assert meta.license == LicenseType.CC_BY_SA_4_0
    assert "Bonati" in meta.primary_paper_citation
    assert "wineslab/open-ran-commercial-traffic-twinning-dataset" in meta.repository_url
    assert "DRS: neu:h989sz017" in meta.access_restrictions
    assert not meta.is_synthetic


def test_traffic_twinning_ingest_enb_fixture(traffic_twinning_adapter: TrafficTwinningAdapter, raw_data_dir: Path):
    """Test ingestion and normalization of base station metrics fixture."""
    enb_file = raw_data_dir / "traffic_twinning" / "sample_experiment" / "bs" / "enb_metrics.csv"
    assert enb_file.exists()

    records, summary = traffic_twinning_adapter.ingest(enb_file)

    assert summary.total_records_read == 5
    assert summary.valid_records_count == 5
    assert summary.dataset_id == DatasetID.TRAFFIC_TWINNING
    assert summary.validation_result.is_valid
    assert not summary.is_synthetic

    rec = records[0]
    assert rec.category == MeasurementCategory.RADIO_TELEMETRY
    assert rec.cell_id == "gNB_madrid_twin"
    assert rec.connected_users_count == 8
    assert rec.throughput_downlink_mbps == 24.5  # 24500000 bps -> 24.5 Mbps
    assert rec.provenance.license == LicenseType.CC_BY_SA_4_0


def test_traffic_twinning_ingest_slice_fixture(traffic_twinning_adapter: TrafficTwinningAdapter, raw_data_dir: Path):
    """Test ingestion of slice KPM metrics fixture."""
    slice_file = raw_data_dir / "traffic_twinning" / "sample_experiment" / "bs" / "1010123456002_metrics.csv"
    assert slice_file.exists()

    records, summary = traffic_twinning_adapter.ingest(slice_file)

    assert summary.valid_records_count == 5
    rec = records[0]
    assert rec.category == MeasurementCategory.SLICE_KPM
    assert rec.ue_id == "1010123456002"
    assert rec.slice_type == "eMBB"
    assert rec.prb_allocated == 30
    assert rec.throughput_downlink_mbps == 12.45
    assert rec.sinr_db == 18.2
    assert rec.provenance.license == LicenseType.CC_BY_SA_4_0
