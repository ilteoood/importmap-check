# Evaluation strategy

This directory holds the framework for re-building `importmap-check` from a
common skeleton multiple times (each via a different model + OpenSpec) and
scoring each rebuild against one canonical behavioral test suite.

## What gets evaluated

- **Canonical suite** — `test-baseline/` (moved here from the old `test/api` +
  `test/cli`). It exercises the public library API (`check`/`preview`/`update`,
  imported via `../../src/index.js`) and the CLI (`bin/importmap-check.js`,
  spawned as a subprocess against a local network-free mock npm registry). It
  does **not** test internals — a rebuild may decompose `src/` however it likes.
- **Candidate** — a git branch's `src/`, `bin/`, and `package.json`. Only those
  three paths are judged; the candidate never supplies the tests it runs
  against.
- **Reference** — `main`. Its implementation must pass the canonical suite for a
  run to be a valid instrument (see the reference gate below).

## Branch topology

```
main                    reference implementation
  └─ openspec-starter   clean fork point: openspec/specs + src/bin stubs, package.json→test/.
  │                     No evaluation/, test-baseline/, or experiment/ in tree or history.
  └─ openspec-base      = openspec-starter + this harness (test-baseline/ + evaluation/).
```

Rebuild branches fork from **`openspec-starter`**; the harness runs from
**`openspec-base`** and pins the canonical suite with `--base-ref openspec-base`.
Because `test-baseline/` and `evaluation/` are tracked only on `openspec-base`,
a starter-forked branch has neither on disk — the rebuild cannot see the grader.

## Mechanism: `git archive` scratch tree

For each branch the harness assembles an isolated run root in a fresh
`mkdtemp` directory:

```
scratch/
  test-baseline/        # canonical suite (from the working tree, or --base-ref)
  src/  bin/  package.json   # candidate, via: git archive <ref> -- src bin package.json
```

This root has the same shape as the repo root, so the suite's relative import
(`../../src/index.js`) and the CLI subprocess spawn (`cwd = root`,
`bin/importmap-check.js`) both resolve to the candidate's implementation with
**no edits to any test file**.

Why `git archive` rather than `git worktree` or path indirection:

- **Hermetic** — the candidate contributes only `src bin package.json`. Its own
  copy of `test-baseline/`, any custom reporter, or an ESM loader it might add
  are simply never extracted. There is nothing to scrub and no cheat surface.
- **Lock-free** — `git archive` streams from the object store; it takes no repo
  index lock and never touches the working tree, so branches run in parallel
  safely.
- Relative-import + `cwd`-spawn constraints make env/path indirection
  unworkable without editing the (canonical, must-not-edit) test files.

The canonical `test-baseline/` is taken from the local working tree by default
(convenient before the skeleton is committed). Pass `--base-ref <ref>` to pin it
to a committed ref so every candidate is judged by byte-identical tests even if
the working tree changes mid-run.

## Reference gate

After all branches run, the harness checks that the reference branch (`main`)
`passed`. If it did not, the whole report is flagged `referenceInvalid: true`
and the process exits non-zero — the oracle is only a valid measuring stick when
the reference implementation is green.

## Runtime requirement: Node ≥ 24.2.0

`bin/importmap-check.js` guards execution with `if (import.meta.main)`, which is
only honored on Node ≥ 24.2.0. On an older runtime the guard is silently false,
`run()` never executes, the CLI prints nothing, and **every** CLI test fails at
the assertion stage. The harness refuses to run below 24.2.0 and records the
exact Node version in the report.

> Related: repo `.nvmrc` is `lts/*`. If the resolved LTS is below 24.2.0, CI
> would also break on this bin. Consider pinning `.nvmrc` / adding an `engines`
> field as a follow-up.

## Usage

```sh
# Self-check: run only the reference against the canonical suite.
node evaluation/report.mjs --reference main
npm run eval -- --reference main            # same, via package script

# Compare candidates (label=ref, comma-separated). Reference is added implicitly.
# --base-ref openspec-base pins the canonical suite to the committed harness branch.
node evaluation/report.mjs \
  --reference main --base-ref openspec-base \
  --branches "sonnet=exp/sonnet-5,qwen=exp/qwen3.6"

# Debug a single branch (prints a JSON summary; --keep-scratch to inspect).
node evaluation/run-branch.mjs exp/sonnet-5 --keep-scratch
```

Other flags: `--repo <path>`, `--out <dir>` (default `evaluation/reports/`,
gitignored), `--test-timeout <ms>` (per test, default 30000),
`--wall-timeout <ms>` (per branch, default 180000), `--concurrency <n>`,
`--keep-scratch`.

## Output

Written to `evaluation/reports/` (gitignored):

- **`report.json`** — machine-readable: `canonical`, `runner`, `referenceLabel`,
  `referenceInvalid`, per-branch `branches[]` (status, preflight, totals,
  per-test records), a `matrix` keyed by stable `"test-baseline/… :: <name>"`
  ids, and `regressions` (tests green on the reference but not on a candidate).
- **`report.md`** — human-readable: per-branch summary (with **API** and **CLI**
  tier subtotals), the pass/fail matrix, and the regressions list.

## Two scoring tiers

The suite is intentionally split so a functionally-correct-but-differently-worded
build is distinguishable from a broken one:

- **API tier (`test-baseline/api`)** — asserts on the structured `data` payload
  (semantic). A rebuild with different output wording can still pass.
- **CLI tier (`test-baseline/cli`)** — asserts exact CLI strings (version echo,
  error messages, column headers). A behaviorally-correct build that phrases
  things differently will fail these.

The gate stays strict — for a rebuild meant to reproduce `main`'s observable
contract, the exact CLI wording _is_ the contract — but the report shows the two
tiers separately so cosmetic divergence reads differently from real breakage.

## Files

- `run-branch.mjs` — assemble scratch, preflight (`node --check` on the bin,
  dynamic `import()` of `src/index.js`), run `node --test` with a per-test
  timeout and an outer wall-clock timeout (process-group kill), parse results,
  clean up. Exports `runBranch(options)`.
- `report.mjs` — orchestrate branches with bounded concurrency, build the
  matrix, enforce the reference gate, write the reports.
- `reporters/ndjson-reporter.mjs` — custom `node:test` reporter emitting one
  NDJSON record per test (name, status, duration, failure).
- `specs-review.md` — the OpenSpec spec review and cleanup record.

## Edge cases handled

- Candidate `src`/`bin` fails to import → preflight flags it; the run still
  proceeds so the matrix shows the breakage (and a `<file failed to load>` row).
- Missing `src`/`bin`/`package.json` on a branch → `git archive` errors → branch
  marked `errored`, not silently run partial.
- Hung CLI → per-test `--test-timeout` fails the test; an outer wall-clock timer
  kills the whole process group (CLI + mock registry) and marks the branch
  `timedout`.
- Parallel safety → per-branch scratch dirs; the mock registry binds an
  ephemeral port; fixtures copy into per-run temp dirs.
- Deterministic ids → keyed on the `test-baseline`-relative path + test name,
  never on the scratch path or run order (macOS `/var`→`/private/var` symlink is
  handled by anchoring on the `test-baseline` segment).
