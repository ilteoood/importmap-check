# cli Spec Delta — add-source-column

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Help Output Content
The system SHALL provide concise help text for the supported v1 command surface, including the optional `--sources` and `--width <number>` flags.

#### Scenario: Help output is printed
- **WHEN** the system prints command help
- **THEN** the help text includes the expected positional target argument
- **AND** the help text describes supported target types at a high level
- **AND** the help text states or implies that v1 is check-only
- **AND** the help text lists `--sources` with a description indicating it shows source entries in the report
- **AND** the help text lists `--width <number>` with a description indicating it overrides the available report width (used with `--sources`)