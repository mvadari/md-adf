# npm Release Checklist

Use this checklist for the `adfmd` JavaScript package. Do not publish from a dirty worktree.

## Preflight

- Confirm `packages/js/package.json` has the intended `version`, `description`, `license`, `exports`, `bin`, `files`, and `engines`.
- Confirm `packages/js/README.md` matches the root README support matrix and known limitations.
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
npm run build --workspace packages/js
```

- Inspect the dry-run package contents:

```sh
npm pack --workspace packages/js --dry-run
```

- Run the smoke test, which installs the local tarball into a temporary npm project and verifies API imports plus the installed CLI:

```sh
npm run test:packages
```

## Publish

- Confirm npm authentication:

```sh
npm whoami
```

- Publish only after the final release commit and tag are ready:

```sh
npm publish --workspace packages/js --access public
```

## Post-Publish

- Install from the registry in a fresh temporary project and rerun the import and CLI checks.
- Confirm the npm package page renders the README correctly.
- Attach the npm package version to the GitHub release notes.
