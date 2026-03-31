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

Strict mode is enabled when `GOLDEN_STRICT=1`.

- Strict mode: missing fixtures or placeholder fixtures fail the check (non-zero exit).
- Non-strict mode (bootstrap): if fixtures are missing or placeholders, `golden:check` prints a reminder and exits successfully.

In CI, strict mode is typically enabled by setting `GOLDEN_STRICT=1` once fixtures are generated and committed.

3) Run the golden tests:

```sh
pnpm test:golden
```

In strict mode, missing/placeholder fixtures fail tests (via `assert.fail`). In non-strict mode, tests skip with a reminder.

Notes:
- Fixtures store hashes (plus per-tick hash arrays) rather than full replay JSON, to keep diffs small.
