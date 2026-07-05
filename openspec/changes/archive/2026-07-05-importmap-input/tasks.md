## 1. Extraction And Normalization

- [x] 1.1 Add JSON import map loading and validation for standalone `.json` targets.
- [x] 1.2 Add inline HTML import map extraction for `.html` and `.htm` targets, including multiple `<script type="importmap">` blocks.
- [x] 1.3 Introduce a normalized import-entry model that retains source file, optional import-map index, key, value, and key classification.
- [x] 1.4 Implement import-entry classification for package-style keys and remap-style URL/path keys.

## 2. Package Resolution

- [x] 2.1 Implement supported CDN detection for `jsdelivr` and `esm.sh` destination values.
- [x] 2.2 Implement package and pinned-version extraction from supported destination URLs, including package-prefix and remap-style entries.
- [x] 2.3 Merge normalized entries into package-level candidates deduplicated by parsed package identity.
- [x] 2.4 Detect and retain current-version skew, destination skew, and provenance metadata needed for reporting.

## 3. Reporting And CLI Integration

- [x] 3.1 Replace the bootstrap not-implemented path with importmap-input analysis entry points for JSON and HTML targets.
- [x] 3.2 Report warning-only issues for supported-but-unparseable entries and unsupported `scopes` without failing the overall check.
- [x] 3.3 Add package-level reporting that preserves source-occurrence context while keeping destination URLs internal unless needed for warnings.
- [x] 3.4 Add integrity-awareness notes when analyzed mappings would require future URL-rewrite follow-up.
- [x] 3.5 Update `README.md` to reflect the implemented user-facing CLI behavior, supported input forms, and current check-only scope.

## 4. Fixtures And Tests

- [x] 4.1 Add fixture coverage for valid JSON, malformed JSON, single inline import maps, and multiple inline import maps.
- [x] 4.2 Add fixture coverage for package-style keys, URL-like keys, relative/absolute path remap keys, and mixed CDN/non-CDN destination values.
- [x] 4.3 Add fixture coverage for `jsdelivr`, `esm.sh`, scoped packages, subpaths, package-prefix entries, and destination-skew cases.
- [x] 4.4 Add tests for extraction, package-resolution conflation, warning semantics, and CLI reporting behavior.
