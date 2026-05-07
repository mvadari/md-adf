# adfmd

ADF-Markdown converter monorepo.

This repository hosts JavaScript/TypeScript and Python implementations of the same bidirectional converter between Atlassian Document Format (ADF) and GitHub Flavored Markdown (GFM). Shared fixtures define the behavior contract across both packages.

Current packages:

- `packages/js`: TypeScript package published to npm as `adfmd`.
- `packages/python`: typed Python package published to PyPI as `adfmd`.

## Current Support

Phase 1 is implemented in both packages, with small Phase 2 GFM slices started:

- ADF validation/parsing against a pinned ADF schema.
- ADF to Markdown for `doc`, `paragraph`, `heading`, `blockquote`, `bulletList`, `orderedList`, `listItem`, `codeBlock`, `rule`, simple GFM tables, task lists, media link/text fallback, `text`, and `hardBreak`.
- Markdown to ADF for paragraphs, headings, block quotes, lists, GFM task lists, code blocks, thematic breaks, GFM tables, text, hard breaks, soft breaks, links, images as link text fallback, and raw HTML as text fallback.
- Marks for `strong`, `em`, `strike`, `code`, and `link`.
- Structured diagnostics for invalid ADF roots, unsupported ADF nodes/marks, invalid containers, invalid link marks, complex table omission, task-list fallback, and image/media fallback.

## Current Options

The JavaScript and Python APIs share the same Phase 1 option behavior:

- Markdown dialect: only `gfm` is supported; unsupported dialect values are rejected.
- Profile: `jira`, `confluence`, and `portableMarkdown` are accepted for API and CLI parity, but are currently no-ops.
- ADF validation: enabled by default for ADF-to-Markdown input and can be disabled with `validateAdf: false` in JS or `validate_adf=False` / `{"validateAdf": False}` in Python.
- ADF normalization: accepted as `normalizeAdf` / `normalize_adf`, but future-only for now. Markdown-to-ADF already merges adjacent compatible text nodes and drops empty text nodes in the current supported surface.
- ADF-to-Markdown newline policy: returned strings are trimmed of trailing whitespace and do not include a final newline.

## Install and Use

JavaScript:

```sh
npm install adfmd
```

```ts
import { adfToMarkdown, markdownToAdf } from "adfmd";

const markdown = adfToMarkdown(adfDocument).value;
const adf = markdownToAdf("# Hello").value;
```

Python:

```sh
pip install adfmd
```

```python
from adfmd import adf_to_markdown, markdown_to_adf

markdown = adf_to_markdown(adf_document).value
adf = markdown_to_adf("# Hello").value
```

CLI:

```sh
adfmd to-md input.adf.json --output output.md
adfmd to-adf input.md --output output.adf.json
adfmd validate-adf input.adf.json
cat input.md | adfmd to-adf --profile jira
```

Diagnostics are written as JSON lines to stderr. Input defaults to stdin and output defaults to stdout.

## Conformance Fixtures

Fixtures in `fixtures/` are the cross-language conformance contract. Each case has `case.json` metadata plus direction-specific inputs, expected outputs, and expected diagnostics. `fixtures/manifest.json` is generated from all case metadata and is consumed by the JS and Python conformance runners.

Validate fixtures after editing them:

```sh
just validate-fixtures
```

Regenerate the manifest after adding, removing, moving, or editing fixture metadata:

```sh
just generate-manifest
```

## Known Limitations

- ADF to Markdown only renders simple rectangular tables as GFM pipe tables; complex tables are omitted with diagnostics.
- Media is represented as Markdown link/text fallback; no media URL resolver or image emission exists yet.
- Markdown to ADF maps images to linked text fallback instead of ADF media nodes.
- Mixed or complex GFM task lists may fall back to ordinary list items with diagnostics.
- ADF to Markdown does not yet render mentions, emoji, dates, statuses, panels, expands, cards, layout nodes, extensions, or color/underline/subscript/superscript marks.
- Markdown raw HTML is preserved as text fallback; it is not interpreted into rich ADF.
- Unsupported ADF nodes are omitted with diagnostics.
- Markdown parser AST access is not exposed as public API yet; conversion uses real Markdown parsers internally.

## Repository Layout

- `fixtures/`: shared conformance fixtures, schemas, and generated manifest.
- `packages/js/`: JavaScript/TypeScript implementation.
- `packages/python/`: Python implementation.
- `tools/`: fixture and conformance tooling.

## Common Commands

```sh
just validate-fixtures
just generate-manifest
just test-js
just test-python
just conformance
just test
just lint
just format
just build
```

Equivalent npm scripts are available from the root `package.json`.
