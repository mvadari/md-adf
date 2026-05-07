from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).parents[3]
PYTHON_SRC = ROOT / "packages" / "python" / "src"


def test_to_md_converts_adf_from_stdin_to_stdout() -> None:
    adf = {
        "version": 1,
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Hello CLI"}],
            }
        ],
    }

    result = run_cli(["to-md"], json.dumps(adf))

    assert result.returncode == 0, result.stderr
    assert result.stdout == "Hello CLI"
    assert result.stderr == ""


def test_to_adf_converts_markdown_from_stdin_to_stdout() -> None:
    result = run_cli(["to-adf"], "Hello CLI")

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {
        "version": 1,
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Hello CLI"}],
            }
        ],
    }
    assert result.stderr == ""


def test_to_md_writes_to_output(tmp_path: Path) -> None:
    input_path = tmp_path / "input.adf.json"
    output_path = tmp_path / "output.md"
    input_path.write_text(
        json.dumps(
            {
                "version": 1,
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": "File output"}],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    result = run_cli(["to-md", str(input_path), "--output", str(output_path)])

    assert result.returncode == 0, result.stderr
    assert result.stdout == ""
    assert result.stderr == ""
    assert output_path.read_text(encoding="utf-8") == "File output"


def test_validate_adf_accepts_valid_adf_from_stdin() -> None:
    result = run_cli(
        ["validate-adf"],
        json.dumps({"version": 1, "type": "doc", "content": []}),
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout == ""
    assert result.stderr == ""


def run_cli(args: list[str], input_text: str = "") -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(PYTHON_SRC)
    return subprocess.run(
        [sys.executable, "-m", "adfmd_cli", *args],
        cwd=ROOT,
        input=input_text,
        text=True,
        capture_output=True,
        check=False,
        env=env,
    )
