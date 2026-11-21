"""Validation engine for network dataset records and telemetry streams.

Ensures value boundaries, column requirements, and physical constraints are met,
catching corrupted records without silently inventing or altering values.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Set, Tuple
import pandas as pd
from .schemas import ValidationResult


class DataValidator:
    """Validates tabular network records against expected schemas and physical constraints."""

    @staticmethod
    def validate_columns(
        df: pd.DataFrame,
        required_columns: List[str],
        dataset_name: str = "Dataset",
    ) -> Tuple[bool, List[str]]:
        """Verify that all required columns exist in the DataFrame."""
        missing = [col for col in required_columns if col not in df.columns]
        if missing:
            return False, [f"{dataset_name} missing required columns: {missing}"]
        return True, []

    @staticmethod
    def check_numeric_range(
        series: pd.Series,
        col_name: str,
        min_val: Optional[float] = None,
        max_val: Optional[float] = None,
        allow_null: bool = True,
    ) -> List[str]:
        """Check whether numerical values fall within physically sensible ranges."""
        warnings: List[str] = []
        if series.empty:
            return warnings

        valid_vals = series.dropna()
        if not allow_null and len(valid_vals) < len(series):
            warnings.append(f"Column '{col_name}' contains {len(series) - len(valid_vals)} null values.")

        if valid_vals.empty:
            return warnings

        if min_val is not None:
            violating_min = valid_vals[valid_vals < min_val]
            if not violating_min.empty:
                warnings.append(
                    f"Column '{col_name}' has {len(violating_min)} values below minimum {min_val} (min seen: {violating_min.min():.2f})"
                )

        if max_val is not None:
            violating_max = valid_vals[valid_vals > max_val]
            if not violating_max.empty:
                warnings.append(
                    f"Column '{col_name}' has {len(violating_max)} values above maximum {max_val} (max seen: {violating_max.max():.2f})"
                )

        return warnings

    @classmethod
    def validate_coloran_bs(cls, df: pd.DataFrame) -> ValidationResult:
        """Validate ColO-RAN base station metrics dataframe."""
        required = ["time", "nof_ue", "dl_brate", "ul_brate"]
        ok, errs = cls.validate_columns(df, required, "ColO-RAN Base Station")
        if not ok:
            return ValidationResult(
                is_valid=False,
                total_records=len(df),
                valid_count=0,
                invalid_count=len(df),
                errors=errs,
            )

        warns: List[str] = []
        warns.extend(cls.check_numeric_range(df["time"], "time", min_val=0))
        warns.extend(cls.check_numeric_range(df["nof_ue"], "nof_ue", min_val=0, max_val=100))
        warns.extend(cls.check_numeric_range(df["dl_brate"], "dl_brate", min_val=0))
        warns.extend(cls.check_numeric_range(df["ul_brate"], "ul_brate", min_val=0))

        invalid_rows = df[df["time"] <= 0].index.tolist()
        return ValidationResult(
            is_valid=len(errs) == 0,
            total_records=len(df),
            valid_count=len(df) - len(invalid_rows),
            invalid_count=len(invalid_rows),
            errors=errs,
            warnings=warns,
        )

    @classmethod
    def validate_coloran_slice(cls, df: pd.DataFrame) -> ValidationResult:
        """Validate ColO-RAN slice metrics dataframe."""
        required = ["Timestamp", "IMSI", "slice_id", "slice_prb"]
        ok, errs = cls.validate_columns(df, required, "ColO-RAN Slice KPM")
        if not ok:
            return ValidationResult(
                is_valid=False,
                total_records=len(df),
                valid_count=0,
                invalid_count=len(df),
                errors=errs,
            )

        warns: List[str] = []
        warns.extend(cls.check_numeric_range(df["Timestamp"], "Timestamp", min_val=0))
        warns.extend(cls.check_numeric_range(df["slice_id"], "slice_id", min_val=0, max_val=10))
        warns.extend(cls.check_numeric_range(df["slice_prb"], "slice_prb", min_val=0, max_val=100))

        return ValidationResult(
            is_valid=True,
            total_records=len(df),
            valid_count=len(df),
            invalid_count=0,
            errors=[],
            warnings=warns,
        )

    @classmethod
    def validate_coloran_ue(cls, df: pd.DataFrame) -> ValidationResult:
        """Validate ColO-RAN UE metrics dataframe."""
        required = ["time", "rsrp", "dl_snr", "dl_brate"]
        ok, errs = cls.validate_columns(df, required, "ColO-RAN UE")
        if not ok:
            return ValidationResult(
                is_valid=False,
                total_records=len(df),
                valid_count=0,
                invalid_count=len(df),
                errors=errs,
            )

        warns: List[str] = []
        warns.extend(cls.check_numeric_range(df["rsrp"], "rsrp", min_val=-150.0, max_val=0.0))
        warns.extend(cls.check_numeric_range(df["dl_snr"], "dl_snr", min_val=-30.0, max_val=50.0))

        return ValidationResult(
            is_valid=True,
            total_records=len(df),
            valid_count=len(df),
            invalid_count=0,
            errors=[],
            warnings=warns,
        )

    @classmethod
    def validate_milan_cdr(cls, df: pd.DataFrame) -> ValidationResult:
        """Validate Harvard Telecom Italia Milan CDR dataframe."""
        expected_cols = [
            "square_id", "time_interval", "country_code",
            "sms_in", "sms_out", "call_in", "call_out", "internet_traffic"
        ]
        ok, errs = cls.validate_columns(df, expected_cols, "Telecom Italia Milan CDR")
        if not ok:
            return ValidationResult(
                is_valid=False,
                total_records=len(df),
                valid_count=0,
                invalid_count=len(df),
                errors=errs,
            )

        warns: List[str] = []
        warns.extend(cls.check_numeric_range(df["square_id"], "square_id", min_val=1, max_val=10000))
        warns.extend(cls.check_numeric_range(df["time_interval"], "time_interval", min_val=1380000000000))

        for activity_col in ["sms_in", "sms_out", "call_in", "call_out", "internet_traffic"]:
            warns.extend(cls.check_numeric_range(df[activity_col], activity_col, min_val=0.0))

        # Check for invalid square_ids
        invalid_rows = df[(df["square_id"] < 1) | (df["square_id"] > 10000)].index.tolist()
        return ValidationResult(
            is_valid=len(errs) == 0,
            total_records=len(df),
            valid_count=len(df) - len(invalid_rows),
            invalid_count=len(invalid_rows),
            errors=errs,
            warnings=warns,
        )

    @classmethod
    def validate_traffic_twinning(cls, df: pd.DataFrame, file_type: str = "enb") -> ValidationResult:
        """Validate Traffic Twinning files."""
        warns: List[str] = []
        errs: List[str] = []

        if file_type == "enb":
            required = ["time", "dl_brate", "ul_brate"]
            ok, errs = cls.validate_columns(df, required, "Traffic Twinning ENB")
            if not ok:
                return ValidationResult(
                    is_valid=False, total_records=len(df), valid_count=0, invalid_count=len(df), errors=errs
                )
            warns.extend(cls.check_numeric_range(df["dl_brate"], "dl_brate", min_val=0))
        elif file_type == "ue":
            required = ["time", "rsrp", "dl_snr"]
            ok, errs = cls.validate_columns(df, required, "Traffic Twinning UE")
            if not ok:
                return ValidationResult(
                    is_valid=False, total_records=len(df), valid_count=0, invalid_count=len(df), errors=errs
                )
        elif file_type == "slice":
            required = ["Timestamp", "IMSI", "slice_id", "slice_prb"]
            ok, errs = cls.validate_columns(df, required, "Traffic Twinning Slice")
            if not ok:
                return ValidationResult(
                    is_valid=False, total_records=len(df), valid_count=0, invalid_count=len(df), errors=errs
                )

        return ValidationResult(
            is_valid=len(errs) == 0,
            total_records=len(df),
            valid_count=len(df),
            invalid_count=0,
            errors=errs,
            warnings=warns,
        )
