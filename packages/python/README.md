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

Current `ConversionOptions` support:

- `markdown_dialect`: only `gfm` is supported; other values are rejected. Dict options may also use `markdownDialect`.
- `profile`: `jira`, `confluence`, and `portableMarkdown` are accepted for API and CLI parity, but do not change Phase 1 conversion behavior yet.
- `validate_adf`: defaults to `True`; set to `False` to skip pinned schema validation for ADF-to-Markdown input. Dict options may also use `validateAdf`.
- `normalize_adf`: accepted for future normalization controls. It is currently a no-op because Phase 1 Markdown-to-ADF output is already normalized where supported. Dict options may also use `normalizeAdf`.

ADF-to-Markdown returns a string with trailing whitespace trimmed and no final newline. The CLI writes that string exactly.

## CLI

```sh
adfmd to-md input.adf.json --output output.md
adfmd to-adf input.md --output output.adf.json
adfmd validate-adf input.adf.json
cat input.md | adfmd to-adf --profile jira
```

Supported profiles are `jira`, `confluence`, and `portableMarkdown`. Diagnostics are emitted as JSON lines to stderr.

## Current Support

ADF to Markdown supports Phase 1 blocks and marks plus simple GFM table rendering, task lists, and media link/text fallback.

Markdown to ADF supports the same Phase 1 surface plus GFM table input, simple GFM task lists, soft breaks as spaces, raw HTML as text fallback, and images as linked text fallback with diagnostics.

Markdown parser AST access is not exposed as public API yet. Conversion uses real Markdown parsers internally, but the supported public surface is conversion to and from ADF.

## Development

```sh
poetry -C packages/python run python ../../tools/conformance/run-python.py
poetry -C packages/python run pytest
poetry -C packages/python run ruff check --config ../../pyproject.toml src tests ../../tools/conformance/run-python.py
poetry -C packages/python run mypy --config-file ../../pyproject.toml src tests ../../tools/conformance/run-python.py
```

Shared conformance fixtures live in `../../fixtures` and are run by the root `just test-python` command.
