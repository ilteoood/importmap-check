# Evaluation harness

Score fresh, from-scratch rebuilds of `importmap-check` against one canonical
behavioral test suite, with `main` as the passing reference implementation.

- **What / why** — the design, the `git archive` mechanism, cheat-proofing, and
  the reference gate are explained in [`strategy.md`](./strategy.md).
- **Spec review** — the OpenSpec cleanup record is in
  [`specs-review.md`](./specs-review.md).
- **This file** — the step-by-step operating instructions.

---

## Prerequisites

- **Node ≥ 24.2.0.** `bin/importmap-check.js` uses `import.meta.main`; on older
  Node the CLI silently does nothing and every CLI test fails. Check with
  `node -v`. The harness refuses to run below 24.2.0.
- **git** with the branches you want to evaluate present locally (the harness
  reads them from the object store — they do not need to be checked out).
- **No `npm install` needed to run the suite** — the tests use only Node
  built-ins and a local, network-free mock npm registry. (You still need
  `npm install` for `lint`/`format`.)

---

## Mental model (read once)

```
                 canonical test-baseline/            candidate src/ bin/ package.json
                 (this working tree, or a            (from `git archive <branch>`)
                  pinned --base-ref)
                          \                          /
                           v                        v
        per-branch scratch dir:  { test-baseline/, src/, bin/, package.json }
                           |
                           v
              node --test  →  NDJSON reporter  →  report.json + report.md
```

Each candidate contributes **only** `src/`, `bin/`, and `package.json`. The
tests always come from the canonical `test-baseline/`, so a rebuild cannot pass
by editing its own tests. See [`strategy.md`](./strategy.md) for the full
rationale.

---

## Branch topology (read once)

```
main                    reference implementation (grader compares against it)
  └─ openspec-starter   CLEAN fork point: openspec/specs + src/bin stubs + package.json→test/.
  │                     NO evaluation/, test-baseline/, or experiment/ (in tree OR history).
  └─ openspec-base      = openspec-starter + this harness: test-baseline/ + evaluation/.
                          Run the grader from here.
```

Rebuild branches fork from **`openspec-starter`**. Because `test-baseline/`,
`evaluation/`, and `experiment/` are tracked only on `openspec-base`, a
starter-forked worktree has none of them — so a rebuild literally cannot see the
graded suite, the grader, or the process-cost harness. (`experiment/` is the tool
you use to _create_ these branches; see
[`../experiment/README.md`](../experiment/README.md).)

## The rebuild → evaluate workflow

### 1. Create a rebuild branch from the clean starter

The experiment harness does this for you — `experiment/exp new <env>` creates a
worktree off `openspec-starter` on `exp/<env>` and launches opencode there (see
[`../experiment/README.md`](../experiment/README.md)):

```sh
experiment/exp new sonnet     # worktree ../ic-sonnet on exp/sonnet, off openspec-starter
```

Or by hand, without the experiment harness:

```sh
git worktree add ../ic-sonnet openspec-starter
cd ../ic-sonnet && git switch -c exp/sonnet
```

Either way the worktree has no `test-baseline/`, `evaluation/`, or `experiment/`
— a clean, spec-only starting point. (Switching **in place** in your main
checkout instead leaves gitignored leftovers like `evaluation/reports/` — whose
`report.md` lists canonical test names — on disk; use a worktree.)

### 2. Run the rebuild on that branch

Implement `src/` and `bin/` (and the rebuild's own `test/`) to satisfy
`openspec/specs/`, then commit (the harness reads committed state via
`git archive`):

```sh
# ...run opencode + OpenSpec against openspec/specs/...
git add -A && git commit -m "Rebuild: <model>"
```

The harness grades only `src`/`bin`/`package.json`, so the rebuild's own `test/`
is never the grader and cannot influence the canonical suite.

### 3. Sanity-check a single branch (from an `openspec-base` checkout)

```sh
git switch openspec-base    # harness lives here
# Prints a JSON summary (status, preflight, totals). --keep-scratch leaves the
# assembled run root in $TMPDIR for inspection.
node evaluation/run-branch.mjs exp/<model>
node evaluation/run-branch.mjs exp/<model> --keep-scratch
```

### 4. Run the comparison (from `openspec-base`)

```sh
# Compare two (or more) rebuilds; the reference (main) is added automatically.
# --base-ref openspec-base pins the canonical suite to the committed harness branch.
node evaluation/report.mjs \
  --reference main --base-ref openspec-base \
  --branches "sonnet=exp/sonnet,qwen=exp/qwen"

# Or via the package script (note the `--` before flags):
npm run eval -- --reference main --base-ref openspec-base \
  --branches "sonnet=exp/sonnet,qwen=exp/qwen"
```

Reports are written to `evaluation/reports/` (gitignored):

- `report.json` — machine-readable, full per-test detail.
- `report.md` — human-readable summary, matrix, and regressions.

### 5. Read the results

Open `evaluation/reports/report.md`. Check, in order:

1. **Reference line** — must say `Reference: **main**` with no warning. If it
   says the reference did not pass, the run is not a valid instrument (the
   process also exits non-zero); fix that before trusting anything else.
2. **Branch summary table** — per branch: `Status`, `Pass/Total`, and the
   **API** and **CLI** tier subtotals (see tiers below), plus fail/skip counts
   and wall time.
3. **Pass/fail matrix** — one row per test, one column per branch
   (✓ pass · ✗ fail · s skip · t todo · – absent).
4. **Regressions vs reference** — tests green on `main` but not on a candidate.
   This is the headline signal for "what did this rebuild get wrong."

### 6. Combined cost vs. quality (optional)

After grading (above) and a process-cost report (`experiment/exp report`), join
them into one table per model:

```sh
npm run eval:combined            # or: node evaluation/combined.mjs
```

→ `evaluation/reports/combined.md`: cost + tokens + time **and** tests-passed /
API-CLI tiers / regressions per model. Join key: each experiment env's primary
branch (from `experiment/reports/runs.jsonl`) = the evaluation branch ref. See
[`../experiment/README.md`](../experiment/README.md) for the cost side.

---

## Commands & flags

```sh
node evaluation/report.mjs [flags]
```

| Flag                       | Default               | Meaning                                                                                  |
| -------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| `--reference <label>`      | `main`                | Branch that must pass for the run to be valid.                                           |
| `--branches "l=ref,l=ref"` | —                     | Candidates as `label=ref` (or bare `ref`), comma-separated. Repeatable.                  |
| `--base-ref <ref>`         | working tree          | Take the canonical `test-baseline/` from this committed ref instead of the working tree. |
| `--repo <path>`            | cwd                   | Repository to evaluate.                                                                  |
| `--out <dir>`              | `evaluation/reports/` | Output directory.                                                                        |
| `--test-timeout <ms>`      | `30000`               | Per-test timeout.                                                                        |
| `--wall-timeout <ms>`      | `180000`              | Per-branch wall-clock timeout (kills the whole process group).                           |
| `--concurrency <n>`        | CPU count             | Branches evaluated in parallel.                                                          |
| `--keep-scratch`           | off                   | Keep the per-branch scratch trees for debugging.                                         |

```sh
node evaluation/run-branch.mjs <ref> [--base-ref <ref>] [--keep-scratch]
```

Runs one branch and prints a JSON summary — handy for debugging a single
candidate.

### Common invocations

```sh
# Self-check: does the harness + canonical overlay work, and does main pass?
node evaluation/report.mjs --reference main

# Pin the suite to the committed harness branch so every candidate is judged by
# byte-identical tests even if your working tree changes mid-run.
node evaluation/report.mjs --reference main --base-ref openspec-base \
  --branches "sonnet=exp/sonnet-5,qwen=exp/qwen3.6"

# Serial run for comparable timings (removes scheduling jitter).
node evaluation/report.mjs --reference main --concurrency 1 --branches ...
```

---

## The two scoring tiers

The suite is split so a correct-but-differently-worded build reads differently
from a broken one:

- **API tier** (`test-baseline/api/*`) — asserts on the structured `data`
  payload returned by `check`/`preview`/`update`. Semantic: a rebuild with
  different output wording can still pass.
- **CLI tier** (`test-baseline/cli/*`) — asserts exact CLI strings (version
  echo, error messages, column headers) by spawning the built binary. Strict: a
  behaviorally-correct build that phrases things differently will fail here.

Both tier subtotals appear per branch in `report.md`. The gate stays strict —
for a rebuild meant to reproduce `main`'s observable contract, the exact CLI
wording _is_ the contract — but seeing "API 12/12, CLI 40/68" tells you the
logic is right and only the presentation diverges.

---

## Branch status values

| Status     | Meaning                                                                                                                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `passed`   | All canonical tests passed.                                                                                                                                                                                                                              |
| `failed`   | Loaded and ran, but ≥1 test failed.                                                                                                                                                                                                                      |
| `errored`  | `src`/`bin` failed to import, or `git archive` couldn't find `src`/`bin`/`package.json` on the branch, or the runner produced no results. The matrix still shows every affected test (a `<file failed to load>` row marks a file that would not import). |
| `timedout` | The per-branch wall-clock timeout fired; the process group was killed.                                                                                                                                                                                   |

---

## Troubleshooting

- **"requires Node >= 24.2.0"** — upgrade Node (`nvm use 24` or newer). Every
  CLI test fails on older runtimes because of the `import.meta.main` guard.
- **Reference `main` shows `errored`** — confirm `main` still has `src/`,
  `bin/`, and `package.json` and that `src/index.js` imports cleanly:
  `node -e "import('./src/index.js')"` after `git checkout main`. Then re-run
  `node evaluation/run-branch.mjs main --keep-scratch` and inspect the scratch
  tree.
- **A candidate is all `–`/`✗` in one file** — a `<file failed to load>` row in
  that file means the candidate's `src` threw on import; check the branch's
  `preflight.error` in `report.json`.
- **`git archive` error for a branch** — that branch is missing one of
  `src`/`bin`/`package.json`, or the ref name is wrong. Verify with
  `git ls-tree <ref> --name-only`.
- **Stale results** — `evaluation/reports/` is overwritten each run; delete it
  to be sure you are reading a fresh report.
- **Leftover scratch dirs** — the harness cleans up in a `finally`; if you used
  `--keep-scratch`, remove them yourself: `rm -rf "$TMPDIR"/importmap-eval-*`.

---

## Files

| File                            | Role                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `report.mjs`                    | Orchestrator: runs branches, builds the matrix, enforces the reference gate, writes reports.                  |
| `run-branch.mjs`                | Assembles one scratch tree, preflights, runs `node --test`, parses results, cleans up. Exports `runBranch()`. |
| `reporters/ndjson-reporter.mjs` | Custom `node:test` reporter emitting one NDJSON record per test.                                              |
| `strategy.md`                   | Design, mechanism, cheat-proofing, reference gate — the "why".                                                |
| `specs-review.md`               | OpenSpec spec review and cleanup record.                                                                      |
| `reports/`                      | Generated output (gitignored).                                                                                |
