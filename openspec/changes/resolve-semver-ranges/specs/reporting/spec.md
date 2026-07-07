# reporting Spec Delta — resolve-semver-ranges

## MODIFIED Requirements

### Requirement: Package-Centric Reporting
The system SHALL report update findings by package identity rather than by raw source entry, with an optional Source column showing the contributing import-map entry origins when `--sources` is enabled.

#### Scenario: one package appears in multiple source occurrences
- **WHEN** the same package is discovered in multiple import entries or parseable `esm.sh ?deps=` query pins
- **THEN** the system reports one package-level result for that package
- **AND** the report does not need to include raw source occurrences in the default output
- **AND** when `--sources` is enabled, the report includes the distinct import-map entry origins as a Source column entry for that package row

#### Scenario: one package appears across multiple import maps in one HTML file
- **WHEN** the same package is discovered through entries originating from multiple extracted inline import maps in the same HTML target
- **THEN** the system still reports one package-level result for that package
- **AND** the report does not need to include import-map provenance in the default output
- **AND** when `--sources` is enabled, the Source column collapses entries that share `(importMapKey, cdnFamily, specifier)` even if they originated in different import maps

#### Scenario: one package has skewed current versions across source occurrences
- **WHEN** source occurrences for the same package use different current pinned versions
- **THEN** the system reports a single package-level candidate target version when possible
- **AND** the report makes the current-version skew visible to the user as an explicit current version list such as `18.2.0, 18.3.1`
- **AND** when `--sources` is enabled, the Source column lists one entry per distinct `(importMapKey, cdnFamily, specifier)`, independent of current-version skew

#### Scenario: package results are displayed in three aligned columns
- **WHEN** the system reports package-level updates or current packages in terminal output and `--sources` is not enabled
- **THEN** the output uses aligned columns: Package, Resolved, and Latest
- **AND** the Package column shows the package name, optionally with the original specifier in parentheses when it was a range, selector, or dist-tag
- **AND** the Resolved column shows the concrete version in use (pinned or resolved from a range or dist-tag)
- **AND** the Latest column shows the npm registry `latest` dist-tag version

#### Scenario: package results are displayed in four aligned columns with sources enabled
- **WHEN** the system reports package-level updates or current packages in terminal output and `--sources` is enabled
- **THEN** the output uses aligned columns: Package, Resolved, Latest, and Source
- **AND** the Package column shows the package name, optionally with the original specifier in parentheses when it was a range, selector, or dist-tag
- **AND** the Resolved column shows the concrete version in use (pinned or resolved from a range or dist-tag)
- **AND** the Latest column shows the npm registry `latest` dist-tag version
- **AND** the Source column shows the contributing import-map entry origins per the Source Column requirement