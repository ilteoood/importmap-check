# Import Map Input

## Purpose

Define the import map input surface that `esm-check-updates` v1 is required to understand.

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
- **AND** the system inspects supported mappings across all extracted inline import maps for update analysis

#### Scenario: HTML file does not contain a supported inline import map
- **WHEN** the target HTML file does not contain a supported inline import map script element
- **THEN** the system reports that no supported import map was found
- **AND** the system returns a non-zero exit code

### Requirement: Imports Section Support
The system SHALL inspect entries in the top-level `imports` section in v1.

#### Scenario: Imports section is present
- **WHEN** the import map contains an `imports` object
- **THEN** the system inspects entries in that object for supported CDN-backed mappings

#### Scenario: Imports section is absent
- **WHEN** the import map does not contain an `imports` object
- **THEN** the system reports that no supported import entries were found

### Requirement: Scopes Handling
The system SHALL treat import map `scopes` as recognized but not yet supported in v1.

#### Scenario: Scopes are present in an import map
- **WHEN** the import map contains a top-level `scopes` object
- **THEN** the system warns that `scopes` are not yet supported
- **AND** the system continues processing supported `imports` entries

### Requirement: CDN-Backed Mapping Detection
The system SHALL treat CDN-backed import entries as in scope for update analysis when their URL format is supported.

#### Scenario: Supported CDN-backed mapping is present
- **WHEN** an import entry value matches a supported CDN URL format
- **THEN** the system includes that entry in update analysis

#### Scenario: Non-CDN mapping is present
- **WHEN** an import entry value is a local path, same-origin path, or other non-CDN mapping
- **THEN** the system excludes that entry from update analysis

### Requirement: Parse Issue Reporting
The system SHALL report mappings that appear in scope but cannot be fully parsed for package and version validation.

#### Scenario: Version or package cannot be parsed from supported CDN form
- **WHEN** an entry points to a supported CDN family but the package identity or pinned version cannot be determined
- **THEN** the system reports the entry as unparseable or non-versioned
- **AND** the system does not silently treat the entry as up-to-date

## Non-Goals

- External HTML import map references
- Full HTML parsing beyond supported inline import map extraction
- Exhaustive support for every import map feature

## Open Questions

- Whether later versions should accept external import map references from HTML
- Whether later versions should support `scopes` with distinct reporting behavior
