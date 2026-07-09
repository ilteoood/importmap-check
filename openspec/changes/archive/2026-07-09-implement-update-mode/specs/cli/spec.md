## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Unsupported Update Flags In V1

**Reason:** Update mode is now supported in this change via the new `update-mode` capability. The flag is no longer rejected.
**Migration:** Callers who currently experience the v1 rejection error should switch to `esm-check-updates --update <target-path>` to perform an in-place rewrite, or omit `--update` to retain check-only behavior.

## MODIFIED Requirements

### Requirement: Help Output Content
The system SHALL provide concise help text for the supported command surface, including the optional `--sources` and `--width <number>` flags and the supported `--update` / `-u` flag.

#### Scenario: Help output is printed
- **WHEN** the system prints command help
- **THEN** the help text includes the expected positional target argument
- **AND** the help text describes supported target types at a high level
- **AND** the help text states or implies that the default invocation is check-only
- **AND** the help text lists `--sources` with a description indicating it shows source entries in the report
- **AND** the help text lists `--width <number>` with a description indicating it overrides the available report width (used with `--sources`)
- **AND** the help text lists `--update` / `-u` with a description indicating it rewrites updateable entries in the target file in place