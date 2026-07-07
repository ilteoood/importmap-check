## Why

`esm-check-updates` conflates multiple import-map entries for the same package into one row in the Updates and Current sections. When the same package appears in several entries (a root import plus a subpath, plus an `?deps=` pin elsewhere), the user has no way to know *which* import-map entry to edit. The report hides exactly the information needed to act on the finding. This is most acute once resolved range/dist-tag specifiers also need to be surfaced (see the parked `resolve-semver-ranges` change), but the gap already exists for plain pinned versions and is worth fixing first as a standalone, orthogonal reporting capability.

## What Changes

- Add an opt-in `--sources` CLI flag (default off) that adds a fourth "Source" column to the Updates and Current section tables
- The Source column lists the distinct import-map entry origins that contributed to the conflated package row, conflation key = `(importMapKey, cdnFamily, specifier)` rendered as `<importMapKey> (<cdnFamily>@<specifier>)` for non-pin specifiers or `<importMapKey> (<cdnFamily>)` for plain pins
- Wire a width-aware rendering mode that activates only when `--sources` is on:
  - Width source: `--width <number>` override > `process.stdout.columns` > `120` fallback
  - First three columns (Package, Current, Latest) stay max-content sized; the Source column receives the remaining width and wraps with a hanging indent aligned to the Source column start
- Add an opt-in `--width <number>` CLI flag for deterministic output in tests / CI / piped contexts
- Propagate per-occurrence source metadata through `analyzeTarget` so `packageResults[i].sources` (array, deduped by conflation key, sorted for determinism) is available when `withSources: true` is passed
- Add CLI spec coverage for the new flags and reporting spec coverage for the optional Source column and width-aware rendering

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli`: Add `--sources` and `--width` flags with parsing, validation, and help text
- `reporting`: Add optional Source column requirement; add width-aware rendering requirement that activates with `--sources`

## Impact

- `bin/esm-check-updates.js`: extend `parseArgs` with `--sources` and `--width`, update `formatHelp`, pass new options through to `analyzeTarget` and `formatReport`
- `src/index.js`: extend `analyzeTarget` options with `withSources`; populate `packageResults[i].sources` (deduped by conflation key) when enabled
- `src/report.js`: add conditional four-column rendering with hanging-indent Source cell and width-aware sizing; `formatReport` accepts `{ colorEnabled, sourcesEnabled, width }` options
- `README.md`: document the two new flags
- `test/cli.test.js` and fixtures: add tests for default-off behavior (unchanged output) and `--sources` / `--width` opt-in behavior (new Source column, wrapping)

## Sequencing Note

This change is intentionally scoped to ship before resuming `resolve-semver-ranges`. `resolve-semver-ranges` will add a `specifier` field alongside the `sources` field introduced here; that addition is strictly additive once `sources` is in place. See `resolve-semver-ranges/tasks.md` section 4 (to be annotated during implementation).