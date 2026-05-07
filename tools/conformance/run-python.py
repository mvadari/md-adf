from __future__ import annotations

from dataclasses import asdict
import json
from pathlib import Path
import sys
from typing import Any


def main() -> int:
    """Run Python fixtures from the shared conformance manifest."""

    root = Path(__file__).parents[2]
    sys.path.insert(0, str(root / "packages" / "python" / "src"))

    from md_adf import adf_to_markdown, markdown_to_adf, validate_adf

    manifest = json.loads((root / "fixtures" / "manifest.json").read_text(encoding="utf-8"))

    summary: dict[str, Any] = {
        "language": "Python",
        "passed": 0,
        "failed": 0,
        "skipped": 0,
        "xfailed": 0,
        "failures": [],
    }

    for manifest_case in manifest["cases"]:
        case_path = root / "fixtures" / manifest_case["path"]
        case_dir = case_path.parent
        test_case = json.loads(case_path.read_text(encoding="utf-8"))

        if test_case.get("skip", {}).get("python"):
            summary["skipped"] += 1
            continue

        try:
            if test_case["direction"] == "adf-to-md":
                input_adf = json.loads((case_dir / "input.adf.json").read_text(encoding="utf-8"))
                expected_markdown = (case_dir / "expected.md").read_text(encoding="utf-8")
                expected_diagnostics = json.loads(
                    (case_dir / "expected.diagnostics.json").read_text(encoding="utf-8")
                )

                markdown_result = adf_to_markdown(input_adf, test_case.get("options"))
                actual_diagnostics = [
                    _diagnostic_to_json(diagnostic) for diagnostic in markdown_result.diagnostics
                ]

                _assert_markdown_equal(markdown_result.value, expected_markdown, test_case["id"])
                _assert_diagnostics_equal(actual_diagnostics, expected_diagnostics, test_case["id"])
            elif test_case["direction"] == "md-to-adf":
                input_markdown = (case_dir / "input.md").read_text(encoding="utf-8")
                expected_adf = json.loads(
                    (case_dir / "expected.adf.json").read_text(encoding="utf-8")
                )
                expected_diagnostics = json.loads(
                    (case_dir / "expected.diagnostics.json").read_text(encoding="utf-8")
                )

                adf_result = markdown_to_adf(input_markdown, test_case.get("options"))
                actual_diagnostics = [
                    _diagnostic_to_json(diagnostic) for diagnostic in adf_result.diagnostics
                ]

                _assert_valid_adf(adf_result.value, test_case["id"], validate_adf)
                _assert_adf_equal(adf_result.value, expected_adf, test_case["id"])
                _assert_diagnostics_equal(actual_diagnostics, expected_diagnostics, test_case["id"])
            elif test_case["direction"] == "roundtrip":
                input_adf = json.loads((case_dir / "input.adf.json").read_text(encoding="utf-8"))
                expected_adf = json.loads(
                    (case_dir / "expected.normalized.adf.json").read_text(encoding="utf-8")
                )
                expected_diagnostics_path = case_dir / "expected.diagnostics.json"
                expected_markdown_diagnostics = (
                    json.loads(expected_diagnostics_path.read_text(encoding="utf-8"))
                    if expected_diagnostics_path.exists()
                    else []
                )

                markdown = adf_to_markdown(input_adf, test_case.get("options"))
                _assert_diagnostics_equal(
                    [_diagnostic_to_json(diagnostic) for diagnostic in markdown.diagnostics],
                    expected_markdown_diagnostics,
                    f"{test_case['id']} adf-to-md",
                )
                adf = markdown_to_adf(markdown.value, test_case.get("options"))
                _assert_diagnostics_equal(
                    [_diagnostic_to_json(diagnostic) for diagnostic in adf.diagnostics],
                    [],
                    f"{test_case['id']} md-to-adf",
                )
                _assert_valid_adf(adf.value, f"{test_case['id']} roundtrip", validate_adf)
                _assert_adf_equal(adf.value, expected_adf, test_case["id"])
            else:
                raise AssertionError(f"Unknown direction {test_case['direction']}")

            if test_case.get("xfail", {}).get("python"):
                raise AssertionError("Fixture unexpectedly passed despite python xfail metadata.")
            summary["passed"] += 1
        except AssertionError as exc:
            if test_case.get("xfail", {}).get("python"):
                summary["xfailed"] += 1
                continue
            summary["failed"] += 1
            summary["failures"].append({"id": test_case["id"], "message": str(exc)})

    if "--json" in sys.argv:
        print(json.dumps(summary))
    else:
        print(
            "Python conformance: "
            f"{summary['passed']} passed, {summary['failed']} failed, "
            f"{summary['skipped']} skipped, {summary['xfailed']} xfail."
        )
        for failure in summary["failures"]:
            print(f"FAIL {failure['id']}: {failure['message']}", file=sys.stderr)
    return 1 if summary["failed"] else 0


def _assert_markdown_equal(actual: str, expected: str, test_id: str) -> None:
    """Assert Markdown strings match after newline normalization."""

    normalized_actual = _normalize_markdown(actual)
    normalized_expected = _normalize_markdown(expected)
    if normalized_actual != normalized_expected:
        raise AssertionError(
            f"{test_id} markdown mismatch:\n"
            f"expected: {normalized_expected!r}\n"
            f"actual:   {normalized_actual!r}"
        )


def _assert_adf_equal(actual: Any, expected: Any, test_id: str) -> None:
    """Assert ADF values match after normalization."""

    normalized_actual = _normalize_adf(actual)
    normalized_expected = _normalize_adf(expected)
    if normalized_actual != normalized_expected:
        raise AssertionError(
            f"{test_id} ADF mismatch:\n"
            f"expected: {normalized_expected!r}\n"
            f"actual:   {normalized_actual!r}"
        )


def _assert_diagnostics_equal(actual: Any, expected: Any, test_id: str) -> None:
    """Assert diagnostics match after reducing them to stable fields."""

    normalized_actual = _normalize_diagnostics(actual)
    normalized_expected = _normalize_diagnostics(expected)
    if normalized_actual != normalized_expected:
        raise AssertionError(
            f"{test_id} diagnostics mismatch:\n"
            f"expected: {normalized_expected!r}\n"
            f"actual:   {normalized_actual!r}"
        )


def _assert_valid_adf(actual: Any, test_id: str, validate_adf: Any) -> None:
    """Assert a converter produced schema-valid ADF."""

    validation = validate_adf(actual)
    if not validation.valid:
        raise AssertionError(f"{test_id} produced invalid ADF: {'; '.join(validation.errors)}")


def _normalize_markdown(markdown: str) -> str:
    """Normalize line endings and trim one trailing newline for comparison."""

    normalized = markdown.replace("\r\n", "\n").replace("\r", "\n")
    return normalized[:-1] if normalized.endswith("\n") else normalized


def _normalize_json(value: Any) -> Any:
    """Recursively sort object keys for stable JSON comparison."""

    if isinstance(value, list):
        return [_normalize_json(item) for item in value]
    if isinstance(value, dict):
        return {key: _normalize_json(value[key]) for key in sorted(value)}
    return value


def _normalize_adf(value: Any) -> Any:
    """Normalize ADF by merging adjacent compatible text nodes and sorting keys."""

    return _normalize_json(_merge_adjacent_text_nodes(value))


def _merge_adjacent_text_nodes(value: Any) -> Any:
    """Merge adjacent ADF text nodes that have identical marks."""

    if isinstance(value, list):
        merged: list[Any] = []
        for item in [_merge_adjacent_text_nodes(entry) for entry in value]:
            previous = merged[-1] if merged else None
            if (
                isinstance(previous, dict)
                and isinstance(item, dict)
                and previous.get("type") == "text"
                and item.get("type") == "text"
                and _normalize_json(previous.get("marks", []))
                == _normalize_json(item.get("marks", []))
            ):
                previous["text"] = f"{previous.get('text', '')}{item.get('text', '')}"
            else:
                merged.append(item)
        return merged
    if isinstance(value, dict):
        return {key: _merge_adjacent_text_nodes(entry) for key, entry in value.items()}
    return value


def _normalize_diagnostics(diagnostics: Any) -> Any:
    """Keep only stable diagnostic fields for fixture comparisons."""

    return [
        {
            key: diagnostic[key]
            for key in ("severity", "code", "path", "fallback")
            if key in diagnostic
        }
        for diagnostic in diagnostics
    ]


def _diagnostic_to_json(diagnostic: Any) -> dict[str, Any]:
    """Convert a diagnostic dataclass to JSON, omitting None values."""

    return {key: value for key, value in asdict(diagnostic).items() if value is not None}


if __name__ == "__main__":
    raise SystemExit(main())
