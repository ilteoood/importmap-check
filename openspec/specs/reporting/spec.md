# Reporting

## Purpose

Define the human-readable reporting behavior for `esm-check-updates` v1.
## Requirements
### Requirement: Human-Readable Terminal Output
The system SHALL present analysis results in human-readable terminal output.

#### Scenario: Analysis completes successfully
- **WHEN** the system finishes analyzing a target file
- **THEN** the system prints a terminal report summarizing update findings and issues

#### Scenario: report contains conceptual sections
- **WHEN** the system prints a terminal report
- **THEN** the report groups updates, current packages, warnings, lookup failures, and notes into clearly separated conceptual sections when those sections are present

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
- **AND** the first three columns (Package, Resolved, Latest) are blank-padded on continuation lines so column alignment is preserved across the wrap

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
When `--sources` is enabled, the system SHALL size the Package, Resolved, and Latest columns using existing max-content rules and allocate the remaining available width to the Source column.

#### Scenario: Width is allocated to the Source column after the first three columns
- **WHEN** the user enables `--sources` and the sum of the first three columns' widths is less than the available width
- **THEN** the Source column width is `availableWidth - (packageWidth + resolvedWidth + latestWidth + delimiter overhead)`

#### Scenario: Source column floors at a minimum width when other columns consume available width
- **WHEN** the user enables `--sources` and the sum of the first three columns' widths leaves less than the minimum source width (20 columns)
- **THEN** the Source column width is floored at 20 columns
- **AND** the system does not truncate Package, Resolved, or Latest to make additional room

### Requirement: Colored Update Presentation
The system SHALL use terminal color to distinguish update severity in supported terminals.

#### Scenario: major update is reported
- **WHEN** an available update is a major version change
- **THEN** the system presents that update using a major-change color treatment

#### Scenario: minor update is reported
- **WHEN** an available update is a minor version change
- **THEN** the system presents that update using a minor-change color treatment

#### Scenario: patch update is reported
- **WHEN** an available update is a patch version change
- **THEN** the system presents that update using a patch-change color treatment

#### Scenario: colored terminal sections and table headers are reported
- **WHEN** the terminal supports color and the system prints a structured report
- **THEN** the system may use color for section headings, table headers, or changed version segments as part of the human-readable presentation

### Requirement: No-Update Reporting
The system SHALL report when no package updates are available.

#### Scenario: no updates are found
- **WHEN** the system completes successfully without finding any package updates
- **THEN** the terminal output clearly states that no updates are available

### Requirement: Issue Reporting
The system SHALL separately report entries and conditions that could not be validated for update analysis.

#### Scenario: unparseable or non-versioned mappings are encountered
- **WHEN** one or more in-scope entries cannot be parsed for package and version validation
- **THEN** the system reports those entries separately from successful update findings
- **AND** the overall check may still succeed

#### Scenario: unsupported CDN mappings are encountered
- **WHEN** one or more CDN-backed entries fall outside the supported CDN set
- **THEN** the system may report them separately as unsupported entries

#### Scenario: version lookup failures are encountered
- **WHEN** latest-version resolution fails for one or more parseable packages
- **THEN** the system reports those failures separately from successful update findings

#### Scenario: scopes are encountered
- **WHEN** one or more import maps contain `scopes`
- **THEN** the system reports that `scopes` are not yet supported

#### Scenario: one package has destination skew across source occurrences
- **WHEN** source occurrences for the same package resolve through different supported CDN families or different pinned current versions
- **THEN** the system reports that destination skew as a distinct warning separate from ordinary update findings

#### Scenario: integrity metadata is implicated by a future URL change
- **WHEN** an analyzed mapping is associated with top-level import map `integrity` metadata that would require reconsideration if an update rewrote a destination URL
- **THEN** the system reports or records a note suitable for future update-mode handling

#### Scenario: some package lookups fail while others succeed
- **WHEN** successful update findings and lookup failures both occur in the same run
- **THEN** the system reports both the successful results and the failures in the same terminal report

### Requirement: Non-Destructive Guidance
The system SHALL clearly distinguish informational check-only output from update-mode output that describes a destructive action that was performed, so callers cannot mistake a report for a rewrite or vice versa.

#### Scenario: Check-only report is printed
- **WHEN** the system reports available updates without `--update`
- **THEN** the output describes the result as informational analysis
- **AND** the output does not claim that the target file was updated

#### Scenario: Update-mode summary is printed
- **WHEN** the system completes an `--update` invocation that rewrote the target file
- **THEN** the output explicitly states that the target file was updated
- **AND** the output includes the post-rewrite summary described by the `Post-Rewrite Summary Format` requirement
- **AND** the output does not imply the changes were informational only

#### Scenario: Update-mode invocation makes no changes
- **WHEN** the system completes an `--update` invocation that did not rewrite any entries
- **THEN** the output prints the `No changes to write` message described by the `Post-Rewrite Summary Format` requirement
- **AND** the system does not claim the target file was modified

### Requirement: Post-Rewrite Summary Format

The system SHALL present a unified post-rewrite summary on `stdout` when update mode rewrites the target file, comprising a header line, a before/after table, applicable warnings, stripped-integrity subsection when applicable, and existing informational notes.

#### Scenario: Summary lists each rewritten package with before and after specifiers
- **WHEN** update mode rewrites one or more entries in the target file
- **THEN** the system prints a header line naming the target file
- **AND** the system prints a before/after table with one row per rewritten package sorted by package name
- **AND** each row shows the package name with the original specifier rendered inline when present, followed by the before specifier and the after specifier in `before → after` form

#### Scenario: Summary includes analyzer warnings
- **WHEN** the analyzer produced warnings during an update-mode invocation (e.g. `unsupported-scopes`, `unparseable-entry`, `destination-skew`)
- **THEN** the post-rewrite summary continues to surface those warnings
- **AND** warnings appear in a dedicated section consistent with the check-only report

#### Scenario: Summary includes informational notes
- **WHEN** the analyzer produced informational notes during an update-mode invocation (e.g. dist-tag floating notices)
- **THEN** the post-rewrite summary continues to surface those notes
- **AND** notes appear in a dedicated section consistent with the check-only report

#### Scenario: Summary includes stripped-integrity subsection when integrity entries were removed
- **WHEN** update mode removed one or more `integrity` entries keyed to rewritten URLs
- **THEN** the post-rewrite summary includes a dedicated `Stripped integrity entries:` subsection
- **AND** the subsection lists each stripped URL along with the package name that triggered the strip

#### Scenario: Summary prints `No changes to write` when no entries had available updates
- **WHEN** update mode is invoked and the analyzer reports no available updates for any entry
- **THEN** the system prints a `No changes to write` message to `stdout`
- **AND** the system does not write to the target file
- **AND** the system returns exit code `0`

#### Scenario: Post-rewrite summary does not emit a unified diff
- **WHEN** update mode rewrites the target file
- **THEN** the system prints the before/after table, not a line-level unified diff
- **AND** the system does not require a diff library

### Requirement: Partial Lookup Success Semantics
The system SHALL treat partial package lookup success as a successful check in v1.

#### Scenario: some package lookups fail
- **WHEN** one or more package lookups fail but the overall check completes and other package results were produced
- **THEN** the system returns a successful check result
- **AND** the output reports the lookup failures clearly

## Non-Goals

- JSON output
- Interactive output
- Exact frozen spacing or column width rules
- Output formats for file rewrite mode

## Open Questions

- Whether unsupported CDN entries should always be shown by default
- Whether later versions should add a machine-readable report mode
