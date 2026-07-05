## Context

`esm-check-updates` currently validates CLI arguments and accepted file extensions but does not inspect import map contents. The existing specs now define a more concrete initial analysis surface: JSON import maps, inline HTML import maps, package-style and remap-style `imports` keys, supported CDN families (`jsdelivr` and `esm.sh`), package-level conflation, warning-only parse issues, and future-facing `integrity` awareness.

The implementation needs to bridge raw target files and package update analysis without overbuilding a full browser import-map engine. Real-world examples show that the common cases are straightforward inline import maps with a mix of package keys, URL remaps, subpaths, and occasional duplicate package destinations across multiple import maps.

## Goals / Non-Goals

**Goals:**
- Extract import map data from standalone JSON files and inline HTML import map blocks.
- Normalize extracted `imports` entries into a shared internal representation with provenance.
- Classify keys into package-style and remap-style categories.
- Detect supported CDN destinations and derive package/version identity from destination values.
- Merge occurrences by parsed package identity for package-oriented reporting and update analysis.
- Surface warnings for unparseable supported-CDN entries, destination skew, and unsupported `scopes`.
- Retain enough metadata to support future update-mode handling for `integrity` and rewritten URLs.
- Keep `README.md` aligned with user-facing CLI behavior and supported import map input patterns implemented by this change.

**Non-Goals:**
- Full browser-faithful import-map resolution or merge semantics.
- External import map references via `src`.
- Support for CDN families beyond `jsdelivr` and `esm.sh`.
- File rewrite behavior in this change.
- Exhaustive support for every import-map feature such as `scopes` resolution or deep `integrity` mutation.

## Decisions

### Use a two-stage pipeline: extraction then package analysis
The implementation should first extract raw import-map blocks and entries from JSON or HTML targets, then normalize them into a common entry shape before package-resolution logic runs.

Rationale:
- Keeps HTML-vs-JSON concerns separate from CDN parsing.
- Makes fixtures and tests clearer because extraction and analysis can be validated independently.
- Supports future update mode by keeping provenance and entry metadata intact.

Alternative considered:
- Perform package parsing directly during file-format parsing. Rejected because it couples HTML/JSON handling too tightly to package-resolution logic and makes multi-importmap reasoning harder.

### Normalize each import entry with provenance and classification metadata
Each discovered entry should carry source file, optional import-map index, key, value, key classification, and any later package-resolution outcome.

Rationale:
- Required to combine multiple import maps for package-level analysis without losing where an entry came from.
- Enables destination-skew and current-version-skew warnings.
- Keeps reporting flexible without exposing raw destination URLs by default.

Alternative considered:
- Flatten directly to package candidates and discard raw entry context. Rejected because warning/reporting requirements need the original occurrences.

### Derive package identity from supported CDN destination values
Package-style keys remain important reporting context, but remap-style keys must not contribute package identity directly. Relative paths, absolute paths, and URL-like keys are all valid import-map inputs and should still be analyzed when their destination values point to supported CDNs.

Rationale:
- Matches real-world import map usage where URL/path keys often coerce multiple inputs to one destination.
- Avoids incorrectly treating remap keys as `name@version` identities.

Alternative considered:
- Infer package identity from keys when values are ambiguous. Rejected because it blurs the agreed distinction between dependency-style and remap-style entries.

### Combine multiple inline import maps for package analysis, but do not emulate full browser merge semantics
The tool should extract every inline import map block, preserve its provenance, and analyze the union of resulting entries as one package-level candidate set. It should deduplicate by parsed package identity rather than by exact destination URL.

Rationale:
- Fits package-oriented CLI reporting better than separate per-block sections.
- Captures the effective dependency surface users care about.
- Avoids overcommitting to subtle browser merge behavior that is not needed for the initial release.

Alternative considered:
- Keep each import map entirely separate in analysis and output. Rejected because it duplicates package findings and works against package-centric reporting.

### Treat supported-but-unparseable CDN entries as warnings
Entries that point to `jsdelivr` or `esm.sh` but do not yield a reliable package or version should be reported as warnings and must not fail the overall check by themselves.

Rationale:
- Real-world import maps often include odd but still relevant entries.
- The user explicitly wants partial success, not hard failure, for these cases.

Alternative considered:
- Fail on any unparseable supported-CDN entry. Rejected as too strict for the intended check-only workflow.

### Record `integrity` only when it matters for future URL rewrites
Check-only analysis should not treat top-level `integrity` as a blocking concern, but it should retain or note the relationship when an analyzed destination URL would require follow-on handling in a future update mode.

Rationale:
- Keeps the current change focused on analysis.
- Preserves an explicit hook for future write-mode work so `integrity` does not get forgotten.

Alternative considered:
- Ignore `integrity` entirely for now. Rejected because the future coupling to rewritten URLs is already known.

## Risks / Trade-offs

- [HTML extraction edge cases] -> Use tolerant inline importmap detection and fixture coverage with realistic attribute/layout variations.
- [Package conflation may hide unusual duplicate destinations] -> Preserve destination values and provenance so skew can be reported explicitly.
- [CDN parsing rules may grow messy] -> Keep support scoped to `jsdelivr` and `esm.sh` and isolate parsing logic behind normalized entry processing.
- [Future update mode may need more metadata than check-only mode] -> Store provenance, destination values, and integrity relationships now instead of deriving them later.
