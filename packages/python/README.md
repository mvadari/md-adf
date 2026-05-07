# adfmd

Typed Python implementation of the ADF-Markdown converter.

## Install

```sh
pip install adfmd
```

Requires Python 3.10 or newer.

## API

```python
from adfmd import (
    adf_to_markdown,
    markdown_to_adf,
    parse_adf,
    parse_markdown,
    validate_adf,
)

markdown_result = adf_to_markdown(adf_document)
print(markdown_result.value)
print(markdown_result.diagnostics)

adf_result = markdown_to_adf("## Hello\n\nThis is **ADF**.")
print(adf_result.value)
```

Results have this shape:

```python
@dataclass(frozen=True)
class ConversionResult(Generic[T]):
    value: T
    diagnostics: list[Diagnostic]
```

## CLI

```sh
adfmd to-md input.adf.json --output output.md
adfmd to-adf input.md --output output.adf.json
adfmd validate-adf input.adf.json
cat input.md | adfmd to-adf --profile jira
```

Supported profiles are `jira`, `confluence`, and `portableMarkdown`. Diagnostics are emitted as JSON lines to stderr.

## Current Support

ADF to Markdown supports Phase 1 blocks and marks: paragraphs, headings, block quotes, bullet and ordered lists, list items, code blocks, thematic breaks, text, hard breaks, strong, emphasis, strikethrough, inline code, and links.

Markdown to ADF supports the same Phase 1 surface plus GFM table input, soft breaks as spaces, raw HTML as text fallback, and images as linked text fallback.

## Development

```sh
poetry -C packages/python run python ../../tools/conformance/run-python.py
poetry -C packages/python run pytest
poetry -C packages/python run ruff check --config ../../pyproject.toml src tests ../../tools/conformance/run-python.py
poetry -C packages/python run mypy --config-file ../../pyproject.toml src tests ../../tools/conformance/run-python.py
```

Shared conformance fixtures live in `../../fixtures` and are run by the root `just test-python` command.
