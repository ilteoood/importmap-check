## 1. CLI argument parsing

- [x] 1.1 Update `bin/esm-check-updates.js` `parseArgs` to accept `--update` / `-u` and surface a parsed `mode: "update"` result alongside `sources`, `width`, and `targetPath`
- [x] 1.2 Remove the existing `UPDATE_FLAGS` rejection branch that throws "Update mode is not available in v1.""
- [x] 1.3 Preserve the existing arity validation (exactly one positional target path) for update mode
- [x] 1.4 Update the `formatHelp` output to list `--update` / `-u` with a description indicating it rewrites updateable entries in the target file in place
- [x] 1.5 Remove the "Unsupported in v1" line for `-u, --update` and replace it with the supported description
- [x] 1.6 Add a unit test asserting that `--update` without a target path produces a non-zero exit code and an `stderr` error
- [x] 1.7 Add a unit test asserting that `--update` with multiple target paths produces a non-zero exit code and an `stderr` error
- [x] 1.8 Add a unit test asserting that the `--help` output mentions `--update` / `-u` and describes its behavior

## 2. Fix existing `resolveSemverRange` simplification for 0.0.x and tilde cases

- [x] 2.1 Audit `src/index.js` `resolveSemverRange` and document in code comments that the existing caret logic is too coarse for `^0.2.3` (treats as `^0`), `^0.0.3` (treats as `^0`), and the existing tilde logic is too coarse for `~0.0.3` (treats as `~0.0` instead of `~0.0.3 := >=0.0.3 <0.0.4`)
- [x] 2.2 Add the npm semver definition comments (caret locks leftmost-nonzero; tilde locks the position immediately left of the rightmost-specified position) to `resolveSemverRange` per the existing `CDN Reference Comments`/`Import Map Reference Comments` requirement pattern
- [x] 2.3 Implement proper caret resolution: For `^X.Y.Z` where X > 0, lock major (existing behavior) — for `^0.X.Y` where X > 0, lock minor and find highest 0.X.* — for `^0.0.Z` where Z > 0, lock patch and find highest 0.0.* (or null if only Z exists)
- [x] 2.4 Implement proper tilde resolution: For `~X.Y.Z` where X > 0, lock minor (existing behavior) — for `~0.X.Y`, lock minor and find highest 0.X.* — for `~0.0.Z`, apply npm quirk and lock patch and find highest 0.0.* (or null if only Z exists). For `~X.Y` and `~X` and `~0` and `~0.X` partial specifier shapes, match npm's documented semantics
- [x] 2.5 Add unit tests for the resolution cases using synthetic registry versions via a test-only `resolveSpecifier` override that returns a canned registry body:
  - `^1.2.3` resolves to highest 1.x
  - `^0.2.3` resolves to highest 0.2.x (NOT highest 0.x)
  - `^0.0.3` resolves to highest 0.0.x (NOT highest 0.x)
  - `^0.0.3` resolves to `0.0.3` itself when only `0.0.3` exists
  - `~1.2.3` resolves to highest 1.2.x (existing behavior)
  - `~0.2.3` resolves to highest 0.2.x (existing behavior, double-check still correct)
  - `~0.0.3` resolves to highest 0.0.x (NEW behavior, was wrong before)
- [x] 2.6 Confirm no regression in the existing test suite from the resolution tightening; investigate any existing test that depended on the coarse behavior and update its assertion if the test was correctly capturing buggy behavior — or revert the resolution change for that case with a documented `Open Question` if it cannot be tightened without breaking real-world usage

## 3. Specifier-preservation rewrite engine

- [x] 3.1 Add a module-level helper in `src/index.js` that, given an occurrence's `specifier` and the analyzer's `latestVersion`, computes the new specifier string per the design matrix in `design.md` Decision 2:
  - pinned → latest concrete (e.g. `19.2.3` → `19.3.0`)
  - caret (`^X.Y.Z` with X>0) → `^<latest major>.<latest>.<latest>` (e.g. `^19.2.3` → `^20.0.0`)
  - caret on 0.x (`^0.X.Y` with X>0) → `^0.<latest minor>.0` (e.g. `^0.1.0` → `^0.2.0` when latest is `0.2.5`)
  - caret on 0.0.x (`^0.0.Z`) → `^0.0.<latest patch>` if latest is also 0.0.x (e.g. `^0.0.3` → `^0.0.5` when latest is `0.0.5`); or `^0.1.0` when latest crosses into 0.1.x; or `^<new major>.0.0` when latest crosses into a new major
  - tilde (`~X.Y.Z` with X>0) → `~<latest>.<latest minor>.0` when latest crosses the locked minor within the same major (e.g. `~19.2.3` → `~19.3.0` when latest is `19.3.0`); or `~<latest major>.0.0` when latest crosses majors
  - tilde on 0.x (`~0.X.Y`) → `~0.<latest minor>.0` when latest crosses the locked minor
  - tilde on 0.0.x (`~0.0.Z`) follows npm quirk: `~0.0.<new patch>` within 0.0.x; or `~0.<new minor>.0` when latest crosses into 0.1.x; or `~<new major>.0.0` when latest crosses majors
  - major-only (`X`) → `<latest major>` (e.g. `18` → `19`)
  - minor-only (`X.Y`) → `<latest major>.<latest minor>` (e.g. `18.3` → `19.3`)
  - dist-tag → `null` (no rewrite)
  - entries with `hasUpdate === false` → `null` (no rewrite)
- [x] 3.2 Add unit tests for each row of the rewrite matrix in `design.md` Decision 2 against synthetic analyzer outputs (no network): the 12 caret/tilde rows plus the pinned/selector/dist-tag rows
- [x] 3.3 Add a unit test specifically for the `~19.2.3` cross-minor case (`latest=19.3.0` → `~19.3.0`) to confirm the tilde engine handles the within-major case and not only the cross-major case

## 4. Destination URL rewriter

- [x] 4.1 Add a string-surgery helper in `src/index.js` that takes the original file content and a list of `{ oldUrl, newUrl }` pairs and substitutes whole-value occurrences only
- [x] 4.2 Implement a boundary check so a shorter URL that is a substring of a longer URL does not accidentally rewrite the longer URL (match on JSON/HTML value boundary characters such as `"`, `'`, `\``, `>`, whitespace, or `,`)
- [x] 4.3 Preserve URL encoding style: if the original URL contained `%5E` for caret, the rewritten URL uses the same encoding style as the original; if decoded, stays decoded
- [x] 4.4 Add a unit test asserting that substring collisions do not occur (e.g. `https://esm.sh/react@19` vs `https://esm.sh/react@19.2.3`)
- [x] 4.5 Add a unit test asserting that a destination URL appearing as a substring elsewhere in the HTML or JSON is not rewritten outside its import map value

## 5. Integrity strip on rewrite

- [x] 5.1 Add a helper that, given the parsed import map(s) and the list of rewritten URLs, returns the list of `integrity` entry keys that should be stripped (those that exactly match a rewritten old or new URL)
- [x] 5.2 Modify the rewrite output to drop those `integrity` entries from the rewritten content via string surgery on the integrity section (or by re-emitting the integrity block minus stripped keys for JSON targets)
- [x] 5.3 Emit a hard warning per stripped URL naming the package and URL, in the shape the analyzer already uses for existing warnings
- [x] 5.4 Add a unit test asserting that an `integrity` entry keyed to a rewritten URL is stripped and warned
- [x] 5.5 Add a unit test asserting that an `integrity` entry keyed to an unrewritten URL is left in place with no warning
- [x] 5.6 Add a unit test asserting that a target with no `integrity` section produces no stripped-integrity warnings

## 6. Atomic write

- [x] 6.1 Implement an atomic write helper that writes the new content to a temp file in the same directory as the target, then `fs.rename()`s it onto the target path
- [x] 6.2 Name the temp file `.<basename>.ecu-<pid>-<random>.tmp` so collisions are unlikely and watch workflows that ignore dotfiles are not disrupted
- [x] 6.3 In a `try/finally`, remove the temp file if it still exists when the write or rename step throws
- [x] 6.4 Preserve the original file's mode bits on the rewritten file (either via `fs.copyFileSync` initial step or via `fs.stat` + `fs.chmod` after write)
- [x] 6.5 Add a test verifying that an interrupted write leaves the target file unchanged and no temp file remains (use a throw-on-write fixture to simulate interruption)
- [x] 6.6 Add a test verifying that the rewritten target retains its original file mode bits
- [x] 6.7 Add a test verifying that the `--update` flow against a read-only target file returns a non-zero exit code and leaves the file unchanged

## 7. Post-rewrite summary report

- [x] 7.1 Add a `formatUpdateSummary` helper (or extend `formatReport`) in `src/report.js` that takes the analyzer result plus the list of rewrites actually performed, and produces the post-rewrite summary string
- [x] 7.2 Render the header line as `Updated <target-path>:` followed by a blank line
- [x] 7.3 Render the before/after table with one row per rewritten package sorted by package name; each row shows `<package>` (with original specifier inline when present) and `<before> → <after>`
- [x] 7.4 Render the stripped-integrity subsection only when one or more `integrity` entries were stripped, listing each stripped URL alongside the triggering package
- [x] 7.5 Render the existing warnings section using the analyzer's warnings array, formatted identically to the check-only report
- [x] 7.6 Render the existing notes section using the analyzer's notes array, formatted identically to the check-only report
- [x] 7.7 Render a `No changes to write` line when no entries had available updates and skip the write step entirely
- [x] 7.8 Add unit tests for the summary format covering: at least one rewrite; no rewrites; one rewrite with stripped integrity; one rewrite with an existing note; one rewrite with an existing warning
- [x] 7.9 Verify the summary respects `--sources` rendering rules when `--update --sources` is combined (no truncation, source labels inline)

## 8. Orchestration glue in bin entrypoint

- [x] 8.1 In `bin/esm-check-updates.js` `main()`, when `parsed.mode === "update"`, call `analyzeTarget` and then pass the result through the new rewriter + atomic writer + post-rewrite summary path
- [x] 8.2 Surface analyzer errors (e.g. missing file, malformed JSON, no supported import map) as `stderr` messages with non-zero exit codes, identical to check-only behavior
- [x] 8.3 Surface write errors (`EACCES`, `EISDIR`, etc.) as `stderr` messages with non-zero exit codes and do not print a partial summary
- [x] 8.4 Make the exit code `0` on a successful write and on the no-changes-to-write path
- [x] 8.5 Add an end-to-end CLI test asserting that `--update` writes the target file and prints the summary when invoked against a fixture
- [x] 8.6 Add an end-to-end CLI test asserting that `--update` against a fixture with no updates prints `No changes to write` and does not modify the file

## 9. Fixtures

- [x] 9.1 Add `test/fixtures/update-pinned.html` containing inline import map entries with pinned specifiers for at least two packages known to have updates available via the `ECU_TEST_LATEST_VERSIONS` override
- [x] 9.2 Add `test/fixtures/update-ranges.html` containing caret and tilde range entries with known cross-major updates available via the override (includes at least one `~X.Y.Z` cross-minor within-major lift case and one `^0.2.3` cross-minor within-0-major case)
- [x] 9.3 Add `test/fixtures/update-ranges-0.0.x.html` covering the `^0.0.3` and `~0.0.3` cases: includes a fixture where `latest` is a 0.0.x bump (same-minor lift), a fixture where `latest` has crossed to 0.1.x (promotion to minor-locked), and a fixture where `latest` has crossed to 1.0.0 (fallthrough to major-locked)
- [x] 9.4 Add `test/fixtures/update-selectors.html` containing major-only and minor-only selector entries with known latest versions
- [x] 9.5 Add `test/fixtures/update-dist-tags.html` containing dist-tag entries (`@latest`, `@beta`) and asserting that update mode leaves them untouched while still surfacing the existing note about their floating behavior
- [x] 9.6 Add `test/fixtures/update-integrity.html` containing an `integrity` section keyed to at least one URL that will be rewritten, plus at least one keyed to an unrewritten URL
- [x] 9.7 Add a `test/fixtures/update-destination-skew.html` fixture with the same package referenced via two different CDN families to confirm both occurrences are rewritten independently and the destination-skew warning remains in the post-rewrite summary
- [x] 9.8 Add a `test/fixtures/update-noop.html` fixture where every entry's current version already matches the override `latest` to confirm no write happens

## 10. End-to-end tests

- [x] 10.1 Add a CLI test asserting `esm-check-updates --update test/fixtures/update-pinned.html` rewrites the file in place (compare to a golden copy) and prints the expected summary
- [x] 10.2 Add a CLI test asserting `esm-check-updates --update test/fixtures/update-ranges.html` lifts caret and tilde floors per their full matrix: cross-major caret, cross-major tilde, cross-minor tilde within major, 0.x minor-locked caret
- [x] 10.3 Add a CLI test asserting `esm-check-updates --update test/fixtures/update-ranges-0.0.x.html` rewrites `^0.0.3` → `^0.0.5` when latest is `0.0.5`, `^0.0.3` → `^0.1.0` when latest is `0.1.0`, `^0.0.3` → `^1.0.0` when latest is `1.0.0`, and the corresponding `~0.0.3` cases
- [x] 10.4 Add a CLI test asserting `esm-check-updates --update test/fixtures/update-selectors.html` moves major-only and minor-only selectors to the latest major (and major.minor)
- [x] 10.5 Add a CLI test asserting `esm-check-updates --update test/fixtures/update-dist-tags.html` does not rewrite any dist-tag entries and still prints the existing notes
- [x] 10.6 Add a CLI test asserting `esm-check-updates --update test/fixtures/update-integrity.html` strips the affected `integrity` entry, preserves unrewritten ones, and prints the stripped-integrity warning
- [x] 10.7 Add a CLI test asserting `esm-check-updates --update test/fixtures/update-destination-skew.html` rewrites both occurrences and keeps the destination-skew warning in the summary
- [x] 10.8 Add a CLI test asserting `esm-check-updates --update test/fixtures/update-noop.html` prints `No changes to write`, does not modify the file, and returns exit code `0`
- [x] 10.9 Add a CLI test asserting idempotency: running `--update` twice on the same fixture (with stable override versions) produces no further changes on the second run (covers the cross-minor tilde case explicitly to ensure the rewrite target stabilizes)
- [x] 10.10 Add a CLI test asserting `esm-check-updates --update --sources test/fixtures/update-pinned.html` rewrites the file and the post-rewrite summary respects `--sources` rendering
- [x] 10.11 Add a CLI test asserting `esm-check-updates -u test/fixtures/update-pinned.html` (short form) behaves identically to the long form

## 11. JSON target support

- [x] 11.1 Confirm the rewriter's string-surgery approach operates correctly on standalone JSON import map files (no inline `<script>` wrapper) by adding `test/fixtures/update-pinned.json` with a single import map object
- [x] 11.2 Add a CLI test asserting `esm-check-updates --update test/fixtures/update-pinned.json` rewrites the JSON file in place via string surgery (no JSON re-serialization) and preserves the original formatting

## 12. README and CLI spec doc sync

> Reference draft: `openspec/changes/implement-update-mode/readme-draft.md` contains the full proposed prose. The seven commitments below are the bespoke judgment calls that MUST be visible in the user-facing README; the draft covers all of them. Implementation lands the draft (refined as needed) into `README.md`.

- [x] 12.1 Update `README.md` Overview to drop "current CLI is check-only" framing; document `--update` / `-u` as the optional rewrite mode
- [x] 12.2 Update `README.md` Options list to add `-u, --update` with a forward reference to the new Update Mode section
- [x] 12.3 Replace the "Does not update files in place yet" bullet in Current behavior with "Use `--update` / `-u` to rewrite updateable entries in place (see Update Mode)"
- [x] 12.4 Add an `## Update Mode` section to `README.md` (per the draft in `readme-draft.md`) containing:
  - **(a)** A `--update` usage synopsis and a prominent version-control callout ("Make sure your target file is in version control and all changes are committed before running `--update`. ECU does not snapshot before writing.")
  - **(b)** The rewrite behavior-by-specifier-class matrix table (pinned, caret, tilde cross-major, tilde cross-minor, major-only, minor-only, dist-tag-not-rewritten)
  - **(c)** A Major-version-zero ranges subsection covering `^0.1.0 → ^0.2.0` (within-0.x lift), `^0.1.0 → ^1.0.0` (fallthrough), `^0.0.3 → ^0.0.5` (within-0.0.x lift), `^0.0.3 → ^0.1.0` (promotion), and the `~0.0.3` npm quirk
  - **(d)** A Dist-tag entries are not rewritten subsection explaining that dist-tag entries float at the registry and ECU does not rewrite them in this version; mention future `--pin` / `--pin-channel` follow-up
  - **(e)** An Integrity entries are stripped, not regenerated subsection explaining SRI is stripped with a hardcoded warning, regeneration is deferred (with reasoning: browser-vs-CLI byte-stability for brotli/gzip encoding and esm.sh's UA-sensitive build-target selection), and users must re-pin SRI externally
  - **(f)** A `?deps=` query pins are not rewritten subsection noting that dep pins are analyzed and reported but not rewritten in this version; mention future `?deps=` rewriting follow-up
  - **(g)** A Resolution tightening (check-only behavior change) subsection noting that `^0.2.3` and `~0.0.3` resolution values in the existing `Resolved` column will change versus prior ECU versions because the pre-existing coarse `^0` interpretation has been corrected to match npm strict semver
- [x] 12.5 Add an `## Example: Update Mode` section to `README.md` showing the post-rewrite summary output (header, before/after table, stripped-integrity subsection, notes subsection) per the draft's example
- [x] 12.6 Add an Atomic write note explaining the temp-file-plus-rename behavior and that interrupted updates don't half-write the target
- [x] 12.7 Add a Single target, single invocation note explaining multi-target scanning, `--filter`/`--reject` (per-package targeting), and `--interactive` are deferred to future changes; recommend version-control revert for selective application in the interim

## 13. Decision points and final verification

- [x] 13.1 Decide whether to bump `package.json` from `0.0.1` to `0.1.0` to mark the first non-check-only release; if yes, update `package.json` and the README version references if any
- [x] 13.2 Run `openspec validate --changes "implement-update-mode"` to confirm the change's deltas still validate after spec reorganization
- [x] 13.3 Cross-check the modified-capability deltas against their parent main specs (`openspec/specs/cli/spec.md`, `openspec/specs/reporting/spec.md`, `openspec/specs/importmap-input/spec.md`) to confirm requirement names referenced in REMOVED/MODIFIED operations still match the existing spec text exactly
- [x] 13.4 Confirm the architecture of the deltas matches the proposal: `cli` (flag arity, help), `update-mode` (NEW — rewrite mechanics, atomic write, integrity strip behavior, updateable boundary), `reporting` (post-rewrite summary format including the `No changes to write` case, modified non-destructive guidance), `importmap-input` (cross-reference to update-mode for strip). No `package-resolution` delta.
- [x] 13.5 Run `npm test` to verify all new and existing tests pass
- [x] 13.6 Run `npm run format` to ensure code formatting and lint are clean
- [x] 13.7 Manually run `esm-check-updates --update` against a fresh copy of a real import map fixture (or a temp copy) and compare the written output to the expected summary, paying special attention to 0.0.x range lifts and their resolved `currentVersion` values
- [x] 13.8 Confirm that calling `esm-check-updates` without `--update` continues to produce byte-identical output to the prior check-only implementation across all existing test fixtures EXCEPT for cases where the resolution tightening (task group 2) intentionally changes a previous coarse `Resolved` value — for those, update the expected assertions in tasks 2.5/2.6 and document the resolution change in the README
- [x] 13.9 Confirm that tasks 2.5/2.6's resolution tightening has been verified against real-world fixtures with `^0.0.x` and `~0.0.x` ranges, AND that the `Resolved` column in check-only mode now correctly reflects strict-semver ranges rather than the pre-existing coarse `^0` form