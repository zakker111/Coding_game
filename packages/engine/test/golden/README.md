# Golden determinism tests

Cross-commit determinism tests for `runMatchToReplay()`.

## Workflow

1) Generate fixtures:

```sh
pnpm golden:update
```

2) Validate fixtures:

```sh
pnpm golden:check
```

3) Run the golden tests:

```sh
pnpm test:golden
```

Notes:
- Fixtures store hashes (plus per-tick hash arrays) rather than full replay JSON, to keep diffs small.
- If fixtures are not generated yet, golden tests will skip.
