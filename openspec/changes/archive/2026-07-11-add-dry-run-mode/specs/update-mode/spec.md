## ADDED Requirements

### Requirement: Dry-Run Preview Without Write

When invoked in dry-run mode, the system SHALL compute the rewrite plan using the same computation as `--update` — the same set of updateable entries, the same specifier-preserving rewrites, and the same integrity entries flagged for stripping — but SHALL NOT modify the target file. The system SHALL derive the previewed changes from the actual would-be-written content so the preview cannot diverge from what `--update` would write.

#### Scenario: Dry-run computes the same plan as update mode
- **WHEN** the system runs in dry-run mode against a target with updateable entries
- **THEN** the system computes the identical set of rewrites and stripped-integrity entries that `--update` would apply to the same target
- **AND** the system derives the preview from the same would-be-written content that `--update` would produce

#### Scenario: Dry-run leaves the target file unmodified
- **WHEN** the system completes a dry-run against any target
- **THEN** the target file's content is byte-for-byte identical to its pre-run content
- **AND** the system does not create, move, or leave behind any temporary file in the target directory

#### Scenario: Dry-run against a target with no available updates
- **WHEN** the system runs in dry-run mode against a target that has no updateable entries
- **THEN** the system reports that no changes would be written
- **AND** the system does not modify the target file
- **AND** the system returns exit code `0`

#### Scenario: Dry-run surfaces integrity entries that would be stripped
- **WHEN** the system runs in dry-run mode against a target where a rewrite would strip an `integrity` entry
- **THEN** the preview reflects the removal of that integrity entry
- **AND** the system surfaces the stripped-integrity warning naming the affected URL and triggering package
- **AND** the system does not modify the target file
