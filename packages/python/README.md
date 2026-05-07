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

- ADF validation/parsing against a pinned ADF schema.
- ADF to Markdown for `doc`, `paragraph`, `heading`, `blockquote`, `bulletList`, `orderedList`, `listItem`, `codeBlock`, `rule`, simple GFM tables, task lists, media link/text fallback, rich inline text fallback for `mention`, `emoji`, `date`, and `status`, `text`, and `hardBreak`.
- Markdown to ADF for paragraphs, headings, block quotes, lists, GFM task lists, code blocks, thematic breaks, GFM tables, text, hard breaks, soft breaks, links, images as link text fallback, and raw HTML as text fallback.
- Marks for `strong`, `em`, `strike`, `code`, and `link`.
- Structured diagnostics for invalid ADF roots, unsupported ADF nodes/marks, invalid containers, invalid link marks, complex table omission, task-list fallback, image/media fallback, rich inline fallback, and dropped rich inline attributes.

## Known Limitations

- ADF to Markdown only renders simple rectangular tables as GFM pipe tables; complex tables are omitted with diagnostics.
- Media is represented as Markdown link/text fallback; no media URL resolver or image emission exists yet.
- Markdown to ADF maps images to linked text fallback instead of ADF media nodes.
- Mixed or complex GFM task lists may fall back to ordinary list items with diagnostics.
- ADF to Markdown renders mentions, emoji, dates, and statuses as text fallbacks; Markdown to ADF keeps that text as normal text and does not recreate rich inline node IDs.
- ADF to Markdown does not yet render panels, expands, cards, layout nodes, extensions, or color/underline/subscript/superscript marks.
- Markdown raw HTML is preserved as text fallback; it is not interpreted into rich ADF.
- Unsupported ADF nodes are omitted with diagnostics.
- Markdown parser AST access is not exposed as public API yet; conversion uses real Markdown parsers internally.

## Development

```sh
poetry -C packages/python run python ../../tools/conformance/run-python.py
poetry -C packages/python run pytest
poetry -C packages/python run ruff check --config ../../pyproject.toml src tests ../../tools/conformance/run-python.py
poetry -C packages/python run mypy --config-file ../../pyproject.toml src tests ../../tools/conformance/run-python.py
npm run test:packages
```

Shared conformance fixtures live in `../../fixtures` and are run by the root `just test-python` command.
