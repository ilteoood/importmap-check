## 1. CLI flag wiring

- [x] 1.1 Add `--sources` and `--width` constants and parsing in `bin/esm-check-updates.js` `parseArgs`
- [x] 1.2 Validate `--width` argument: must be a positive integer ≥ 40; reject with non-zero exit on invalid value
- [x] 1.3 Accept `--width` without `--sources` silently (no error; just unused)
- [x] 1.4 Update `formatHelp` text to document `--sources` and `--width <number>` in the `Options:` block
- [x] 1.5 Pass `{ withSources: parsed.sources, width: parsed.width }` from the bin entrypoint into `analyzeTarget` and into `formatReport`

## 2. Source metadata propagation in analysis

- [x] 2.1 In `src/index.js` `collectPackageOccurrences`, populate a `specifier` field on each occurrence (empty string for plain pins in v1; non-empty for ranges/dist-tags once `resolve-semver-ranges` lands)
- [x] 2.2 Add a `formatSourceLabel(occurrence)` helper in `src/index.js` that produces `<importMapKey> (<cdnFamily>@<specifier>)` or `<importMapKey> (<cdnFamily>)` based on whether `specifier` is present
- [x] 2.3 Extend `analyzeTarget` options to accept `withSources` (default `false`); only build source entries when `withSources` is `true`
- [x] 2.4 When `withSources` is `true`, populate `packageResults[i].sources` as an array of `{ importMapKey, cdnFamily, specifier, label }` entries deduped by `(importMapKey, cdnFamily, specifier)` and sorted by `(importMapKey, cdnFamily, specifier)`
- [x] 2.5 When `withSources` is `false`, leave `packageResults[i].sources` as `undefined` (no dedup/sort cost)

## 3. Report rendering extensions

- [x] 3.1 Extend `formatReport` options in `src/report.js` to accept `{ colorEnabled, sourcesEnabled, width }`
- [x] 3.2 Compute `availableWidth` as `options.width ?? process.stdout.columns ?? 120`; treat `0` as `undefined`
- [x] 3.3 When `sourcesEnabled` is `false`, render the existing three-column output byte-identically (do not read width, do not wrap)
- [x] 3.4 When `sourcesEnabled` is `true`, render a four-column table with headers `Package | Current | Latest | Source`
- [x] 3.5 Compute `packageWidth`, `currentWidth`, `latestWidth` using existing max-content logic; compute `sourceWidth = max(20, availableWidth - (sum of other widths + delimiter overhead))`
- [x] 3.6 Implement a `renderSourceCell(sources, sourceWidth)` helper that:
  - [x] 3.6.1 Tries comma-joined single-line rendering if all source labels fit in `sourceWidth`
  - [x] 3.6.2 Falls back to one source per line with hanging indent aligned to Source column start when the comma-joined form overflows
  - [x] 3.6.3 Word-wraps an individual source label longer than `sourceWidth` with a 2-space deeper hanging indent
- [x] 3.7 Produce multi-line rows by emitting the first line of all columns and continuation lines that blank-pad the first three columns and render the next Source cell line
- [x] 3.8 Apply the same four-column rendering to both the Updates and Current sections identically

## 4. Tests

- [x] 4.1 Add a test asserting the default invocation (no `--sources`) produces byte-identical output to today for an existing fixture (e.g., `valid-import-map.json` or `non-pinned-supported.html`)
- [x] 4.2 Add a test using `formatReport(report, { sourcesEnabled: true, width: 200, colorEnabled: false })` with a fixture whose source labels fit inline — assert inline source lines render correctly
- [x] 4.3 Add a test using `formatReport(report, { sourcesEnabled: true, width: 100, colorEnabled: false })` with a fixture whose source labels overflow — assert the hanging indent and per-source line wrapping render correctly
- [x] 4.4 Add a test using `formatReport(report, { sourcesEnabled: true, width: 60, colorEnabled: false })` with a fixture containing one source label longer than `sourceWidth` — assert the 2-space deeper word-wrap continuation rendering
- [x] 4.5 Add a test asserting `--sources` enables the Source column end-to-end (run via the bin entrypoint with stubbed `resolveLatestVersion`)
- [x] 4.6 Add a test asserting `--width 100 --sources` overrides the terminal width end-to-end
- [x] 4.7 Add a test asserting `--width abc`, `--width 0`, and `--width 39` produce validation errors with non-zero exit codes
- [x] 4.8 Add a test asserting `--width 100` without `--sources` is accepted and renders the default three-column output
- [x] 4.9 Add a test asserting deduplication of source labels sharing the same `(importMapKey, cdnFamily, specifier)` tuple (multi-entry fixture)
- [x] 4.10 Add a test asserting source labels are sorted by `(importMapKey, cdnFamily, specifier)` for deterministic output across runs
- [x] 4.11 Verify the assertion that `withSources: false` leaves `packageResults[i].sources` as `undefined` (no array allocation)
- [x] 4.12 Help output test: assert `--help` text includes both new flags with descriptions

## 5. Documentation

- [x] 5.1 Update `README.md` to document the `--sources` and `--width <number>` flags in the usage section
- [x] 5.2 Mention that `--sources` opt-in is the only path that triggers width-aware rendering

## 6. Verify and format

- [x] 6.1 Run `npm test` to verify all tests pass
- [x] 6.2 Run `npm run lint` and fix any issues
- [x] 6.3 Run `npm run format` to ensure formatting is correct

## 7. Pre-archive note for the next change

- [x] 7.1 After implementation, add a one-line note to `openspec/changes/resolve-semver-ranges/tasks.md` section 4 indicating that the `sources` field already exists on `packageResults` from the `add-source-column` change and the `specifier` work here is strictly additive alongside it
