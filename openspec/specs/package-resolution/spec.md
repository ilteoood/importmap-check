# Package Resolution

## Purpose

Define how `importmap-check` identifies updateable packages from supported CDN-backed import map entries.

## Requirements

### Requirement: Supported CDN Families
The system SHALL support `esm.sh` and `jsdelivr` CDN URL families.

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
- **WHEN** an import entry value points to a CDN family outside the supported set
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

#### Scenario: esm.sh build-mark prefix is present
- **WHEN** an `esm.sh` URL includes a `/v<digits>/` build-mark prefix segment such as `https://esm.sh/v121/react@18.2.0`
- **THEN** the system skips the build-mark prefix segment and extracts the package identity from the subsequent path segment
- **AND** the system does not treat the build-mark prefix as a package name

#### Scenario: esm.sh URL includes a subpath after the package version
- **WHEN** an `esm.sh` URL includes a subpath after the package version segment such as `https://esm.sh/react@18.2.0/jsx-runtime`
- **THEN** the system extracts the package identity from the `<package>@<version>` segment and ignores the trailing subpath for package identity purposes

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
- **THEN** the system treats the prerelease version as a concrete pinned version for update analysis
- **AND** the system compares the prerelease version against the stable `latest` dist-tag from the npm registry
- **AND** the system does not attempt channel-aware prerelease comparison (e.g. comparing `preview` to `preview`)

### Requirement: Package-Level Conflation
The system SHALL conflate related entries for the same package to a single candidate target version.

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

### Requirement: Semver Range and Dist-Tag Resolution
The system SHALL resolve semver ranges, major-only selectors, minor-only selectors, and npm dist-tags (including arbitrary dist-tag names published to the npm registry) to concrete versions via the npm registry when they appear in CDN URLs or `?deps=` query strings.

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
- **WHEN** an entry uses an npm dist-tag such as `latest`, `beta`, `preview`, or any arbitrary dist-tag published to the npm registry in a supported CDN URL
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

### Requirement: Resolved Entry Reporting Data
For each resolved package entry the system SHALL make available the package name, the original specifier (when it was a range, selector, or dist-tag), the concrete resolved version, and the npm registry `latest` version. The terminal presentation of these values (column layout and headers) is defined by the `reporting` capability's `Package-Centric Reporting` requirement.

#### Scenario: resolved entry carries specifier, resolved, and latest values
- **WHEN** the system resolves a package entry from a pin, range, selector, or dist-tag
- **THEN** the entry carries the package name, the original specifier when it was a range, selector, or dist-tag, the concrete resolved version, and the npm registry `latest` version
- **AND** how these values are laid out for the user is governed by the `reporting` capability

## Non-Goals

- Split target versions for related entries of the same package
- Support for CDN families beyond `esm.sh` and `jsdelivr`
- Implicit version inference from non-pinned URLs
- Prerelease-oriented update targeting
- Dist-tag targeting beyond npm registry dist-tags resolved as the current version

## Open Questions

- Whether unsupported CDNs should always be listed in output or only in verbose modes later
- Whether later versions should resolve prerelease versions against channel-aware npm dist-tags (e.g. `preview`, `canary`, `beta`, `next`) instead of stable `latest`, including how to detect or configure the target dist-tag
- Whether later versions should support configurable dist-tag targeting for update comparison (e.g. `--target preview` or `--target canary` to compare against a chosen dist-tag instead of stable `latest`)
- Which additional CDN families should follow `esm.sh` and `jsdelivr` in later versions, such as `esm.unpkg.com` / `unpkg` or `jspm.io`
- Whether later versions should support configurable update targeting beyond latest stable
