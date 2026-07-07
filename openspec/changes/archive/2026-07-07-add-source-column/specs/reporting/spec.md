# reporting Spec Delta — add-source-column

## ADDED Requirements

### Requirement: Source Column
When the `--sources` flag is provided, the system SHALL render an additional Source column in the Updates and Current section tables that lists the distinct import-map entry origins contributing to each conflated package row.

#### Scenario: Source column is rendered with one source
- **WHEN** the system reports a package row with exactly one contributing source entry and `--sources` is enabled
- **THEN** the Source column shows a single source label of the form `<importMapKey> (<cdnFamily>@<specifier>)` for entries with a non-pin specifier or `<importMapKey> (<cdnFamily>)` for plain pins
- **AND** the source label fits on a single line

#### Scenario: Source column is rendered with multiple sources inline
- **WHEN** the system reports a package row with multiple contributing source entries and `--sources` is enabled and the comma-joined source labels fit in the available source column width
- **THEN** the Source column shows one line per package row
- **AND** the source labels are comma-separated
- **AND** the source labels are sorted by `(importMapKey, cdnFamily, specifier)` for deterministic output

#### Scenario: Source column wraps with hanging indent when sources overflow the available width
- **WHEN** the system reports a package row whose comma-joined source labels exceed the available source column width
- **THEN** the system renders one source label per line
- **AND** each source line after the first is indented to align with the start of the Source column
- **AND** the first three columns (Package, Current, Latest) are blank-padded on continuation lines so column alignment is preserved across the wrap

#### Scenario: A single source label exceeds the source column width
- **WHEN** an individual source label is longer than the available source column width
- **THEN** the system wraps that source label at word boundaries
- **AND** the wrapped continuation lines are indented an additional two spaces relative to the source label start to visually distinguish same-source continuation from next-source lines

#### Scenario: Source entries are deduplicated by conflation key
- **WHEN** multiple occurrences share the same `(importMapKey, cdnFamily, specifier)` tuple
- **THEN** the system renders that source label only once in the Source column
- **AND** the system does not show duplicate source labels

#### Scenario: Source column is omitted by default
- **WHEN** `--sources` is not provided
- **THEN** the system renders the report without a Source column
- **AND** the system does not perform width-aware rendering
- **AND** the output for any given target is byte-identical to the output produced before this capability existed

### Requirement: Width-Aware Rendering
When `--sources` is enabled, the system SHALL size the Package, Current, and Latest columns using existing max-content rules and allocate the remaining available width to the Source column.

#### Scenario: Width is allocated to the Source column after the first three columns
- **WHEN** the user enables `--sources` and the sum of the first three columns' widths is less than the available width
- **THEN** the Source column width is `availableWidth - (packageWidth + currentWidth + latestWidth + delimiter overhead)`

#### Scenario: Source column floors at a minimum width when other columns consume available width
- **WHEN** the user enables `--sources` and the sum of the first three columns' widths leaves less than the minimum source width (20 columns)
- **THEN** the Source column width is floored at 20 columns
- **AND** the system does not truncate Package, Current, or Latest to make additional room

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
- **THEN** the output uses aligned columns: Package, Current, and Latest
- **AND** the Package column shows the package name
- **AND** the Current column shows the current pinned or resolved version
- **AND** the Latest column shows the npm registry `latest` dist-tag version
- **AND** the output is byte-identical to the output produced before the `add-source-column` change

#### Scenario: package results are displayed in four aligned columns with sources enabled
- **WHEN** the system reports package-level updates or current packages in terminal output and `--sources` is enabled
- **THEN** the output uses aligned columns: Package, Current, Latest, and Source
- **AND** the Package column shows the package name
- **AND** the Current column shows the current pinned or resolved version
- **AND** the Latest column shows the npm registry `latest` dist-tag version
- **AND** the Source column shows the contributing import-map entry origins per the Source Column requirement