"""Tests for Synthetic Network Data Generator.

Verifies reproducibility, explicit synthetic flagging (never hallucinating as real data),
and compatibility with RANGUARD 6-cell topology.
"""

import pytest
from app.datasets.schemas import DatasetID, LicenseType, MeasurementCategory
from app.datasets.synthetic_generator import SyntheticNetworkGenerator


def test_synthetic_generator_metadata(synthetic_generator: SyntheticNetworkGenerator):
    """Verify synthetic generator metadata explicitly declares synthetic nature."""
    meta = synthetic_generator.get_metadata()
    assert meta.id == DatasetID.SYNTHETIC
    assert meta.is_synthetic is True
    assert meta.license == LicenseType.PROPRIETARY_SYNTHETIC
    assert "Parametric synthetic" in meta.description
    assert "WARNING" in meta.notes


def test_synthetic_generator_records_flagging(synthetic_generator: SyntheticNetworkGenerator):
    """Ensure every record is explicitly flagged with is_synthetic=True and seed."""
    records = synthetic_generator.generate_cycles(num_cycles=3)
    assert len(records) == 3 * 6  # 3 cycles * 6 cells

    for r in records:
        assert r.provenance.is_synthetic is True
        assert r.provenance.synthetic_seed == 42
        assert r.provenance.license == LicenseType.PROPRIETARY_SYNTHETIC
        assert r.category == MeasurementCategory.RADIO_TELEMETRY
        assert r.cell_id in ["CELL_01", "CELL_02", "CELL_03", "CELL_04", "CELL_05", "CELL_06"]
        assert r.throughput_downlink_mbps > 0
        assert r.connected_users_count >= 1


def test_synthetic_generator_determinism():
    """Ensure identical random seeds produce byte-for-byte identical telemetry."""
    gen1 = SyntheticNetworkGenerator(seed=123)
    gen2 = SyntheticNetworkGenerator(seed=123)
    gen3 = SyntheticNetworkGenerator(seed=999)

    records1 = gen1.generate_cycles(num_cycles=4)
    records2 = gen2.generate_cycles(num_cycles=4)
    records3 = gen3.generate_cycles(num_cycles=4)

    assert [r.throughput_downlink_mbps for r in records1] == [r.throughput_downlink_mbps for r in records2]
    assert [r.throughput_downlink_mbps for r in records1] != [r.throughput_downlink_mbps for r in records3]
