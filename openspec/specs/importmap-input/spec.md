# Import Map Input

## Purpose

Define the import map input surface that `importmap-check` is required to understand.

## Requirements

### Requirement: Standalone Import Map JSON Support
The system SHALL support standalone JSON files that contain a browser import map.

#### Scenario: Import map JSON file is valid
- **WHEN** the target file is a valid JSON import map document
- **THEN** the system reads the import map data from the file
- **AND** the system inspects supported mappings for update analysis

#### Scenario: Import map JSON file is malformed
- **WHEN** the target file cannot be parsed as valid JSON
- **THEN** the system reports the parse failure
- **AND** the system returns a non-zero exit code

### Requirement: Inline HTML Import Map Support
The system SHALL support HTML files that contain an inline `<script type="importmap">` element.

#### Scenario: HTML file contains a supported inline import map
- **WHEN** the target HTML file contains an inline import map script element
- **THEN** the system extracts the import map JSON from that element
- **AND** the system inspects supported mappings for update analysis

#### Scenario: HTML file contains multiple supported inline import maps
- **WHEN** the target HTML file contains two or more inline import map script elements
- **THEN** the system extracts each supported inline import map
- **AND** the system preserves the source provenance of each extracted import map
- **AND** the system inspects supported mappings across the combined extracted import maps for update analysis

#### Scenario: HTML file does not contain a supported inline import map
- **WHEN** the target HTML file does not contain a supported inline import map script element
- **THEN** the system reports that no supported import map was found
- **AND** the system returns a non-zero exit code

### Requirement: Imports Section Support
The system SHALL inspect entries in the top-level `imports` section.

#### Scenario: Imports section is present
- **WHEN** the import map contains an `imports` object
- **THEN** the system inspects entries in that object for supported CDN-backed mappings

#### Scenario: Imports section is absent
- **WHEN** the import map does not contain an `imports` object
- **THEN** the system reports that no supported import entries were found

### Requirement: Import Entry Classification
The system SHALL classify supported import-map entries by key shape so it can distinguish dependency-style entries from remap-style entries.

#### Scenario: package-style key is encountered
- **WHEN** an `imports` entry key is a bare package specifier, scoped package specifier, package subpath specifier, or package-prefix specifier such as `react/`
- **THEN** the system treats that entry as a dependency-style mapping
- **AND** the system preserves the original key as reporting context

#### Scenario: URL-like or path-like key is encountered
- **WHEN** an `imports` entry key is an absolute URL, relative path, absolute path, parent-relative path, or similar remap-oriented path key
- **THEN** the system treats that entry as a remap-style mapping
- **AND** the system does not treat the key itself as a package identity source

#### Scenario: remap-style key points to a supported CDN destination
- **WHEN** a remap-style key maps to a supported CDN-backed destination value
- **THEN** the system includes that entry in update analysis using the destination value for package and version extraction

#### Scenario: remap-style key points to a non-CDN destination
- **WHEN** a remap-style key maps to a local path, same-origin path, or other non-CDN destination value
- **THEN** the system excludes that entry from update analysis

### Requirement: Scopes Handling
The system SHALL treat import map `scopes` as recognized but not yet supported.

#### Scenario: Scopes are present in an import map
- **WHEN** the import map contains a top-level `scopes` object
- **THEN** the system warns that `scopes` are not yet supported
- **AND** the system continues processing supported `imports` entries

### Requirement: CDN-Backed Mapping Detection
The system SHALL treat CDN-backed import entries as in scope for update analysis when their URL format is supported.

#### Scenario: Supported CDN-backed mapping is present
- **WHEN** an import entry value matches a supported CDN URL format
- **THEN** the system includes that entry in update analysis

#### Scenario: supported CDN families are encountered
- **WHEN** an import entry value points to `jsdelivr` or `esm.sh`
- **THEN** the system treats that entry as belonging to a supported CDN family

#### Scenario: Non-CDN mapping is present
- **WHEN** an import entry value is a local path, same-origin path, or other non-CDN mapping
- **THEN** the system excludes that entry from update analysis

### Requirement: Parse Issue Reporting
The system SHALL report mappings that appear in scope but cannot be fully parsed for package and version validation.

#### Scenario: Version or package cannot be parsed from supported CDN form
- **WHEN** an entry points to a supported CDN family but the package identity or pinned version cannot be determined
- **THEN** the system reports the entry as unparseable or non-versioned as a warning
- **AND** the system does not silently treat the entry as up-to-date
- **AND** the system does not fail the overall check solely because of that warning

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

### Requirement: Import Map Reference Comments
The implementation SHALL include code comments with authoritative document links where available for import map behaviors derived from external specifications or browser-facing format rules.

#### Scenario: Import map behavior is implemented from documented external rules
- **WHEN** the implementation adds or maintains logic for import map parsing, validation, or supported structure handling based on an external standard or authoritative reference
- **THEN** the relevant code includes a concise comment with a link to that authoritative document when such a document exists

## Non-Goals

- External HTML import map references
- Full HTML parsing beyond supported inline import map extraction
- Exhaustive support for every import map feature

## Open Questions

- Whether later versions should accept external import map references from HTML
- Whether later versions should support `scopes` with distinct reporting behavior
