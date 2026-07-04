## ADDED Requirements

### Requirement: Bootstrap CLI Dispatch
The system SHALL provide a bootstrap CLI implementation that fully handles command parsing and target preflight validation before import map analysis support exists.

#### Scenario: bootstrap CLI code is implemented
- **WHEN** the system implements bootstrap CLI parsing, dispatch, help text, or target preflight validation
- **THEN** that CLI-facing logic lives in the published `bin/esm-check-updates.js` entrypoint
- **AND** `src/` remains reserved for ESM and import map functional code rather than command-line orchestration

#### Scenario: supported informational flag is provided
- **WHEN** the user runs the command with `--help`, `-h`, `--version`, or `-v`
- **THEN** the system completes the requested informational action without requiring a target path

#### Scenario: target path passes bootstrap validation
- **WHEN** the user runs the command with exactly one positional target path and that path exists, is readable, and has a supported `.json`, `.html`, or `.htm` extension
- **THEN** the system reports that target analysis is not implemented yet
- **AND** the system writes that message to `stderr`
- **AND** the system returns a non-zero exit code

### Requirement: Bootstrap Target Type Gate
The system SHALL treat `.json`, `.html`, and `.htm` files as the only supported bootstrap target shapes.

#### Scenario: supported bootstrap extension is provided
- **WHEN** the positional target path ends in `.json`, `.html`, or `.htm`
- **THEN** the system allows the invocation to proceed to bootstrap dispatch

#### Scenario: unsupported bootstrap extension is provided
- **WHEN** the positional target path has any other extension or no supported extension
- **THEN** the system reports that the target type is unsupported
- **AND** the system writes the error to `stderr`
- **AND** the system returns a non-zero exit code
