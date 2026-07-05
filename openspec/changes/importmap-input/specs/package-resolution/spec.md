## MODIFIED Requirements

### Requirement: Supported CDN Families
The system SHALL support `esm.sh` and `jsdelivr` CDN URL families in v1.

#### Scenario: esm.sh mapping is encountered
- **WHEN** an import entry value uses a supported `esm.sh` package URL format
- **THEN** the system attempts to extract the package identity and pinned version

#### Scenario: esm.sh dependency query pins are encountered
- **WHEN** an `esm.sh` URL includes a `?deps=` query string with one or more package version pins
- **THEN** the system treats each parseable pinned dependency in that query string as in scope for package and version validation
- **AND** the system reports any dependency query entries in that string that are not parseable as pinned package versions

#### Scenario: jsdelivr mapping is encountered
- **WHEN** an import entry value uses a supported `jsdelivr` package URL format
- **THEN** the system attempts to extract the package identity and pinned version

#### Scenario: other CDN mapping is encountered
- **WHEN** an import entry value points to a CDN family outside the supported v1 set
- **THEN** the system excludes it from update analysis
- **AND** the system may report it as unsupported

### Requirement: Package Identity Extraction
The system SHALL extract a package identity from supported CDN-backed mappings when possible.

#### Scenario: bare package mapping is parseable
- **WHEN** an entry maps a bare specifier such as `react` to a supported CDN URL with a parseable package and version
- **THEN** the system identifies the package represented by that entry

#### Scenario: package subpath mapping is parseable
- **WHEN** an entry maps a package subpath such as `react/jsx-runtime` to a supported CDN URL with a parseable package and version
- **THEN** the system identifies the underlying package represented by that entry

#### Scenario: package-prefix mapping is parseable
- **WHEN** an entry maps a package-prefix specifier such as `react/` to a supported CDN URL with a parseable package and version
- **THEN** the system identifies the underlying package represented by that entry

#### Scenario: remap-style key points to a parseable CDN destination
- **WHEN** an entry uses a URL-like or path-like remap key and its destination value is a supported CDN URL with a parseable package and version
- **THEN** the system identifies the package from the destination value alone
- **AND** the system does not infer the package identity from the remap-style key itself

### Requirement: Pinned Version Extraction
The system SHALL validate that supported CDN-backed mappings use a parseable pinned package version for update analysis.

#### Scenario: pinned version is present and parseable
- **WHEN** an entry contains an explicit concrete pinned package version such as `18.3.1` in a supported CDN URL format
- **THEN** the system uses that version as the current version for update analysis

#### Scenario: pinned version is present in an esm.sh dependency query
- **WHEN** an `esm.sh` URL expresses package versions through a `?deps=` query string containing explicit concrete pinned package versions such as `18.3.1`
- **THEN** the system uses those pinned dependency versions as current versions for update analysis

#### Scenario: pinned version is absent or not parseable
- **WHEN** an entry does not provide a parseable explicit package version
- **THEN** the system reports the entry as non-versioned or unparseable
- **AND** the system does not silently infer the current version

#### Scenario: semver range or dist-tag is used in place of a pinned version
- **WHEN** an entry uses a supported CDN URL form but the package segment uses a semver range, major-only selector, minor-only selector, or dist-tag such as `^`, `~`, `18`, `18.3`, `latest`, or `beta`
- **THEN** the system treats that entry as out of the pinned-version support scope for v1
- **AND** the system reports the entry as non-versioned or otherwise not yet supported for update analysis

### Requirement: Package-Level Conflation
The system SHALL conflate related entries for the same package to a single candidate target version in v1.

#### Scenario: multiple entries map to one package
- **WHEN** multiple import entries correspond to the same package, including package subpaths
- **THEN** the system treats them as one package update candidate
- **AND** the system reports a single candidate target version for that package

#### Scenario: direct imports and esm.sh dependency query pins map to one package
- **WHEN** the same package is discovered through direct import entries, package subpath entries, or parseable `esm.sh ?deps=` query pins
- **THEN** the system merges those occurrences into one package update candidate
- **AND** the system may retain source occurrences as internal metadata for diagnostics or future modes

#### Scenario: multiple inline import maps contribute one package candidate
- **WHEN** the same package is discovered across multiple extracted inline import maps in one HTML file
- **THEN** the system merges those occurrences into one package update candidate
- **AND** the system may retain per-import-map provenance as internal metadata for diagnostics or future modes

#### Scenario: multiple destinations resolve to one package identity
- **WHEN** multiple supported CDN-backed entries resolve to the same parsed package identity
- **THEN** the system deduplicates them by package identity for update analysis
- **AND** the system may retain the distinct destination values as internal metadata for diagnostics or future modes

#### Scenario: related entries are inconsistent
- **WHEN** entries believed to represent the same package do not agree on their current pinned version
- **THEN** the system reports the inconsistency
- **AND** the system does not silently normalize conflicting current versions
- **AND** the system still determines a single candidate target version for that package when possible

#### Scenario: related entries use different supported CDN destinations
- **WHEN** entries believed to represent the same package resolve through different supported CDN families or different pinned current versions
- **THEN** the system reports that destination skew as a distinct warning condition
- **AND** the system still determines a single candidate target version for that package when possible

#### Scenario: related entries use equivalent provider and version destinations
- **WHEN** entries believed to represent the same package resolve through different destination URLs but the same supported CDN family and the same pinned current version
- **THEN** the system does not treat those equivalent destinations alone as a destination-skew warning condition

### Requirement: Latest Version Resolution
The system SHALL determine whether a newer package version is available for supported, parseable package candidates.

#### Scenario: newer stable version is available
- **WHEN** the system resolves a newer supported stable version for a package candidate
- **THEN** the system reports that package as having an available update

#### Scenario: package is already current
- **WHEN** the system resolves no newer supported stable version for a package candidate
- **THEN** the system reports no update for that package

#### Scenario: latest version lookup fails
- **WHEN** the system cannot resolve latest version information for a package candidate
- **THEN** the system reports the lookup failure

#### Scenario: some package lookups fail while others succeed
- **WHEN** the system resolves update information for some package candidates but fails to resolve others
- **THEN** the system reports the successful update findings it was able to determine
- **AND** the system reports the lookup failures separately

### Requirement: CDN Reference Comments
The implementation SHALL include code comments with authoritative document links where available for supported CDN URL shapes, query semantics, and package resolution nuances.

#### Scenario: CDN-specific parsing behavior is implemented from documented service rules
- **WHEN** the implementation adds or maintains logic for supported CDN-specific URL parsing or query handling based on published service documentation
- **THEN** the relevant code includes a concise comment with a link to that authoritative document when such a document exists
