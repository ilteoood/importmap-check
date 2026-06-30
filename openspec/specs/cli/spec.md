# CLI

## Purpose

Define the user-facing command contract for `esm-check-updates` v1.

## Requirements

### Requirement: Single Target Invocation
The system SHALL accept a single target file path as the primary CLI input.

#### Scenario: Target path is provided
- **WHEN** the user runs `esm-check-updates <path>`
- **THEN** the system analyzes the referenced target file
- **AND** the system treats that file as the only input for the invocation

#### Scenario: Multiple target paths are provided
- **WHEN** the user provides more than one positional target path
- **THEN** the system rejects the invocation as invalid
- **AND** the system returns a non-zero exit code

### Requirement: Supported Target Types
The system SHALL support a single HTML file or a single import map JSON file as the target input in v1.

#### Scenario: HTML target is provided
- **WHEN** the target path points to an HTML file
- **THEN** the system attempts HTML import map extraction

#### Scenario: JSON target is provided
- **WHEN** the target path points to a JSON file
- **THEN** the system attempts import map JSON parsing

#### Scenario: Unsupported target type is provided
- **WHEN** the target path does not refer to a supported target type
- **THEN** the system reports that the target type is unsupported
- **AND** the system returns a non-zero exit code

### Requirement: Check-Only Default Behavior
The system SHALL inspect targets without modifying them in v1.

#### Scenario: Updates are available
- **WHEN** the system finds upgrade candidates
- **THEN** the system reports the candidates to the terminal
- **AND** the system does not modify the target file

#### Scenario: No updates are available
- **WHEN** the system completes analysis and finds no upgrade candidates
- **THEN** the system reports that no updates are available
- **AND** the system does not modify the target file

### Requirement: Exit Code Semantics
The system SHALL treat update findings as a successful execution result.

#### Scenario: Updates are found
- **WHEN** the system completes successfully and identifies updates
- **THEN** the system returns exit code `0`

#### Scenario: No updates are found
- **WHEN** the system completes successfully and identifies no updates
- **THEN** the system returns exit code `0`

#### Scenario: Fatal error occurs
- **WHEN** the system cannot complete due to an invalid invocation, unreadable target, unsupported structure, or other fatal error
- **THEN** the system returns a non-zero exit code

### Requirement: Basic Command Help
The system SHALL provide basic CLI help for supported invocation.

#### Scenario: Help is requested
- **WHEN** the user requests command help
- **THEN** the system prints usage guidance for the command
- **AND** the guidance describes the target file input expected by v1

## Non-Goals

- Updating files in place
- Accepting multiple targets in one invocation
- Recursive project scanning
- JSON output
- Configuration file support

## Open Questions

- Whether omitting the target path should be supported later by falling back to a default file lookup
