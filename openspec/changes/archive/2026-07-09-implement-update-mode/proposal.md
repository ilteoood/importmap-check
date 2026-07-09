## Why

`esm-check-updates` v1 is check-only: it reports available updates but never writes them. The README explicitly says "does not update files in place yet," and the CLI rejects `--update`/`-u` with a v1-not-supported error. The natural next headline feature is to flip that "yet" — let the user actually apply the updates the analyzer already identifies.

This change introduces the smallest good version of update mode: a single new flag (`--update`/`-u`) that rewrites the analyzed target file in place, lifting each updateable entry to the latest available version while preserving its specifier style. All richer controls (target selection, per-package filters, dry-run, interactive multi-select, integrity regeneration, `?deps=` rewriting) are explicitly deferred to later changes so this one stays reviewable.

## What Changes

- Promote `--update` / `-u` from a rejected v1 flag to a supported flag that rewrites the target file in place
- Default behavior under `--update`:
  - Pinned entries (`react@19.2.3`) bump to the latest concrete version (`react@19.3.0`)
  - Range entries (`react@^19.2.3`, `react@~19.2.3`) lift their floor to the new major version returned by the latest lookup (`react@^20.0.0`), preserving the caret/tilde prefix
  - Major-only (`react@18`) and minor-only (`react@18.3`) selectors move to the latest-major selector (`react@19`, `react@19.3`)
  - Dist-tag entries (`react@beta`, `react@latest`) are NOT rewritten because ESM CDNs re-resolve dist-tags live and the entries already float to whatever the registry currently serves. Existing notes surface the "latest > tag" information so users can choose to act manually.
- For entries the analyzer says have no available update: no rewrite, no diff line, no integrity effect
- Strip import map `integrity` entries keyed to any URL that gets rewritten, and emit a hard per-URL warning naming the stripped URL. No integrity hash regeneration in this change.
- Print a post-rewrite summary to stdout showing each rewritten package and its before → after specifier, plus warnings for stripped integrity entries and existing informational notes
- Write the target file atomically (temp file in same directory, then `rename()`) so an interrupted update cannot leave a half-written file
- Update the README to drop the "yet" wording and document `--update`
- Update help output in `bin/esm-check-updates.js` accordingly

## Capabilities

### New Capabilities

- `update-mode`: New capability covering the file-rewrite behavior (specifier-preservation matrix, updateable-entry boundary, destination-skew handling), the atomic write contract, and the integrity-strip-on-rewrite semantics

### Modified Capabilities

- `cli`: The `--update` / `-u` flag moves from the "Unsupported Update Flags In V1" requirement to a new "Update Flag Arity And Mode Selection" requirement with a target-path presence rule that mirrors the existing check-mode invocation. Help output content requirement is updated to describe `--update`.
- `reporting`: A new "Post-Rewrite Summary Format" requirement covers the before/after summary printed after a successful write, including the stripped-integrity subsection and the `No changes to write` case. The existing "Non-Destructive Guidance" requirement is updated because under `--update` the output is no longer purely informational — it now describes a destructive action that was performed.
- `importmap-input`: The existing "Integrity Awareness" requirement is updated to acknowledge update mode by cross-referencing the `update-mode` capability's `Integrity Strip on Rewrite` requirement. The actual strip semantics live in `update-mode`; `importmap-input` retains its check-only note behavior unchanged.

## Impact

- `bin/esm-check-updates.js`: Argument parsing flips the `--update`/`-u` branch from a rejection error to a new `mode: "update"` parse result; the orchestration flow gains a write step that takes the analyzer's package results and emits an updated file via temp file + `rename`
- `src/index.js`: New rewrite-engine helpers (specifier-preserving specifier computation, destination-URL string surgery with whole-value boundary detection, integrity-strip preparation, atomic-write orchestration) that take the original file content and the package results, produce rewritten file content by editing in place per occurrence URL, and surface the rewritten-entry metadata needed for the post-rewrite summary. Reuses the existing per-occurrence provenance (`importMapIndex`, `key`, `keyKind`, `destinationUrl`, `cdnFamily`, `specifier`).
- `src/report.js`: New `formatUpdateSummary` (or extended `formatReport`) helper that renders the header, before/after table, stripped-integrity subsection, and existing notes/warnings after a write. Also renders the `No changes to write` line when the analyzer reports no updates.
- `test/cli.test.js`: New fixtures and tests covering pinned bumps, range floor lifts (including major-version-zero ranges), major/minor selector moves, dist-tag skip behavior, integrity strip warnings, atomic-write presence, destination-skew rewrites, and idempotency (running `--update` twice produces no further changes when versions are stable)
- `test/fixtures/`: Multiple new HTML/JSON fixtures that exercise the rewrite paths end-to-end (pinned, ranges, selectors, dist-tags, integrity skew, destination skew, no-op)
- `README.md`: Replace the "does not update files in place yet" sentence with `--update` documentation; add a full `## Update Mode` section covering all seven bespoke-behavior commitments (rewrite matrix, major-zero ranges, dist-tag skip, integrity strip-not-regenerate, `?deps=` skip, resolution tightening note, version-control callout). Reference draft: `openspec/changes/implement-update-mode/readme-draft.md`
- `openspec/specs/cli/`, `openspec/specs/reporting/`, `openspec/specs/importmap-input/`: Updated main specs at archive time to absorb the deltas from this change
- `openspec/specs/update-mode/spec.md`: New capability spec added at archive time
- `package.json`: Bump from `0.0.1` to `0.1.0` to reflect the first user-visible behavior change (optional; flagged as a decision point in tasks)