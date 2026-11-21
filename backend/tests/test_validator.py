"""Tests for DataValidator physical boundary and schema checks."""

import pandas as pd
import pytest
from app.datasets.validator import DataValidator


def test_validator_missing_columns():
    """Verify detection of missing required columns."""
    df = pd.DataFrame({"colA": [1, 2]})
    ok, errs = DataValidator.validate_columns(df, ["colA", "colB"], "TestDS")
    assert not ok
    assert "missing required columns" in errs[0]


def test_validator_range_checks():
    """Verify numerical boundary and warning reporting."""
    s = pd.Series([10.0, -100.0, 50.0, 200.0])
    warns = DataValidator.check_numeric_range(s, "test_col", min_val=0.0, max_val=100.0)
    assert len(warns) == 2
    assert "below minimum 0.0" in warns[0]
    assert "above maximum 100.0" in warns[1]


def test_validator_milan_bounds():
    """Verify validation of Milan CDR data with invalid square IDs."""
    invalid_df = pd.DataFrame({
        "square_id": [0, 10001, 50],
        "time_interval": [1383260400000, 1383260400000, 1383260400000],
        "country_code": [39, 39, 39],
        "sms_in": [1.0, 2.0, 3.0],
        "sms_out": [1.0, 2.0, 3.0],
        "call_in": [1.0, 2.0, 3.0],
        "call_out": [1.0, 2.0, 3.0],
        "internet_traffic": [10.0, 20.0, 30.0],
    })
    res = DataValidator.validate_milan_cdr(invalid_df)
    assert res.invalid_count == 2
    assert res.valid_count == 1
