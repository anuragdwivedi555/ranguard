"""Integration tests for DatasetRegistry, Inventory, and Mode Management."""

from pathlib import Path
import pytest
from app.datasets.registry import DatasetRegistry, DatasetUnavailableError
from app.datasets.schemas import DatasetID, DatasetMode


def test_registry_registration(registry: DatasetRegistry):
    """Verify all four dataset adapters are registered and accessible."""
    adapters = registry.list_datasets()
    assert len(adapters) == 4
    ids = [a.id for a in adapters]
    assert DatasetID.COLORAN in ids
    assert DatasetID.TELECOM_ITALIA_MILAN in ids
    assert DatasetID.TRAFFIC_TWINNING in ids
    assert DatasetID.SYNTHETIC in ids


def test_registry_inventory_structure(registry: DatasetRegistry):
    """Verify inventory generation produces comprehensive documentation."""
    inv = registry.get_inventory()
    assert inv["datasets_count"] == 4
    assert "datasets" in inv

    coloran = inv["datasets"]["coloran"]
    assert coloran["license"] == "GPL-3.0"
    assert "Polese" in coloran["citation"]
    assert coloran["total_download_size_bytes"] > 1_000_000_000

    milan = inv["datasets"]["telecom_italia_milan"]
    assert milan["license"] == "ODbL-1.0"
    assert milan["doi"] == "10.7910/DVN/EGZHFV"
    assert milan["total_download_size_bytes"] > 10_000_000_000

    twinning = inv["datasets"]["traffic_twinning"]
    assert twinning["license"] == "CC-BY-SA-4.0"
    assert twinning["total_download_size_bytes"] > 400_000_000_000


def test_registry_real_mode_success(registry: DatasetRegistry):
    """Verify telemetry stream retrieval in REAL mode with actual records."""
    registry.set_mode(DatasetMode.REAL)
    records = registry.get_telemetry_stream(DatasetID.COLORAN, sample_file="bs1.csv")
    assert len(records) > 0
    assert not records[0].provenance.is_synthetic
    assert records[0].provenance.dataset_id == DatasetID.COLORAN


def test_registry_real_mode_no_silent_fallback(registry: DatasetRegistry, tmp_path: Path):
    """Enforce Requirement 11 & Constraints: In REAL mode, missing data raises DatasetUnavailableError."""
    # Point registry to an empty raw data dir
    empty_registry = DatasetRegistry(raw_data_dir=tmp_path / "empty_dir")
    empty_registry.set_mode(DatasetMode.REAL)

    with pytest.raises(DatasetUnavailableError) as exc_info:
        empty_registry.get_telemetry_stream(DatasetID.COLORAN)

    assert "In REAL mode, RANGUARD will NOT silently substitute synthetic data" in str(exc_info.value)


def test_registry_synthetic_mode_explicit(registry: DatasetRegistry):
    """Verify explicit synthetic mode operation."""
    registry.set_mode(DatasetMode.SYNTHETIC)
    assert registry.mode == DatasetMode.SYNTHETIC

    # Even if requesting COLORAN, in SYNTHETIC mode it returns synthetic records explicitly tagged
    records = registry.get_telemetry_stream(DatasetID.COLORAN)
    assert len(records) > 0
    assert records[0].provenance.is_synthetic is True
    assert records[0].provenance.dataset_id == DatasetID.SYNTHETIC
