# Update Mode

## Purpose

Define the update-rewrite behavior for `importmap-check` when invoked with `--update` / `-u`. Update mode transforms an in-scope target file in place by rewriting the destination URL of each updateable analyzed entry, using an atomic write, while preserving the entry's original specifier style and surfacing any integrity entries that must be reconsidered.

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

The system SHALL rewrite each updateable analyzed entry in the target file by substituting the new destination URL string in place while preserving the entry's original specifier style, except for the dist-tag class, which is not rewritten. The new specifier SHALL be computed by applying the npm semver locking rules for the prefix (`^` locks the leftmost non-zero element, `~` locks everything except the rightmost-specified position) and using the analyzer's resolved `latestVersion` as the new floor that preserves the same locked-position semantics.

#### Scenario: Pinned entry is bumped to latest
- **WHEN** an entry uses a concrete pinned specifier such as `react@19.2.3` and the analyzer reports an available update to `19.3.0`
- **THEN** the system rewrites the entry's destination URL to use `react@19.3.0`
- **AND** the system preserves every other portion of the original destination URL (cdn family, scoped package name, subpath, and non-`deps` query parameters), while any updateable `?deps=` pins on the same URL are rewritten per the Deps Query Pin Rewrite requirement

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

### Requirement: Deps Query Pin Rewrite

When `--update` rewrites a target, the system SHALL rewrite each updateable `?deps=` query pin in an esm.sh destination URL using the same specifier-class rules applied to outer packages (pinned, caret, tilde, major-only selector, minor-only selector), while preserving the query string's dependency order, separators, and per-token encoding. The system SHALL rewrite a dependency pin by splicing the individual dependency token's version in place within the raw query string, and SHALL NOT re-serialize the query string through a URL query parser. Dist-tag dependency pins SHALL NOT be rewritten, matching outer dist-tag behavior.

#### Scenario: Pinned dependency pin is bumped to latest
- **WHEN** an esm.sh URL carries a query pin such as `?deps=react@18.2.0` and the analyzer reports an available update for `react` to `19.3.0`
- **THEN** the system rewrites the dependency token in place to `react@19.3.0`
- **AND** the system preserves every other portion of the URL (outer package, path, and the rest of the query string)

#### Scenario: Range dependency pin is rewritten by specifier class
- **WHEN** an esm.sh URL carries a query pin such as `?deps=scheduler@^0.23.0` and the analyzer reports `latest` for `scheduler` is `0.24.1`
- **THEN** the system rewrites the dependency token to `scheduler@^0.24.0` using the same caret locking rules applied to outer packages
- **AND** the system preserves the caret prefix and the dependency's position in the query string

#### Scenario: Scoped dependency pin is rewritten
- **WHEN** an esm.sh URL carries a query pin such as `?deps=@scope/pkg@1.2.3` and the analyzer reports an available update for `@scope/pkg`
- **THEN** the system rewrites only the version token following the scoped package name
- **AND** the system preserves the `@scope/` prefix

#### Scenario: Dependency order and separators are preserved
- **WHEN** an esm.sh URL carries a multi-dependency query pin such as `?deps=react@18.2.0,scheduler@0.23.0` and only `react` has an available update
- **THEN** the rewritten query string is `?deps=react@19.3.0,scheduler@0.23.0`
- **AND** the comma separator, the ordering, and the unchanged `scheduler` token are preserved exactly

#### Scenario: Dependency pin encoding style is preserved
- **WHEN** a dependency pin's version is percent-encoded in the original query string (for example `%5E0.23.0` for `^0.23.0`)
- **THEN** the system rewrites the dependency token using the same encoding style as the original
- **AND** the system does not re-serialize or re-encode the rest of the query string

#### Scenario: Dist-tag dependency pin is not rewritten
- **WHEN** an esm.sh URL carries a dist-tag dependency pin such as `?deps=react@beta`
- **THEN** the system does not rewrite the dependency token
- **AND** the system leaves the query string unchanged

#### Scenario: Dependency pin with no available update is not rewritten
- **WHEN** a dependency pin's resolved current version already equals the analyzer's `latestVersion` for that package
- **THEN** the system does not rewrite the dependency token
- **AND** the post-rewrite summary omits the dependency from the rewritten-row list

### Requirement: Coalesced Multi-Edit URL Rewrite

The system SHALL coalesce every rewrite that applies to a single destination URL — an outer package version bump and any number of `?deps=` dependency bumps that share that URL — into a single URL substitution, so that all applicable edits appear together in the rewritten file. The system SHALL NOT drop or overwrite one edit when another edit targets the same URL string.

#### Scenario: Outer package and its dependency pins update together
- **WHEN** an esm.sh URL such as `https://esm.sh/react-dom@19.2.3?deps=react@18.2.0,scheduler@0.23.0` has available updates for `react-dom`, `react`, and `scheduler`
- **THEN** the system produces one rewritten URL that applies all three edits together
- **AND** the outer `react-dom` version, the `react` dependency pin, and the `scheduler` dependency pin are all updated in the single rewritten value

#### Scenario: Only some edits on a shared URL apply
- **WHEN** a destination URL has an available update for its outer package but not for one of its `?deps=` pins
- **THEN** the system rewrites the outer package version and leaves the unchanged dependency pin intact within the same rewritten URL

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

#### Scenario: `?deps=` query pin inside a destination URL is rewritten in place
- **WHEN** a destination URL carries a `?deps=<pkg>@<version>` query pin whose package the analyzer resolved to a newer version
- **THEN** the system rewrites the `?deps=` pin's version in place per the Deps Query Pin Rewrite requirement
- **AND** the outer package's rewrite targets only the outer `<pkg>@<version>` position in the URL path (before any `?` query string)
- **AND** the outer rewrite and the `?deps=` rewrites are coalesced into a single substitution for the shared URL so no edit overwrites another

### Requirement: Integrity Strip on Rewrite

When `--update` rewrites a destination URL, the system SHALL remove any import map `integrity` entry keyed to either the original or rewritten URL, and SHALL emit a hard warning naming each stripped URL. The system SHALL NOT compute or write replacement integrity hashes. This applies whether the URL change originates from an outer package rewrite, a `?deps=` dependency pin rewrite, or both.

#### Scenario: Integrity entry exists for a rewritten URL
- **WHEN** the import map contains an `integrity` entry keyed to a destination URL that gets rewritten by `--update`
- **THEN** the system removes that `integrity` entry from the rewritten file
- **AND** the system emits a hard warning naming the stripped URL and the package that triggered the strip
- **AND** the warning appears in the post-rewrite summary's stripped-integrity subsection

#### Scenario: Integrity entry exists for a URL whose only change is a `?deps=` pin
- **WHEN** the import map contains an `integrity` entry keyed to a destination URL whose only rewrite is to one of its `?deps=` dependency pins
- **THEN** the system removes that `integrity` entry because the URL's bytes change
- **AND** the system emits a hard warning naming the stripped URL

#### Scenario: Integrity entry exists for an unrewritten URL
- **WHEN** the import map contains an `integrity` entry keyed to a destination URL that is not rewritten by `--update`
- **THEN** the system leaves that `integrity` entry in place
- **AND** the system does not emit a warning for that entry

#### Scenario: No integrity entry exists for a rewritten URL
- **WHEN** the import map does not contain an `integrity` entry keyed to a rewritten destination URL
- **THEN** the system does not emit a warning
- **AND** the post-rewrite summary does not include the stripped-integrity subsection

#### Scenario: Integrity regeneration is not performed
- **WHEN** the system strips an `integrity` entry for a rewritten URL
- **THEN** the system does not attempt to compute or write a replacement integrity hash
- **AND** the user is responsible for re-pinning SRI externally after validating the new URL

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
