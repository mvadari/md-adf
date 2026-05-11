# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Fixed

- JS: Restored a browser-safe root export map for the npm package while keeping `parseAdf` and `validateAdf` available from the Node root import.

## 0.1.3 - 2026-05-07

### Added

- JS: Added explicit npm subpath exports for `md-adf/adf-to-markdown`, `md-adf/markdown-to-adf`, `md-adf/validate`, and `md-adf/types`.
- Added `adfFragmentToMarkdown` / `adf_fragment_to_markdown` APIs for rendering ADF fragments and individual nodes.
- JS: Added package export tests that verify public import paths and browser-safe converter entrypoints.

### Changed

- JS: Split validation helpers from converter import paths so browser converter entrypoints do not pull in Node-only schema validation dependencies.
- Python: Lazily expose validation helpers from `md_adf` so importing converters does not eagerly load `jsonschema`.
- Updated release tagging to derive the version from package metadata and require JS/Python versions to match.

## 0.1.2 - 2026-05-07

### Added

- Added schema-valid ADF-to-Markdown text fallbacks for Atlassian `mention`, `emoji`, `date`, and `status` inline nodes in both JS and Python, with diagnostics for lossy rich inline attributes.
- Added ADF-to-Markdown block fallbacks for panels, expands, cards, layouts, and extensions in both JS and Python.
- Added Phase 2 GFM fixtures for tables, task lists, media, cards, panels, expands, and rich inline fallback behavior.
- Added npm and PyPI release checklists plus package smoke tests for API imports and installed `md-adf` CLI behavior.
- Python: Added deployment wiring and release scripts for building and publishing the PyPI package.

### Changed

- Renamed the published packages to `md-adf`, the CLI command to `md-adf`, and the Python import package to `md_adf`.
- Aligned package metadata, docs, licenses, fixtures, and release guidance with the `md-adf` package names.
- Python: Bumped the package version to align released JS and Python package versions.

### Fixed

- JS: Hardened npm publishing by keeping the repository root package private and adding release guards to prevent accidentally publishing the workspace root.
- Fixed release smoke coverage to verify installed package APIs and CLIs before publishing.
- Fixed CI workflow setup and caching for npm, Poetry, lint, tests, conformance, and package smoke checks.

## 0.1.0 - 2026-05-07

Initial release candidate for the JavaScript/TypeScript and Python packages.

### Added

- Publishable npm package `md-adf` with ESM API, TypeScript declarations, and `md-adf` CLI.
- Publishable PyPI package `md-adf` with typed Python API, `py.typed`, and `md-adf` CLI.
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
