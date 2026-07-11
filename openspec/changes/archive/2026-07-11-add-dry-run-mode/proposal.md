## Why

`--update` writes the target file immediately, with no way to preview the exact edits first — which is why the README carries a "make sure everything's committed" warning. Users want to see what `--update` *would* do to their file before it does it, without relying on git to revert. This is the safe-preview half of the update loop (`future-work.md` §5).

## What Changes

- Add a `--dry-run` flag that computes the update-mode rewrite plan and prints a **unified line diff** of the changes it would make, **without writing** the target file.
- `--dry-run` is a standalone mode: usable without `--update`. When combined with `--update`, dry-run wins (still no write).
- Dry-run output is a `Dry run — no files written.` banner + the unified diff + the same ancillary **Warnings / Stripped integrity entries / Lookup Failures / Notes** sections the update summary already emits. The diff replaces only the package `before → after` rows. When nothing would change, it prints `No changes would be written.` plus the ancillary sections.
- Internally, split the rewrite path into a pure **plan** step (compute rewrites, stripped-integrity entries, original/updated content) and a **commit** step (atomic write). `--update` runs both; `--dry-run` runs only the plan.
- Add a no-dependency LCS-based unified-diff renderer: `--- `/`+++ ` headers, correct `@@` line numbers, 3 lines of context, coalesced hunks, and color reusing the existing `colorize` / `NO_COLOR` / TTY treatment.
- CLI: `--dry-run` (long form only, no short flag) selects mode `dry-run`, requires exactly one positional target, and exits `0` on success. `--sources` / `--width` are accepted but are no-ops in dry-run (there is no package table to size). Help text gains a `--dry-run` line.
- The shipped default is unchanged: `--update` still writes. This change does **not** flip the default to dry-run.

## Capabilities

### New Capabilities
<!-- None: dry-run is a new mode within existing capabilities. -->

### Modified Capabilities
- `cli`: Add a Dry-Run Flag requirement (mode selection, dry-wins-over-`--update`, single-target arity, standalone validity, exit `0`) and extend help-output content to include `--dry-run`.
- `update-mode`: Add a Dry-Run Preview (No Write) requirement — the rewrite plan is computed identically to `--update`, but the target file is provably left unmodified.
- `reporting`: Add a Unified Diff Rendering requirement — diff format, hunk structure (line numbers + context), color treatment, the dry-run banner, and the ancillary sections carried alongside the diff.

## Impact

- **Code**: `bin/esm-check-updates.js` (flag parsing, mode selection, dispatch, help); `src/rewrite-target.js` (split plan/commit); new `src/unified-diff.js` (renderer + LCS line-diff helper); `src/report.js` and/or the summary path for the dry-run banner and ancillary sections; `src/index.js` exports.
- **Docs**: `README.md` (document `--dry-run`; soften the commit-before-update warning).
- **Dependencies**: none — the diff renderer is hand-rolled to preserve the zero-dependency philosophy.
- **Tests**: CLI parse/mode selection, a behavioral "target file unchanged" assertion, unified-diff rendering across specifier classes and the integrity-strip case, the no-changes case, and a unit test for the LCS line-diff helper.
