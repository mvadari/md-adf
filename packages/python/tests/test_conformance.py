from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def test_conformance_manifest_loads() -> None:
    manifest_path = Path(__file__).parents[3] / "fixtures" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert manifest["version"] == 1
    assert len(manifest["cases"]) >= 1


def test_python_conformance_runner_passes() -> None:
    root = Path(__file__).parents[3]
    result = subprocess.run(
        [sys.executable, "tools/conformance/run-python.py"],
        cwd=root,
        check=False,
        text=True,
        capture_output=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr
