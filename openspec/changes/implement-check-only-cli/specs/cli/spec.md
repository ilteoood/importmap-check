## MODIFIED Requirements

### Requirement: Single-Command Invocation
The system SHALL expose a single-command CLI invoked as `esm-check-updates <target-path>` in v1.

#### Scenario: One target path is provided
- **WHEN** the user runs `esm-check-updates <target-path>`
- **THEN** the system treats that file as the only target for the invocation
- **AND** the system either begins analysis or reports a bootstrap fatal dispatch error when deeper analysis support is not implemented yet

### Requirement: Output Streams
The system SHALL use standard output streams consistently for normal results and failures.

#### Scenario: Successful analysis completes
- **WHEN** the system completes a normal analysis run
- **THEN** the system writes its human-readable report to `stdout`

#### Scenario: Invocation error occurs
- **WHEN** the system rejects the command due to invalid arguments or unsupported options
- **THEN** the system writes the error to `stderr`

#### Scenario: Fatal processing error occurs
- **WHEN** the system cannot complete due to a fatal runtime or processing error, including bootstrap dispatch before analysis support exists
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
- **WHEN** the system cannot complete due to invalid invocation, missing target, unreadable target, unsupported target, bootstrap dispatch before analysis support exists, or other fatal error
- **THEN** the system returns a non-zero exit code
