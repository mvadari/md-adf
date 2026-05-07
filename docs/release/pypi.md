# PyPI Release Checklist

Use this checklist for the `adfmd` Python package. Do not publish from a dirty worktree.

## Preflight

- Confirm `packages/python/pyproject.toml` has the intended `version`, `description`, `readme`, `requires-python`, package data, dependencies, and console script.
- Confirm `packages/python/README.md` matches the root README support matrix and known limitations.
- Confirm `CHANGELOG.md` has a dated entry for the release.
- Run the full local verification suite:

```sh
npm test
npm run lint
npm run test:packages
```

## Package Verification

- Build the package:

```sh
poetry -C packages/python build
```

- Inspect the generated artifacts under `packages/python/dist/`.
- Run the smoke test, which installs the local wheel into a temporary virtual environment and verifies API imports plus the installed CLI:

```sh
npm run test:packages
```

## Publish

- Confirm PyPI credentials are configured for Poetry or use a scoped token.
- Publish only after the final release commit and tag are ready:

```sh
poetry -C packages/python publish
```

## Post-Publish

- Install from PyPI in a fresh virtual environment and rerun the import and CLI checks.
- Confirm the PyPI project page renders the README correctly.
- Attach the PyPI package version to the GitHub release notes.
