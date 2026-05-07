from __future__ import annotations

from dataclasses import asdict
import json
from pathlib import Path
import sys
from typing import Any


def main() -> int:
    root = Path(__file__).parents[2]
    sys.path.insert(0, str(root / "packages" / "python" / "src"))

    from adfmd import adf_to_markdown

    manifest = json.loads((root / "fixtures" / "manifest.json").read_text(encoding="utf-8"))

    executed = 0
    skipped = 0

    for manifest_case in manifest["cases"]:
        case_path = root / "fixtures" / manifest_case["path"]
        case_dir = case_path.parent
        test_case = json.loads(case_path.read_text(encoding="utf-8"))

        if test_case.get("skip", {}).get("python") or test_case.get("xfail", {}).get("python"):
            skipped += 1
            continue

        if test_case["direction"] == "adf-to-md":
            input_adf = json.loads((case_dir / "input.adf.json").read_text(encoding="utf-8"))
            expected_markdown = (case_dir / "expected.md").read_text(encoding="utf-8").rstrip()
            expected_diagnostics = json.loads(
                (case_dir / "expected.diagnostics.json").read_text(encoding="utf-8")
            )

            result = adf_to_markdown(input_adf, test_case.get("options"))
            actual_diagnostics = [
                _diagnostic_to_json(diagnostic) for diagnostic in result.diagnostics
            ]

            if result.value != expected_markdown:
                raise AssertionError(
                    f"{test_case['id']} markdown mismatch:\n"
                    f"expected: {expected_markdown!r}\n"
                    f"actual:   {result.value!r}"
                )
            if actual_diagnostics != expected_diagnostics:
                raise AssertionError(
                    f"{test_case['id']} diagnostics mismatch:\n"
                    f"expected: {expected_diagnostics!r}\n"
                    f"actual:   {actual_diagnostics!r}"
                )
            executed += 1
        else:
            skipped += 1

    print(f"Python conformance passed {executed} fixture cases ({skipped} skipped).")
    return 0


def _diagnostic_to_json(diagnostic: Any) -> dict[str, Any]:
    return {key: value for key, value in asdict(diagnostic).items() if value is not None}


if __name__ == "__main__":
    raise SystemExit(main())
