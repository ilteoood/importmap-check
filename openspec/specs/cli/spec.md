# CLI

## Purpose

Define the user-facing command contract for `esm-check-updates`.

## Requirements

### Requirement: Single-Command Invocation
The system SHALL expose a single-command CLI invoked as `esm-check-updates <target-path>`.

#### Scenario: One target path is provided
- **WHEN** the user runs `esm-check-updates <target-path>`
- **THEN** the system analyzes the referenced target file
- **AND** the system treats that file as the only target for the invocation

### Requirement: Positional Target Arity
The system SHALL require exactly one positional target path for normal execution.

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

### Requirement: Update Flag Arity And Mode Selection

The system SHALL accept `--update` / `-u` as a supported flag that selects update-rewrite mode and requires exactly one positional target path.

#### Scenario: Update flag is provided with exactly one target path
- **WHEN** the user runs the command with `--update` (or `-u`) and exactly one positional target path
- **THEN** the system proceeds in update-rewrite mode
- **AND** the system analyzes the target, rewrites updateable entries, and writes the file atomically
- **AND** the system prints the post-rewrite summary to `stdout`
- **AND** the system returns exit code `0` on success

#### Scenario: Update flag is provided without a target path
- **WHEN** the user runs the command with `--update` and no positional target path
- **THEN** the system rejects the invocation as invalid
- **AND** the system writes the error to `stderr`
- **AND** the system returns a non-zero exit code

#### Scenario: Update flag is provided with multiple target paths
- **WHEN** the user runs the command with `--update` and more than one positional target path
- **THEN** the system rejects the invocation as invalid
- **AND** the system writes the error to `stderr`
- **AND** the system returns a non-zero exit code

#### Scenario: Update flag coexists with sources or width flags
- **WHEN** the user runs the command with `--update --sources <target-path>` (with or without `--width`)
- **THEN** the system accepts the combination
- **AND** the system performs the update-rewrite
- **AND** the post-rewrite summary respects the `--sources` rendering rules

### Requirement: Dry-Run Flag And Mode Selection

The system SHALL accept `--dry-run` as a long-form-only flag (no short form) that selects a dry-run preview mode. Dry-run mode SHALL compute the update-mode rewrite plan and render it without modifying the target file. `--dry-run` SHALL be valid on its own (without `--update`), SHALL require exactly one positional target path, and SHALL return exit code `0` on success. When `--dry-run` and `--update` are both provided, `--dry-run` SHALL take precedence and the system SHALL NOT write the target file.

#### Scenario: Dry-run flag is provided with exactly one target path
- **WHEN** the user runs the command with `--dry-run` and exactly one positional target path
- **THEN** the system analyzes the target and computes the rewrite plan
- **AND** the system renders the plan as a unified diff preview to `stdout`
- **AND** the system does not modify the target file
- **AND** the system returns exit code `0` on success

#### Scenario: Dry-run flag is combined with the update flag
- **WHEN** the user runs the command with both `--dry-run` and `--update` (or `-u`) and exactly one positional target path
- **THEN** the system proceeds in dry-run mode
- **AND** the system does not modify the target file
- **AND** the system renders the unified diff preview to `stdout`

#### Scenario: Dry-run flag is provided without a target path
- **WHEN** the user runs the command with `--dry-run` and no positional target path
- **THEN** the system rejects the invocation as invalid
- **AND** the system writes the error to `stderr`
- **AND** the system returns a non-zero exit code

#### Scenario: Dry-run flag is provided with multiple target paths
- **WHEN** the user runs the command with `--dry-run` and more than one positional target path
- **THEN** the system rejects the invocation as invalid
- **AND** the system writes the error to `stderr`
- **AND** the system returns a non-zero exit code

#### Scenario: Dry-run coexists with sources or width flags
- **WHEN** the user runs the command with `--dry-run --sources <target-path>` (with or without `--width`)
- **THEN** the system accepts the combination
- **AND** the system renders the unified diff preview
- **AND** the `--sources` and `--width` flags have no effect on the dry-run output
- **AND** the system does not modify the target file

### Requirement: Unknown Flag Handling
The system SHALL reject unsupported CLI flags.

#### Scenario: Unknown flag is provided
- **WHEN** the user runs the command with a flag that is not supported
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

#### Scenario: Target path is not supported
- **WHEN** the supplied target path is not a supported HTML or import map JSON target
- **THEN** the system reports that the target type is unsupported
- **AND** the system writes the error to `stderr`
- **AND** the system returns a non-zero exit code

### Requirement: Check-Only Default Behavior
The system SHALL inspect targets without modifying them by default.

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
The system SHALL provide concise help text for the supported command surface, including the optional `--sources` and `--width <number>` flags, the supported `--update` / `-u` flag, and the `--dry-run` flag.

#### Scenario: Help output is printed
- **WHEN** the system prints command help
- **THEN** the help text includes the expected positional target argument
- **AND** the help text describes supported target types at a high level
- **AND** the help text states or implies that the default invocation is check-only
- **AND** the help text lists `--sources` with a description indicating it shows source entries in the report
- **AND** the help text lists `--width <number>` with a description indicating it overrides the available report width (used with `--sources`)
- **AND** the help text lists `--update` / `-u` with a description indicating it rewrites updateable entries in the target file in place
- **AND** the help text lists `--dry-run` with a description indicating it previews the rewrite as a diff without writing the target file

### Requirement: Built-In CLI Implementation
The CLI implementation SHALL rely on Node.js built-ins for argument parsing and command dispatch.

#### Scenario: CLI arguments are parsed
- **WHEN** the CLI parses arguments and selects command behavior
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

- Accepting multiple targets in one invocation
- Recursive project scanning
- JSON output
- Configuration file support
- Subcommands or multi-action CLI structure

## Open Questions

- Whether future versions should support multiple HTML and JSON targets in one invocation
- Whether future versions should support a default target lookup when no positional path is provided
