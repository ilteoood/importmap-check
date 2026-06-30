# Package Resolution

## Purpose

Define how `esm-check-updates` v1 identifies updateable packages from supported CDN-backed import map entries.

## Requirements

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

### Requirement: Pinned Version Extraction
The system SHALL validate that supported CDN-backed mappings use a parseable pinned package version for update analysis.

#### Scenario: pinned version is present and parseable
- **WHEN** an entry contains an explicit package version in a supported CDN URL format
- **THEN** the system uses that version as the current version for update analysis

#### Scenario: pinned version is present in an esm.sh dependency query
- **WHEN** an `esm.sh` URL expresses package versions through a parseable `?deps=` query string
- **THEN** the system uses those pinned dependency versions as current versions for update analysis

#### Scenario: pinned version is absent or not parseable
- **WHEN** an entry does not provide a parseable explicit package version
- **THEN** the system reports the entry as non-versioned or unparseable
- **AND** the system does not silently infer the current version

### Requirement: Package-Level Conflation
The system SHALL conflate related entries for the same package to a single candidate target version in v1.

#### Scenario: multiple entries map to one package
- **WHEN** multiple import entries correspond to the same package, including package subpaths
- **THEN** the system treats them as one package update candidate
- **AND** the system reports a single candidate target version for that package

#### Scenario: related entries are inconsistent
- **WHEN** entries believed to represent the same package do not agree on their current pinned version
- **THEN** the system reports the inconsistency
- **AND** the system does not silently normalize conflicting current versions

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

## Non-Goals

- Split target versions for related entries of the same package
- Support for CDN families beyond `esm.sh` and `jsdelivr`
- Implicit version inference from non-pinned URLs
- Prerelease-oriented update targeting

## Open Questions

- Whether unsupported CDNs should always be listed in output or only in verbose modes later
- Whether later versions should support configurable update targeting beyond latest stable
