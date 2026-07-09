## MODIFIED Requirements

### Requirement: Integrity Awareness
The system SHALL recognize top-level import map `integrity` metadata across check-only and update modes: in check-only mode the system records or reports a note when an analyzed mapping would require integrity reconsideration on a future rewrite, and in update mode the system delegates the actual strip-and-warn behavior to the `update-mode` capability's `Integrity Strip on Rewrite` requirement.

#### Scenario: integrity metadata is present without an implicated URL change in check-only mode
- **WHEN** an import map contains top-level `integrity` metadata in check-only mode but no analyzed mapping would require a URL change
- **THEN** the system does not block analysis on that basis alone

#### Scenario: integrity metadata would be implicated by a future URL rewrite in check-only mode
- **WHEN** an analyzed mapping is associated with top-level `integrity` metadata that would need reconsideration if the destination URL changed
- **THEN** the system records or reports a note suitable for future update-mode handling

#### Scenario: integrity entry is keyed to a rewritten URL in update mode
- **WHEN** the user invokes `--update` and the system rewrites a destination URL whose original or rewritten form appears as a key in the import map `integrity` section
- **THEN** the system strips and warns per the `Integrity Strip on Rewrite` requirement in the `update-mode` capability
- **AND** the importmap-input capability itself does not define the strip semantics