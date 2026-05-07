from __future__ import annotations

import json
from pathlib import Path


def test_conformance_manifest_loads() -> None:
    manifest_path = Path(__file__).parents[3] / "fixtures" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert manifest["version"] == 1
    assert len(manifest["cases"]) >= 1
