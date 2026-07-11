## 1. Split plan from commit

- [x] 1.1 Extract `planTargetRewrite(targetPath, report)` from `rewriteTargetInPlace` in `src/rewrite-target.js`, returning `{ rewrites, strippedIntegrityEntries, originalContent, updatedContent, noChanges, notes, warnings, lookupFailures, targetPath }` with no file writes
- [x] 1.2 Extract `commitTargetRewrite(targetPath, plan)` performing the atomic temp-file write, `chmod`, `rename`, and failure cleanup
- [x] 1.3 Recompose `--update`'s path as `planTargetRewrite` → `commitTargetRewrite` (keep `rewriteTargetInPlace` behavior byte-identical, whether as a thin wrapper or by updating the caller)
- [x] 1.4 Export the new functions from `src/index.js`
- [x] 1.5 Confirm existing `cli-update` and `format-update-summary` tests still pass unchanged

## 2. Unified diff renderer

- [x] 2.1 Create `src/unified-diff.js` with an LCS/Myers line-diff helper over the original vs. updated line arrays
- [x] 2.2 Emit unified-diff output: `--- `/`+++ ` file headers, `@@ -l,s +l,s @@` hunk headers with correct 1-based line numbers, 3 lines of context, and coalesced adjacent hunks
- [x] 2.3 Colorize `+`/`-`/hunk-header lines via the existing `colorize` helper, honoring `NO_COLOR` and TTY detection like `formatReport`
- [x] 2.4 Export the renderer from `src/index.js`

## 3. Dry-run preview formatter

- [x] 3.1 Factor the ancillary-section rendering (`Warnings`, `Stripped integrity entries`, `Lookup Failures`, `Notes`) so it is shared between `formatUpdateSummary` and the dry-run formatter
- [x] 3.2 Add a dry-run formatter that emits the `Dry run — no files written.` banner, the unified diff, then the ancillary sections; drive it from the plan's original/updated content
- [x] 3.3 Handle the no-changes case: emit `No changes would be written.` plus applicable ancillary sections and no diff

## 4. CLI wiring

- [x] 4.1 Parse `--dry-run` (long form only) in `bin/esm-check-updates.js` and select `mode: dryRun ? "dry-run" : update ? "update" : "check"` (dry wins over update)
- [x] 4.2 Enforce single-positional-target arity for dry-run and dispatch it through `planTargetRewrite` → dry-run formatter, exiting `0` on success
- [x] 4.3 Accept `--sources` / `--width` alongside `--dry-run` without error and with no effect on the diff output
- [x] 4.4 Add the `--dry-run` line to `formatHelp`

## 5. Tests

- [x] 5.1 Unit-test the LCS line-diff helper on pure additions, pure deletions, mixed changes, and adjacent-vs-separated changes (verifying `@@` line numbers and coalescing)
- [x] 5.2 Test CLI parse/mode selection: `--dry-run` selects dry-run, `--dry-run --update` selects dry-run, missing/multiple targets error, help includes `--dry-run`
- [x] 5.3 Behavioral test that a dry-run leaves the target file byte-identical and leaves no temp file in the directory
- [x] 5.4 Test diff rendering across specifier classes (pinned, range) and the integrity-strip-as-removed-line case, with `NO_COLOR` for byte-stable assertions
- [x] 5.5 Test the no-changes case output and that ancillary sections (warnings/notes/lookup failures) still surface

## 6. Docs & finalize

- [x] 6.1 Document `--dry-run` in `README.md` (usage, unified-diff preview, standalone/dry-wins behavior, `--sources`/`--width` no-op) and soften the commit-before-`--update` warning to mention dry-run
- [x] 6.2 Run `npm run format` and `npm test`; resolve any lint/format/test failures
- [x] 6.3 Run `openspec validate add-dry-run-mode` and confirm the change is valid
