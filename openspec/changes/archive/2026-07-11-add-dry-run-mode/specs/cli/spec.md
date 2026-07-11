## ADDED Requirements

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

## MODIFIED Requirements

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
