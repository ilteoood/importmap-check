# Reporting

## Purpose

Define the human-readable reporting behavior for `esm-check-updates` v1.

## Requirements

### Requirement: Human-Readable Terminal Output
The system SHALL present analysis results in human-readable terminal output.

#### Scenario: Analysis completes successfully
- **WHEN** the system finishes analyzing a target file
- **THEN** the system prints a terminal report summarizing update findings and issues

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

#### Scenario: unsupported CDN mappings are encountered
- **WHEN** one or more CDN-backed entries fall outside the supported CDN set
- **THEN** the system may report them separately as unsupported entries

#### Scenario: version lookup failures are encountered
- **WHEN** latest-version resolution fails for one or more parseable packages
- **THEN** the system reports those failures separately from successful update findings

### Requirement: Non-Destructive Guidance
The system SHALL not imply that target files were changed in check-only mode.

#### Scenario: updates are reported in v1
- **WHEN** the system reports available updates
- **THEN** the output describes the result as informational analysis
- **AND** the output does not claim that the target file was updated

## Non-Goals

- JSON output
- Interactive output
- Exact frozen spacing or column width rules
- Output formats for file rewrite mode

## Open Questions

- Whether unsupported CDN entries should always be shown by default
- Whether later versions should add a machine-readable report mode
