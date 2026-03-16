# Golden determinism tests

This folder contains cross-commit determinism tests for `runMatchToReplay()`.

## Workflow

1) Generate fixtures:

```sh
pnpm golden:update
```

2) Run just the golden tests:

```sh
pnpm test:golden
```

Notes:
- Fixtures store hashes (plus per-tick hash arrays) rather than full replay JSON, to keep diffs small.
- If fixtures are not generated yet, tests will skip.
