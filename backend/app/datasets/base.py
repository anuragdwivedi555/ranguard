"""Abstract base class and interface definition for RANGUARD Dataset Adapters.

Every research dataset adapter and synthetic generator implements this interface,
ensuring strict decoupling, typed schemas, and provenance preservation.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
import pandas as pd

from .schemas import (
    DatasetID,
    DatasetMetadata,
    ExperimentContext,
    IngestionSummary,
    NormalizedRecord,
    ValidationResult,
)


class DatasetAdapter(ABC):
    """Abstract base class for all RANGUARD dataset adapters."""

    def __init__(self, data_dir: Optional[Union[str, Path]] = None) -> None:
        self.data_dir = Path(data_dir) if data_dir else None

    @property
    @abstractmethod
    def dataset_id(self) -> DatasetID:
        """Unique dataset identifier."""
        pass

    @abstractmethod
    def get_metadata(self) -> DatasetMetadata:
        """Retrieve comprehensive dataset metadata and provenance documentation."""
        pass

    @abstractmethod
    def is_synthetic(self) -> bool:
        """Flag indicating if this adapter generates synthetic data rather than empirical traces."""
        pass

    @abstractmethod
    def load_raw(self, file_path: Path) -> pd.DataFrame:
        """Load raw dataset records from file into a DataFrame without alteration."""
        pass

    @abstractmethod
    def validate(self, df: pd.DataFrame) -> ValidationResult:
        """Validate raw DataFrame against expected columns, types, and value boundaries."""
        pass

    @abstractmethod
    def normalize(
        self,
        df: pd.DataFrame,
        context: Optional[ExperimentContext] = None,
        source_file: Optional[str] = None,
    ) -> List[NormalizedRecord]:
        """Transform validated raw records into normalized physical units with provenance attached."""
        pass

    def ingest(
        self,
        file_path: Path,
        context: Optional[ExperimentContext] = None,
    ) -> Tuple[List[NormalizedRecord], IngestionSummary]:
        """Convenience end-to-end pipeline: load -> validate -> normalize -> summarize."""
        df = self.load_raw(file_path)
        val_res = self.validate(df)
        records = self.normalize(df, context=context, source_file=file_path.name)

        time_range = None
        if records:
            timestamps = [r.timestamp_ms for r in records if r.timestamp_ms > 0]
            if timestamps:
                time_range = (min(timestamps), max(timestamps))

        summary = IngestionSummary(
            dataset_id=self.dataset_id,
            total_records_read=len(df),
            valid_records_count=len(records),
            invalid_records_count=val_res.invalid_count,
            time_range_ms=time_range,
            is_synthetic=self.is_synthetic(),
            validation_result=val_res,
            source_files=[str(file_path)],
        )
        return records, summary
