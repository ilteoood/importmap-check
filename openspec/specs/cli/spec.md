# CLI

## Purpose

Define the user-facing command contract for `esm-check-updates` v1.

## Requirements

### Requirement: Single-Command Invocation
The system SHALL expose a single-command CLI invoked as `esm-check-updates <target-path>` in v1.

#### Scenario: One target path is provided
- **WHEN** the user runs `esm-check-updates <target-path>`
- **THEN** the system analyzes the referenced target file
- **AND** the system treats that file as the only target for the invocation

### Requirement: Positional Target Arity
The system SHALL require exactly one positional target path for normal execution in v1.

#### Scenario: No target path is provided
- **WHEN** the user runs the command without a positional target path
- **THEN** the system rejects the invocation as invalid
- **AND** the system writes the error to `stderr`
- **AND** the system returns a non-zero exit code

#### Scenario: Multiple target paths are provided
- **WHEN** the user provides more than one positional target path
- **THEN** the system rejects the invocation as invalid
- **AND** the system writes the error to `stderr`
- **AND** the system returns a non-zero exit code

### Requirement: Help Flags
The system SHALL support `--help` and `-h` as help flags.

#### Scenario: Long help flag is provided
- **WHEN** the user runs the command with `--help`
- **THEN** the system prints command help to `stdout`
- **AND** the system does not require a target path
- **AND** the system returns exit code `0`

#### Scenario: Short help flag is provided
- **WHEN** the user runs the command with `-h`
- **THEN** the system prints command help to `stdout`
- **AND** the system does not require a target path
- **AND** the system returns exit code `0`

### Requirement: Version Flags
The system SHALL support `--version` and `-v` as version flags.

#### Scenario: Long version flag is provided
- **WHEN** the user runs the command with `--version`
- **THEN** the system prints the CLI version to `stdout`
- **AND** the system does not require a target path
- **AND** the system returns exit code `0`

#### Scenario: Short version flag is provided
- **WHEN** the user runs the command with `-v`
- **THEN** the system prints the CLI version to `stdout`
- **AND** the system does not require a target path
- **AND** the system returns exit code `0`

### Requirement: Unsupported Update Flags In V1
The system SHALL reject `--update` and `-u` in v1 as unsupported options.

#### Scenario: Long update flag is provided
- **WHEN** the user runs the command with `--update`
- **THEN** the system reports that update mode is not available in v1
- **AND** the system writes the error to `stderr`
- **AND** the system returns a non-zero exit code

#### Scenario: Short update flag is provided
- **WHEN** the user runs the command with `-u`
- **THEN** the system reports that update mode is not available in v1
- **AND** the system writes the error to `stderr`
- **AND** the system returns a non-zero exit code

### Requirement: Target Validation
The system SHALL validate the supplied target path before deeper import map analysis begins.

#### Scenario: Target path does not exist
- **WHEN** the supplied target path does not exist
- **THEN** the system reports the target as missing
- **AND** the system writes the error to `stderr`
- **AND** the system returns a non-zero exit code

#### Scenario: Target path is not readable
- **WHEN** the supplied target path exists but cannot be read
- **THEN** the system reports the target as unreadable
- **AND** the system writes the error to `stderr`
- **AND** the system returns a non-zero exit code

#### Scenario: Target path is not supported in v1
- **WHEN** the supplied target path is not a supported HTML or import map JSON target
- **THEN** the system reports that the target type is unsupported
- **AND** the system writes the error to `stderr`
- **AND** the system returns a non-zero exit code

### Requirement: Check-Only Default Behavior
The system SHALL inspect targets without modifying them in v1.

#### Scenario: Updates are available
- **WHEN** the system finds upgrade candidates
- **THEN** the system reports the candidates to `stdout`
- **AND** the system does not modify the target file

#### Scenario: No updates are available
- **WHEN** the system completes analysis and finds no upgrade candidates
- **THEN** the system reports that no updates are available to `stdout`
- **AND** the system does not modify the target file

### Requirement: Output Streams
The system SHALL use standard output streams consistently for normal results and failures.

#### Scenario: Successful analysis completes
- **WHEN** the system completes a normal analysis run
- **THEN** the system writes its human-readable report to `stdout`

#### Scenario: Invocation error occurs
- **WHEN** the system rejects the command due to invalid arguments or unsupported options
- **THEN** the system writes the error to `stderr`

#### Scenario: Fatal processing error occurs
- **WHEN** the system cannot complete due to a fatal runtime or processing error
- **THEN** the system writes the error to `stderr`

### Requirement: Exit Code Semantics
The system SHALL treat update findings as a successful execution result.

#### Scenario: Updates are found
- **WHEN** the system completes successfully and identifies updates
- **THEN** the system returns exit code `0`

#### Scenario: No updates are found
- **WHEN** the system completes successfully and identifies no updates
- **THEN** the system returns exit code `0`

#### Scenario: Invalid invocation or fatal error occurs
- **WHEN** the system cannot complete due to invalid invocation, missing target, unreadable target, unsupported target, or other fatal error
- **THEN** the system returns a non-zero exit code

### Requirement: Help Output Content
The system SHALL provide concise help text for the supported v1 command surface.

#### Scenario: Help output is printed
- **WHEN** the system prints command help
- **THEN** the help text includes the expected positional target argument
- **AND** the help text describes supported target types at a high level
- **AND** the help text states or implies that v1 is check-only

### Requirement: Built-In CLI Implementation
The CLI implementation SHALL rely on Node.js built-ins for argument parsing and command dispatch in v1.

#### Scenario: CLI arguments are parsed
- **WHEN** the CLI parses arguments and selects command behavior in v1
- **THEN** the implementation uses Node.js built-in capabilities rather than third-party CLI parsing libraries

## Non-Goals

- Updating files in place
- Accepting multiple targets in one invocation
- Recursive project scanning
- JSON output
- Configuration file support
- Subcommands or multi-action CLI structure

## Open Questions

- Whether future versions should support multiple HTML and JSON targets in one invocation
- Whether future versions should support a default target lookup when no positional path is provided
