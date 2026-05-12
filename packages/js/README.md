# md-adf

TypeScript implementation of the Markdown-ADF converter.

## Install

```sh
npm install md-adf
```

Requires Node.js 20 or newer.

## API

```ts
import { adfToMarkdown, markdownToAdf, parseAdf, validateAdf } from "md-adf"

const markdownResult = adfToMarkdown(adfDocument)
console.log(markdownResult.value)
console.error(markdownResult.diagnostics)

const adfResult = markdownToAdf("## Hello\n\nThis is **ADF**.")
console.log(adfResult.value)
```

Results have this shape:

```ts
type ConversionResult<T> = {
  value: T
  diagnostics: Diagnostic[]
}
```

Current `ConversionOptions` support:

- `markdownDialect`: only `gfm` is supported; other values are rejected.
- `profile`: `jira`, `confluence`, and `portableMarkdown` are accepted for API and CLI parity, but do not change Phase 1 conversion behavior yet.
- `validateAdf`: defaults to `true`; set to `false` to skip pinned schema validation for ADF-to-Markdown input.
- `normalizeAdf`: accepted for future normalization controls. It is currently a no-op because Phase 1 Markdown-to-ADF output is already normalized where supported.

ADF-to-Markdown returns a string with trailing whitespace trimmed and no final newline. The CLI writes that string exactly.

## CLI

```sh
md-adf to-md input.adf.json --output output.md
md-adf to-adf input.md --output output.adf.json
md-adf validate-adf input.adf.json
cat input.adf.json | md-adf to-md --profile portableMarkdown
```

Supported profiles are `jira`, `confluence`, and `portableMarkdown`. Diagnostics are emitted as JSON lines to stderr.

## Current Support

- ADF validation/parsing against a pinned ADF schema.
- ADF to Markdown for `doc`, `paragraph`, `heading`, `blockquote`, `bulletList`, `orderedList`, `listItem`, `codeBlock`, `rule`, simple GFM tables, task lists, panel blockquotes, expand flattening, card link/text fallback, media link/text fallback, rich inline text fallback for `mention`, `emoji`, `date`, and `status`, `text`, and `hardBreak`.
- Markdown to ADF for paragraphs, headings, block quotes, lists, GFM task lists, code blocks, thematic breaks, GFM tables, simple `<details>` / `<summary>` blocks as expands, text, hard breaks, soft breaks, links, images as link text fallback, and raw HTML as text fallback.
- Marks for `strong`, `em`, `strike`, `code`, and `link`.
- Structured diagnostics for invalid ADF roots, unsupported ADF nodes/marks, invalid containers, invalid link marks, complex table omission, task-list fallback, malformed details fallback, panel/expand/card fallback, image/media fallback, rich inline fallback, and dropped rich inline attributes.

## Known Limitations

- ADF to Markdown only renders simple rectangular tables as GFM pipe tables; complex tables are omitted with diagnostics.
- Media is represented as Markdown link/text fallback; no media URL resolver or image emission exists yet.
- Markdown to ADF maps images to linked text fallback instead of ADF media nodes.
- Mixed or complex GFM task lists may fall back to ordinary list items with diagnostics.
- ADF to Markdown renders mentions, emoji, dates, and statuses as text fallbacks; Markdown to ADF keeps that text as normal text and does not recreate rich inline node IDs.
- ADF to Markdown renders panels, expands, nested expands, and cards as conservative Markdown fallbacks; Markdown to ADF supports simple raw HTML `<details>` / `<summary>` blocks as ADF expands but keeps other fallback blockquotes, headings, text, and links as ordinary Markdown structures.
- ADF to Markdown does not yet render layout nodes, extensions, or color/underline/subscript/superscript marks.
- Markdown raw HTML is preserved as text fallback except for simple supported `<details>` / `<summary>` expand blocks; general raw HTML preservation is not available.
- Unsupported ADF nodes are omitted with diagnostics.
- Markdown parser AST access is not exposed as public API yet; conversion uses real Markdown parsers internally.

## Development

```sh
npm run build --workspace packages/js
npm run test --workspace packages/js
npm run test:packages
npm run format --workspace packages/js
```

Shared conformance fixtures live in `../../fixtures` and are run by the package test command.
