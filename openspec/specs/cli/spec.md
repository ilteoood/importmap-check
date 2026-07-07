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

### Requirement: Unknown Flag Handling
The system SHALL reject unsupported CLI flags in v1.

#### Scenario: Unknown flag is provided
- **WHEN** the user runs the command with a flag that is not supported in v1
- **THEN** the system rejects the invocation as invalid
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

### Requirement: CLI And Functional Code Separation
The system SHALL keep command-line orchestration in the published bin entrypoint and reserve `src/` for ESM/import map functional code.

#### Scenario: bootstrap CLI behavior is implemented
- **WHEN** argument parsing, help/version handling, exit code management, or target-path preflight validation is added or changed
- **THEN** that behavior is implemented in `bin/esm-check-updates.js`
- **AND** `src/` is not used as the home for command-line orchestration

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
The system SHALL provide concise help text for the supported v1 command surface, including the optional `--sources` and `--width <number>` flags.

#### Scenario: Help output is printed
- **WHEN** the system prints command help
- **THEN** the help text includes the expected positional target argument
- **AND** the help text describes supported target types at a high level
- **AND** the help text states or implies that v1 is check-only
- **AND** the help text lists `--sources` with a description indicating it shows source entries in the report
- **AND** the help text lists `--width <number>` with a description indicating it overrides the available report width (used with `--sources`)

### Requirement: Built-In CLI Implementation
The CLI implementation SHALL rely on Node.js built-ins for argument parsing and command dispatch in v1.

#### Scenario: CLI arguments are parsed
- **WHEN** the CLI parses arguments and selects command behavior in v1
- **THEN** the implementation uses Node.js built-in capabilities rather than third-party CLI parsing libraries

### Requirement: Sources Flag
The system SHALL support a `--sources` flag that opts the user into rendering an additional Source column in the terminal report.

#### Scenario: Sources flag is provided
- **WHEN** the user runs the command with `--sources <target-path>`
- **THEN** the system enables the Source column in the report
- **AND** the system renders the report with the additional Source column
- **AND** the system does not modify the target file

#### Scenario: Sources flag is omitted
- **WHEN** the user runs the command without `--sources`
- **THEN** the system renders the report without the Source column
- **AND** the system does not perform width-aware rendering
- **AND** the report output is byte-identical to the output the same invocation would produce without this capability

### Requirement: Width Override Flag
The system SHALL support a `--width <number>` flag that overrides the available width used for width-aware rendering when `--sources` is also provided.

#### Scenario: Width and sources are both provided with a valid number
- **WHEN** the user runs the command with `--sources --width 100 <target-path>`
- **THEN** the system uses `100` as the available width for the Source column rendering
- **AND** the system does not read `process.stdout.columns`

#### Scenario: Width is provided with an invalid value
- **WHEN** the user runs the command with `--width abc` or `--width 0` or `--width 39`
- **THEN** the system rejects the invocation as invalid
- **AND** the system writes the error to `stderr`
- **AND** the system returns a non-zero exit code

#### Scenario: Width is provided without sources
- **WHEN** the user runs the command with `--width 100 <target-path>` but not `--sources`
- **THEN** the system accepts the flag
- **AND** the system does not perform width-aware rendering
- **AND** the system renders the default report without the Source column

### Requirement: Width Determination Precedence
When `--sources` is provided, the system SHALL determine the available width by preferring an explicit `--width` flag, then `process.stdout.columns`, then a `120` column fallback.

#### Scenario: Explicit width overrides terminal width
- **WHEN** the user provides `--width 100 --sources` and `process.stdout.columns` is `200`
- **THEN** the system uses `100` as the available width

#### Scenario: Terminal width is used when no explicit width is given
- **WHEN** the user provides `--sources` without `--width` and `process.stdout.columns` is a positive integer
- **THEN** the system uses `process.stdout.columns` as the available width

#### Scenario: Fallback width is used when terminal width is unavailable
- **WHEN** the user provides `--sources` without `--width` and `process.stdout.columns` is `undefined` or `0`
- **THEN** the system uses `120` as the available width

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
