# Fixtures

Shared fixtures define the cross-language behavior contract for `md-adf`.

Each case has a `case.json` file with metadata plus input, expected output, and expected diagnostics files appropriate to the direction.

Validate fixtures and the checked-in generated manifest with:

```sh
just validate-fixtures
```

After adding, removing, moving, or editing fixture metadata, regenerate `fixtures/manifest.json` with:

```sh
just generate-manifest
```
