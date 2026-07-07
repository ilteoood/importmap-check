# package-resolution Spec Delta — resolve-semver-ranges

## Changes to: Requirement: Pinned Version Extraction

### Remove scenario:
```
#### Scenario: semver range or dist-tag is used in place of a pinned version
- **WHEN** an entry uses a supported CDN URL form but the package segment uses a semver range, major-only selector, minor-only selector, or dist-tag such as `^`, `~`, `18`, `18.3`, `latest`, or `beta`
- **THEN** the system treats that entry as out of the pinned-version support scope for v1
- **AND** the system reports the entry as non-versioned or otherwise not yet supported for update analysis
```

## New Requirements

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
The system SHALL report resolved package entries using three columns: Specifier, Resolved, and Latest.

#### Scenario: three-column table is rendered for updates
- **WHEN** the system has package entries with available updates (including resolved ranges and dist-tags)
- **THEN** the system renders a three-column table with headers "Package", "Resolved", and "Latest"
- **AND** the Package column shows the package name
- **AND** the Resolved column shows the resolved concrete version
- **AND** the Latest column shows the npm registry `latest` dist-tag version

#### Scenario: three-column table is rendered for current packages
- **WHEN** the system has package entries that are up to date (including resolved ranges and dist-tags)
- **THEN** the system renders a three-column table with headers "Package", "Resolved", and "Latest"
- **AND** the Package column shows the package name
- **AND** the Resolved column shows the resolved concrete version
- **AND** the Latest column shows the npm registry `latest` dist-tag version

#### Scenario: original specifier is shown alongside resolved version
- **WHEN** an entry was originally specified with a range, selector, or dist-tag
- **THEN** the system preserves the original specifier in the report for user clarity
- **AND** the original specifier is shown in the Package column alongside the package name

## Changes to: Non-Goals

### Remove:
```
- Resolution or normalization of semver ranges or dist-tags such as `^`, `~`, `latest`, or `beta`
```

### Add:
```
- Dist-tag targeting beyond npm built-in dist-tags (`latest`, `beta`, `next`, `canary`, `alpha`)
```

## Changes to: Open Questions

### Remove:
```
- Whether later versions should resolve semver ranges or dist-tags to concrete pinned versions while preserving user intent during reporting or rewrite mode
```
