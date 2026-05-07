# adfmd

ADF-Markdown converter monorepo.

This repository will host multiple implementations of the same bidirectional converter between Atlassian Document Format (ADF) and GitHub Flavored Markdown (GFM).

Current packages:

- `packages/js`: TypeScript package published to npm as `adfmd`.
- `packages/python`: typed Python package published to PyPI as `adfmd`.

The project is currently bootstrapped only. Conversion logic is intentionally not implemented yet.

## Repository Layout

- `fixtures/`: shared conformance fixtures and schemas.
- `packages/js/`: JavaScript/TypeScript implementation skeleton.
- `packages/python/`: Python implementation skeleton.
- `tools/`: repository tooling placeholders.

## Common Commands

```sh
just validate-fixtures
just generate-manifest
just test-js
just test-python
just test
```

If `just` is unavailable, use the matching npm scripts from the root `package.json`.
