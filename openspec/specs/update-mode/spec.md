# Update Mode

## Purpose

Define the update-rewrite behavior for `esm-check-updates` when invoked with `--update` / `-u`. Update mode transforms an in-scope target file in place by rewriting the destination URL of each updateable analyzed entry, using an atomic write, while preserving the entry's original specifier style and surfacing any integrity entries that must be reconsidered.

## Requirements

### Requirement: Atomic Target File Write

The system SHALL write update-mode output to the target file atomically so that an interrupted update cannot leave a half-written file.

#### Scenario: Update write succeeds
- **WHEN** the system completes a successful rewrite of the target content
- **THEN** the system writes the new content to a temporary file in the same directory as the target
- **AND** the system atomically moves the temporary file onto the target path via `rename`
- **AND** the temporary file is removed if the move fails or the write step throws

#### Scenario: Update write is interrupted
- **WHEN** the process is interrupted during the write step
- **THEN** the target file retains its pre-rewrite content
- **AND** no temporary file remains in the target directory after the process exits

#### Scenario: Target file is read-only
- **WHEN** the user invokes `--update` against a target file the process cannot write to
- **THEN** the system reports the write failure to `stderr`
- **AND** the system returns a non-zero exit code
- **AND** the system does not modify the target file

### Requirement: Specifier-Preserving Entry Rewrite

The system SHALL rewrite each updateable analyzed entry in the target file by substituting the new destination URL string in place while preserving the entry's original specifier style, except for the dist-tag class which is not rewritten in this change. The new specifier SHALL be computed by applying the npm semver locking rules for the prefix (`^` locks the leftmost non-zero element, `~` locks everything except the rightmost-specified position) and using the analyzer's resolved `latestVersion` as the new floor that preserves the same locked-position semantics.

#### Scenario: Pinned entry is bumped to latest
- **WHEN** an entry uses a concrete pinned specifier such as `react@19.2.3` and the analyzer reports an available update to `19.3.0`
- **THEN** the system rewrites the entry's destination URL to use `react@19.3.0`
- **AND** the system preserves every other portion of the original destination URL (cdn family, scoped package name, subpath, and query parameters; rewriting `?deps=` values is out of scope for this change)

#### Scenario: Caret range floor is lifted to new major
- **WHEN** an entry uses a caret range specifier such as `react@^19.2.3` and the analyzer reports `latest` is `20.0.0`
- **THEN** the system rewrites the entry's destination URL to use `react@^20.0.0`
- **AND** the system preserves the caret prefix

#### Scenario: Tilde range floor is lifted within the same major when latest crosses the locked minor
- **WHEN** an entry uses a tilde range specifier such as `react@~19.2.3` and the analyzer reports `latest` is `19.3.0`
- **THEN** the system rewrites the entry's destination URL to use `react@~19.3.0`
- **AND** the system preserves the tilde prefix
- **AND** the rewrite stays within the same major

#### Scenario: Tilde range floor is lifted across majors
- **WHEN** an entry uses a tilde range specifier such as `react@~19.2.3` and the analyzer reports `latest` is `20.0.0`
- **THEN** the system rewrites the entry's destination URL to use `react@~20.0.0`
- **AND** the system preserves the tilde prefix

#### Scenario: Major-only selector is moved to latest major
- **WHEN** an entry uses a major-only selector such as `react@18` and the analyzer reports `latest` is `19.3.0`
- **THEN** the system rewrites the entry's destination URL to use `react@19`
- **AND** the system does not promote the selector to a minor or pinned form

#### Scenario: Minor-only selector is moved to latest major.minor
- **WHEN** an entry uses a minor-only selector such as `react@18.3` and the analyzer reports `latest` is `19.3.0`
- **THEN** the system rewrites the entry's destination URL to use `react@19.3`
- **AND** the system does not promote the selector to a pinned form

#### Scenario: Caret range on a 0.x package lifts when latest crosses the locked minor
- **WHEN** an entry uses a caret range specifier on a major-version-zero package such as `react@^0.1.0` and the analyzer reports `latest` is `0.2.5`
- **THEN** the rewritten entry uses `react@^0.2.0` as the new specifier
- **AND** the caret prefix is preserved
- **AND** the rewrite lifts the locked-minor position from 0.1 to 0.2 per npm's "0.x changes are breaking" rule

#### Scenario: Caret range on a 0.0.x package lifts only the locked patch position
- **WHEN** an entry uses a caret range specifier on a major-version-zero-zero package such as `react@^0.0.3` and the analyzer reports `latest` is `0.0.5`
- **THEN** the rewritten entry uses `react@^0.0.5` as the new specifier
- **AND** the caret prefix is preserved
- **AND** the rewrite stays within the 0.0.x minor window per npm's `^0.0.z := >=0.0.z <0.0(z+1)` rule
- **AND** the rewrite does not silently broaden the range to admit 0.1.x or higher

#### Scenario: Caret range on a 0.0.x package promotes to minor-locked when latest crosses into 0.1.x
- **WHEN** an entry uses a caret range specifier such as `react@^0.0.3` and the analyzer reports `latest` is `0.1.0`
- **THEN** the rewritten entry uses `react@^0.1.0` as the new specifier
- **AND** the rewrite lifts the locked position one level from patch to minor because no `^0.0.z` form can admit `0.1.0`

#### Scenario: Caret range on a 0.0.x package falls through to major 1 when latest has crossed majors
- **WHEN** an entry uses a caret range specifier such as `react@^0.0.3` and the analyzer reports `latest` is `1.0.0`
- **THEN** the rewritten entry uses `react@^1.0.0` as the new specifier
- **AND** the rewrite crosses all the way to major-major-locked semantics as a normal cross-major range lift

#### Scenario: Tilde range on a 0.x package lifts when latest crosses the locked minor
- **WHEN** an entry uses a tilde range specifier such as `react@~0.2.3` and the analyzer reports `latest` is `0.3.0`
- **THEN** the rewritten entry uses `react@~0.3.0` as the new specifier
- **AND** the tilde prefix is preserved

#### Scenario: Tilde range on a 0.0.x package follows npm quirk and lifts only the locked patch position
- **WHEN** an entry uses a tilde range specifier such as `react@~0.0.3` and the analyzer reports `latest` is `0.0.5`
- **THEN** the rewritten entry uses `react@~0.0.5` as the new specifier
- **AND** the tilde prefix is preserved
- **AND** the rewrite stays within the 0.0.x minor window per npm's quirk where `~0.0.z := >=0.0.z <0.0(z+1)`

#### Scenario: Tilde range on a 0.0.x package promotes to minor-locked when latest crosses into 0.1.x
- **WHEN** an entry uses a tilde range specifier such as `react@~0.0.3` and the analyzer reports `latest` is `0.1.0`
- **THEN** the rewritten entry uses `react@~0.1.0` as the new specifier
- **AND** the rewrite lifts the locked position one level from patch to minor

#### Scenario: A range entry with no `hasUpdate` is not rewritten
- **WHEN** the analyzer reports `hasUpdate=false` for a range entry whose `latest` already satisfies the current range
- **THEN** the system does not rewrite the entry's destination URL
- **AND** the post-rewrite summary omits the entry from the rewritten-row list

#### Scenario: Dist-tag entry is not rewritten
- **WHEN** an entry uses a dist-tag specifier such as `react@beta` or `react@latest`
- **THEN** the system does not rewrite the entry's destination URL
- **AND** the system preserves any existing informational note about the entry's floating behavior
- **AND** the post-rewrite summary continues to surface the entry as informational

#### Scenario: Entry has no available update
- **WHEN** an entry's resolved current version already equals the analyzer's `latestVersion`
- **THEN** the system does not rewrite the entry's destination URL
- **AND** the post-rewrite summary omits the entry from the rewritten-row list

#### Scenario: Rewrite target preserves URL encoding style
- **WHEN** the original destination URL encodes a specifier such as `%5E19.2.3` for `^19.2.3`
- **THEN** the system rewrites the URL using the same encoding style as the original
- **AND** the system does not mix encoded and decoded forms in a single rewrite

#### Scenario: Multiple occurrences of the same package are rewritten consistently
- **WHEN** multiple import-map entries resolve to the same package identity and each has an available update
- **THEN** the system rewrites every occurrence to the same new specifier
- **AND** the post-rewrite summary lists the package once with the shared before/after specifier

#### Scenario: Destination-skewed occurrences are rewritten independently
- **WHEN** multiple occurrences of the same package resolve through different supported CDN families or different current versions and each has an available update
- **THEN** the system rewrites each occurrence independently per its own captured `destinationUrl`
- **AND** the post-rewrite summary continues to surface the destination-skew warning alongside the rewritten rows

### Requirement: Updateable Entry Boundary

The system SHALL only rewrite destination URL strings captured during analysis and SHALL avoid corrupting URL substrings or unrelated content during the rewrite pass.

#### Scenario: Shorter destination URL is a substring of a longer destination URL
- **WHEN** one entry's destination URL string is a substring of another entry's destination URL string
- **THEN** the system rewrites each destination URL only at whole-value boundaries
- **AND** the system does not accidentally rewrite the longer URL when targeting the shorter one

#### Scenario: Destination URL appears outside import map values
- **WHEN** the destination URL string appears in HTML or JSON content outside an import map value captured during analysis
- **THEN** the system does not rewrite those occurrences
- **AND** the rewrite target is limited to the import map values captured during analysis

#### Scenario: `?deps=` query pin inside a destination URL is not rewritten
- **WHEN** a destination URL carries a `?deps=<pkg>@<version>` query pin whose package the analyzer resolved to a newer version
- **THEN** the system does not rewrite the `?deps=` pin's version in this change
- **AND** the outer package's rewrite targets only the outer `<pkg>@<version>` position in the URL path (before any `?` query string)
- **AND** the outer rewrite does not accidentally overwrite the `?deps=` position

### Requirement: Integrity Strip on Rewrite

When `--update` rewrites a destination URL, the system SHALL remove any import map `integrity` entry keyed to either the original or rewritten URL, and SHALL emit a hard warning naming each stripped URL. The system SHALL NOT compute or write replacement integrity hashes in this change.

#### Scenario: Integrity entry exists for a rewritten URL
- **WHEN** the import map contains an `integrity` entry keyed to a destination URL that gets rewritten by `--update`
- **THEN** the system removes that `integrity` entry from the rewritten file
- **AND** the system emits a hard warning naming the stripped URL and the package that triggered the strip
- **AND** the warning appears in the post-rewrite summary's stripped-integrity subsection

#### Scenario: Integrity entry exists for an unrewritten URL
- **WHEN** the import map contains an `integrity` entry keyed to a destination URL that is not rewritten by `--update`
- **THEN** the system leaves that `integrity` entry in place
- **AND** the system does not emit a warning for that entry

#### Scenario: No integrity entry exists for a rewritten URL
- **WHEN** the import map does not contain an `integrity` entry keyed to a rewritten destination URL
- **THEN** the system does not emit a warning
- **AND** the post-rewrite summary does not include the stripped-integrity subsection

#### Scenario: Integrity regeneration is not performed in this change
- **WHEN** the system strips an `integrity` entry for a rewritten URL
- **THEN** the system does not attempt to compute or write a replacement integrity hash
- **AND** the user is responsible for re-pinning SRI externally after validating the new URL
