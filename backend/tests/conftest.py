"""Pytest configuration and shared fixtures for RANGUARD dataset tests."""

from pathlib import Path
import pytest

from app.datasets.coloran_adapter import ColORANAdapter
from app.datasets.milan_adapter import MilanAdapter
from app.datasets.registry import DatasetRegistry
from app.datasets.synthetic_generator import SyntheticNetworkGenerator
from app.datasets.traffic_twinning_adapter import TrafficTwinningAdapter


@pytest.fixture(scope="session")
def project_root() -> Path:
    # Resolves to repo root (where data/ and backend/ live)
    current = Path(__file__).resolve()
    for parent in [current.parent.parent.parent, current.parent.parent]:
        if (parent / "data" / "raw").exists():
            return parent
    return Path(__file__).resolve().parent.parent.parent


@pytest.fixture(scope="session")
def raw_data_dir(project_root: Path) -> Path:
    return project_root / "data" / "raw"


@pytest.fixture
def registry(raw_data_dir: Path) -> DatasetRegistry:
    return DatasetRegistry(raw_data_dir=raw_data_dir)


@pytest.fixture
def coloran_adapter(raw_data_dir: Path) -> ColORANAdapter:
    return ColORANAdapter(data_dir=raw_data_dir / "coloran")


@pytest.fixture
def milan_adapter(raw_data_dir: Path) -> MilanAdapter:
    return MilanAdapter(data_dir=raw_data_dir / "telecom_italia_milan")


@pytest.fixture
def traffic_twinning_adapter(raw_data_dir: Path) -> TrafficTwinningAdapter:
    return TrafficTwinningAdapter(data_dir=raw_data_dir / "traffic_twinning")


@pytest.fixture
def synthetic_generator() -> SyntheticNetworkGenerator:
    return SyntheticNetworkGenerator(seed=42, num_cells=6, num_users=100)
