# md-adf

## Git workflow

Commit directly to `main` and push to `origin/main`. Do not create feature branches or PRs for this repo.

## Releases

- JS and Python versions must match. Bump both with `npm run bump:major|minor|patch`.
- Release steps are in `docs/release/npm.md` and `docs/release/pypi.md`. `npm run release:publish` publishes both packages, then tags `v<version>` and pushes the tag.
- Always publish with `npm run release:publish`. Never run `publish:js`, `publish:py`, `publish:all` or `tag` on their own. The one exception: when a release changes and publishes only one of the two packages.
- After `npm install`, check `package-lock.json` for private registry URLs in `resolved` fields. Replace them with `https://registry.npmjs.org/` before you commit.
