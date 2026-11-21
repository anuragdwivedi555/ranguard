"""Dataset Registry and Orchestrator for RANGUARD.

Provides unified management of dataset adapters, inventory inspection,
and mode switching (REAL vs. SYNTHETIC) with strict provenance enforcement.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from .base import DatasetAdapter
from .coloran_adapter import ColORANAdapter
from .milan_adapter import MilanAdapter
from .normalizer import IncompatibleExperimentError, NormalizationEngine
from .schemas import (
    DatasetID,
    DatasetMetadata,
    DatasetMode,
    ExperimentContext,
    IngestionSummary,
    NormalizedRecord,
)
from .synthetic_generator import SyntheticNetworkGenerator
from .traffic_twinning_adapter import TrafficTwinningAdapter

logger = logging.getLogger("ranguard.datasets.registry")


class DatasetUnavailableError(RuntimeError):
    """Raised when an empirical dataset is requested but raw files are unavailable on disk."""
    pass


class DatasetRegistry:
    """Central registry and lifecycle manager for all RANGUARD network dataset adapters."""

    def __init__(self, raw_data_dir: Optional[Union[str, Path]] = None) -> None:
        self.raw_data_dir = Path(raw_data_dir) if raw_data_dir else Path("data/raw")
        self._adapters: Dict[DatasetID, DatasetAdapter] = {}
        self._mode: DatasetMode = DatasetMode.REAL

        # Register default adapters
        self.register_adapter(ColORANAdapter(data_dir=self.raw_data_dir / "coloran"))
        self.register_adapter(MilanAdapter(data_dir=self.raw_data_dir / "telecom_italia_milan"))
        self.register_adapter(TrafficTwinningAdapter(data_dir=self.raw_data_dir / "traffic_twinning"))
        self.register_adapter(SyntheticNetworkGenerator(seed=42))

    @property
    def mode(self) -> DatasetMode:
        """Current dataset operational mode."""
        return self._mode

    def set_mode(self, mode: Union[DatasetMode, str]) -> None:
        """Set dataset operational mode (REAL or SYNTHETIC)."""
        if isinstance(mode, str):
            mode = DatasetMode(mode.upper())
        self._mode = mode
        logger.info(f"RANGUARD Dataset Engine mode set to: {self._mode.value}")

    def register_adapter(self, adapter: DatasetAdapter) -> None:
        """Register a dataset adapter instance."""
        self._adapters[adapter.dataset_id] = adapter

    def get_adapter(self, dataset_id: DatasetID) -> DatasetAdapter:
        """Retrieve adapter by DatasetID."""
        if dataset_id not in self._adapters:
            raise KeyError(f"No adapter registered for dataset: {dataset_id}")
        return self._adapters[dataset_id]

    def list_datasets(self) -> List[DatasetMetadata]:
        """List metadata for all registered datasets."""
        metadata_list = []
        for d_id, adapter in self._adapters.items():
            meta = adapter.get_metadata()
            # Update is_available_locally based on data_dir existence
            if adapter.data_dir and adapter.data_dir.exists():
                files = list(adapter.data_dir.glob("*"))
                meta.is_available_locally = len(files) > 0
            metadata_list.append(meta)
        return metadata_list

    def get_inventory(self) -> Dict[str, Any]:
        """Generate structured dataset inventory report."""
        inventory: Dict[str, Any] = {
            "mode": self._mode.value,
            "raw_data_directory": str(self.raw_data_dir.resolve()),
            "datasets_count": len(self._adapters),
            "datasets": {},
        }

        for d_id, adapter in self._adapters.items():
            meta = adapter.get_metadata()
            local_files = []
            if adapter.data_dir and adapter.data_dir.exists():
                local_files = [f.name for f in adapter.data_dir.glob("**/*") if f.is_file()]

            inventory["datasets"][d_id.value] = {
                "name": meta.name,
                "is_synthetic": meta.is_synthetic,
                "license": meta.license.value,
                "citation": meta.primary_paper_citation,
                "repository_url": meta.repository_url,
                "doi": meta.doi,
                "access_restrictions": meta.access_restrictions,
                "attribution_requirement": meta.attribution_requirement,
                "file_formats": meta.file_formats,
                "available_columns": meta.available_columns,
                "total_download_size_bytes": meta.total_download_size_bytes,
                "sample_download_size_bytes": meta.sample_download_size_bytes,
                "is_available_locally": len(local_files) > 0 or meta.is_synthetic,
                "local_sample_files": local_files[:10],
            }

        return inventory

    def get_telemetry_stream(
        self,
        dataset_id: DatasetID,
        sample_file: Optional[str] = None,
        context: Optional[ExperimentContext] = None,
    ) -> List[NormalizedRecord]:
        """Fetch normalized telemetry records honoring current mode.

        In REAL mode: raises DatasetUnavailableError if raw records are not found.
        In SYNTHETIC mode: generates synthetic records explicitly tagged is_synthetic=True.
        NEVER silently substitutes synthetic data when REAL mode is requested.
        """
        if self._mode == DatasetMode.SYNTHETIC or dataset_id == DatasetID.SYNTHETIC:
            gen: SyntheticNetworkGenerator = self.get_adapter(DatasetID.SYNTHETIC)  # type: ignore
            logger.warning(
                "RANGUARD operating in SYNTHETIC mode: Returning artificially generated network traces."
            )
            return gen.generate_cycles(num_cycles=10)

        # REAL mode execution
        adapter = self.get_adapter(dataset_id)
        if not adapter.data_dir or not adapter.data_dir.exists():
            raise DatasetUnavailableError(
                f"Empirical dataset '{dataset_id.value}' directory not found at {adapter.data_dir}. "
                "In REAL mode, RANGUARD will NOT silently substitute synthetic data. "
                "Download representative raw data or explicitly switch to SYNTHETIC mode."
            )

        target_file: Optional[Path] = None
        if sample_file:
            cand = adapter.data_dir / sample_file
            if cand.exists():
                target_file = cand

        if not target_file:
            # Pick first available data file
            files = [f for f in adapter.data_dir.glob("**/*") if f.is_file() and not f.name.endswith(".md") and not f.name.endswith(".json")]
            if files:
                target_file = files[0]

        if not target_file or not target_file.exists():
            raise DatasetUnavailableError(
                f"No valid data files found in {adapter.data_dir} for empirical dataset '{dataset_id.value}'. "
                "Silent synthetic fallback is disabled."
            )

        records, summary = adapter.ingest(target_file, context=context)
        return records
