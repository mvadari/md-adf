# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## 0.1.0 - 2026-05-07

Initial release candidate for the JavaScript/TypeScript and Python packages.

### Added

- Publishable npm package `adfmd` with ESM API, TypeScript declarations, and `adfmd` CLI.
- Publishable PyPI package `adfmd` with typed Python API, `py.typed`, and `adfmd` CLI.
- Shared conformance fixtures and generated manifest used by both implementations.
- ADF validation/parsing against a pinned ADF schema.
- ADF-to-Markdown conversion for `doc`, `paragraph`, `heading`, `blockquote`, `bulletList`, `orderedList`, `listItem`, `codeBlock`, `rule`, simple GFM tables, task lists, media link/text fallback, `text`, and `hardBreak`.
- Markdown-to-ADF conversion for paragraphs, headings, block quotes, lists, GFM task lists, code blocks, thematic breaks, GFM tables, text, hard breaks, soft breaks, links, images as link text fallback, and raw HTML as text fallback.
- Mark support for `strong`, `em`, `strike`, `code`, and `link`.
- Structured diagnostics for invalid ADF roots, unsupported ADF nodes/marks, invalid containers, invalid link marks, complex table omission, task-list fallback, and image/media fallback.

### Known Limitations

- ADF-to-Markdown only renders simple rectangular tables as GFM pipe tables; complex tables are omitted with diagnostics.
- Media is represented as Markdown link/text fallback; no media URL resolver or image emission exists yet.
- Markdown-to-ADF maps images to linked text fallback instead of ADF media nodes.
- Mixed or complex GFM task lists may fall back to ordinary list items with diagnostics.
- ADF-to-Markdown does not yet render mentions, emoji, dates, statuses, panels, expands, cards, layout nodes, extensions, or color/underline/subscript/superscript marks.
- Markdown raw HTML is preserved as text fallback; it is not interpreted into rich ADF.
- Unsupported ADF nodes are omitted with diagnostics.
- Markdown parser AST access is not exposed as public API yet; conversion uses real Markdown parsers internally.
