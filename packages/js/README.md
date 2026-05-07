# adfmd

TypeScript implementation of the ADF-Markdown converter.

## Install

```sh
npm install adfmd
```

Requires Node.js 20 or newer.

## API

```ts
import {
  adfToMarkdown,
  markdownToAdf,
  parseAdf,
  validateAdf,
} from "adfmd";

const markdownResult = adfToMarkdown(adfDocument);
console.log(markdownResult.value);
console.error(markdownResult.diagnostics);

const adfResult = markdownToAdf("## Hello\n\nThis is **ADF**.");
console.log(adfResult.value);
```

Results have this shape:

```ts
type ConversionResult<T> = {
  value: T;
  diagnostics: Diagnostic[];
};
```

Current `ConversionOptions` support:

- `markdownDialect`: only `gfm` is supported; other values are rejected.
- `profile`: `jira`, `confluence`, and `portableMarkdown` are accepted for API and CLI parity, but do not change Phase 1 conversion behavior yet.
- `validateAdf`: defaults to `true`; set to `false` to skip pinned schema validation for ADF-to-Markdown input.
- `normalizeAdf`: accepted for future normalization controls. It is currently a no-op because Phase 1 Markdown-to-ADF output is already normalized where supported.

ADF-to-Markdown returns a string with trailing whitespace trimmed and no final newline. The CLI writes that string exactly.

## CLI

```sh
adfmd to-md input.adf.json --output output.md
adfmd to-adf input.md --output output.adf.json
adfmd validate-adf input.adf.json
cat input.adf.json | adfmd to-md --profile portableMarkdown
```

Supported profiles are `jira`, `confluence`, and `portableMarkdown`. Diagnostics are emitted as JSON lines to stderr.

## Current Support

ADF to Markdown supports Phase 1 blocks and marks plus simple GFM table rendering, task lists, and media link/text fallback.

Markdown to ADF supports the same Phase 1 surface plus GFM table input, simple GFM task lists, soft breaks as spaces, raw HTML as text fallback, and images as linked text fallback with diagnostics.

Markdown parser AST access is not exposed as public API yet. Conversion uses real Markdown parsers internally, but the supported public surface is conversion to and from ADF.

## Development

```sh
npm run build --workspace packages/js
npm run test --workspace packages/js
npm run format --workspace packages/js
```

Shared conformance fixtures live in `../../fixtures` and are run by the package test command.
