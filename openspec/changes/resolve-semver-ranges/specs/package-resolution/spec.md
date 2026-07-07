# package-resolution Spec Delta — resolve-semver-ranges

## MODIFIED Requirements

### Requirement: Pinned Version Extraction
The system SHALL extract a concrete pinned package version from supported CDN-backed mappings for use as the current version in update analysis.

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

#### Scenario: prerelease version is used as a pinned version
- **WHEN** an entry contains a prerelease version such as `16.3.0-preview.5` or `16.3.0-canary.78` in a supported CDN URL format
- **THEN** the system treats the prerelease version as a concrete pinned version for update analysis in v1
- **AND** the system compares the prerelease version against the stable `latest` dist-tag from the npm registry
- **AND** the system does not attempt channel-aware prerelease comparison (e.g. comparing `preview` to `preview`) in v1

## ADDED Requirements

### Requirement: Semver Range and Dist-Tag Resolution
The system SHALL resolve semver ranges, major-only selectors, minor-only selectors, and dist-tags to concrete versions via the npm registry when they appear in CDN URLs or `?deps=` query strings.

#### Scenario: semver range is used in a CDN URL
- **WHEN** an entry uses a semver range such as `^19.2.3` in a supported CDN URL
- **THEN** the system resolves the range to the highest matching stable version using the npm registry
- **AND** the system uses the resolved version as the current version for update analysis
- **AND** the system reports the original specifier, the resolved version, and the latest available version

#### Scenario: major-only selector is used in a CDN URL
- **WHEN** an entry uses a major-only selector such as `18` in a supported CDN URL
- **THEN** the system resolves the selector to the highest matching stable version in that major version using the npm registry
- **AND** the system uses the resolved version as the current version for update analysis
- **AND** the system reports the original specifier, the resolved version, and the latest available version

#### Scenario: minor-only selector is used in a CDN URL
- **WHEN** an entry uses a minor-only selector such as `18.3` in a supported CDN URL
- **THEN** the system resolves the selector to the highest matching stable version in that minor version using the npm registry
- **AND** the system uses the resolved version as the current version for update analysis
- **AND** the system reports the original specifier, the resolved version, and the latest available version

#### Scenario: dist-tag is used in a CDN URL
- **WHEN** an entry uses a dist-tag such as `latest` or `beta` in a supported CDN URL
- **THEN** the system resolves the dist-tag to the corresponding version using the npm registry
- **AND** the system uses the resolved version as the current version for update analysis
- **AND** the system reports the original specifier, the resolved version, and the latest available version

#### Scenario: semver range is used in a `?deps=` query string
- **WHEN** an `esm.sh` URL includes a `?deps=` query string with a semver range, major-only selector, minor-only selector, or dist-tag such as `react@^18` or `react-dom@beta`
- **THEN** the system resolves the range or dist-tag to a concrete version using the npm registry
- **AND** the system uses the resolved version as the current version for update analysis
- **AND** the system reports the original specifier, the resolved version, and the latest available version

#### Scenario: resolved version is already up to date
- **WHEN** a semver range or dist-tag resolves to a version that matches the npm registry `latest` dist-tag
- **THEN** the system reports the entry in the Current section (not Updates)
- **AND** the system shows the specifier, resolved version, and latest version in three columns

#### Scenario: resolved version is outdated
- **WHEN** a semver range or dist-tag resolves to a version that is lower than the npm registry `latest` dist-tag
- **THEN** the system reports the entry in the Updates section
- **AND** the system shows the specifier, resolved version, and latest version in three columns

#### Scenario: npm registry lookup fails for a range or dist-tag
- **WHEN** the system cannot resolve a semver range or dist-tag via the npm registry
- **THEN** the system reports the entry as non-versioned or unparseable (same as absent/pin-only paths)

### Requirement: Three-Column Reporting Format
The system SHALL report resolved package entries using three columns: Package, Resolved, and Latest.

#### Scenario: three-column table is rendered for updates
- **WHEN** the system has package entries with available updates (including resolved ranges and dist-tags)
- **THEN** the system renders a three-column table with headers "Package", "Resolved", and "Latest"
- **AND** the Package column shows the package name, optionally with the original specifier in parentheses when it was a range, selector, or dist-tag
- **AND** the Resolved column shows the concrete resolved version
- **AND** the Latest column shows the npm registry `latest` dist-tag version

#### Scenario: three-column table is rendered for current packages
- **WHEN** the system has package entries that are up to date (including resolved ranges and dist-tags)
- **THEN** the system renders a three-column table with headers "Package", "Resolved", and "Latest"
- **AND** the Package column shows the package name, optionally with the original specifier in parentheses when it was a range, selector, or dist-tag
- **AND** the Resolved column shows the concrete resolved version
- **AND** the Latest column shows the npm registry `latest` dist-tag version

#### Scenario: original specifier is shown alongside resolved version
- **WHEN** an entry was originally specified with a range, selector, or dist-tag
- **THEN** the system preserves the original specifier in the report for user clarity
- **AND** the original specifier is shown in the Package column alongside the package name