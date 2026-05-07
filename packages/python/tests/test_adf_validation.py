from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from adfmd import parse_adf, validate_adf


ROOT = Path(__file__).parents[3]
INVALID_FIXTURES = ROOT / "fixtures" / "invalid" / "adf"


def test_validate_adf_reports_stable_errors_for_invalid_adf_fixtures() -> None:
    for fixture_dir in INVALID_FIXTURES.iterdir():
        input_adf = _read_json(fixture_dir / "input.adf.json")
        expected_errors = _read_json(fixture_dir / "expected.errors.json")

        result = validate_adf(input_adf)

        assert result.valid is False, fixture_dir.name
        assert result.errors == expected_errors


def test_parse_adf_can_skip_pinned_schema_validation_when_requested() -> None:
    input_adf = _read_json(
        INVALID_FIXTURES / "block-inside-paragraph" / "input.adf.json"
    )

    assert validate_adf(input_adf, {"validate_adf": False}).valid is True
    assert parse_adf(input_adf, {"validate_adf": False}) is input_adf


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))
