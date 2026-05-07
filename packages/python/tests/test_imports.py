from __future__ import annotations

import subprocess
import sys


def test_converter_imports_do_not_load_jsonschema_validation() -> None:
    code = (
        "import sys; "
        "import md_adf; "
        "from md_adf import adf_to_markdown; "
        "from md_adf.convert.adf_to_markdown import adf_fragment_to_markdown; "
        "print('md_adf.adf.validate' in sys.modules); "
        "print(callable(adf_to_markdown)); "
        "print(callable(adf_fragment_to_markdown))"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        check=False,
        text=True,
        capture_output=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout.splitlines() == ["False", "True", "True"]
