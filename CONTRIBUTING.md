# Contributing

Thanks for helping build `md-adf`.

This repository is fixture-first: shared behavior belongs in `fixtures/`, while each language package implements that behavior natively.

Before opening a pull request:

1. Add or update fixtures for user-visible behavior.
2. Run fixture validation.
3. Run the native tests for each changed package.
4. Keep package-specific implementation details out of shared fixtures unless they are expressed as `skip` or `xfail` metadata.

Conversion logic is not implemented in the initial bootstrap.
