## Why

`esm-check-updates` currently stops after basic target-path validation and does not yet analyze import map content. The next step is to implement the initial import-map analysis surface so real-world HTML and JSON inputs can be parsed, normalized, and prepared for package update checks.

## What Changes

- Implement standalone JSON import map loading and validation.
- Implement inline HTML import map extraction for one or more `<script type="importmap">` blocks.
- Classify `imports` entries into package-style and remap-style keys while deriving package identity from supported CDN destination values.
- Support `jsdelivr` and `esm.sh` destination URLs for package and version extraction in the initial release scope.
- Combine multiple inline import maps into one package-level candidate set while retaining per-import-map provenance for reporting and future update mode.
- Warn instead of failing when supported CDN-backed entries are unparseable or non-versioned.
- Report destination-skew cases when the same package identity resolves through different CDN destinations.
- Record `integrity` implications that would matter for future URL-rewriting update mode.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `importmap-input`: Change the input requirements from abstract import-map support to concrete extraction, entry classification, remap-key handling, combined multi-importmap analysis, warning semantics, and integrity awareness.
- `package-resolution`: Change package resolution requirements to cover package-prefix keys, remap-style key handling, package-identity deduplication across multiple import maps, and destination-skew warnings.
- `reporting`: Change reporting requirements to preserve import-map provenance within package-level output and to surface unparseable-entry warnings, destination-skew warnings, and integrity notes.

## Impact

- Affected code: upcoming import map parsing, entry normalization, package resolution, and CLI reporting implementation under `src/` and `bin/`.
- Affected tests: new fixture-driven coverage for JSON and HTML import maps, real-world remap patterns, malformed inputs, and package-level conflation behavior.
- Affected documentation: `README.md` should track user-visible CLI behavior and supported input shapes as this change lands.
- Affected systems: check-only CLI analysis path and future update-mode planning for `integrity`-sensitive rewrites.
