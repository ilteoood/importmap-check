## MODIFIED Requirements

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

## ADDED Requirements

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