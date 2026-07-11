## ADDED Requirements

### Requirement: Unified Diff Rendering

The system SHALL render the dry-run preview as a unified line diff of the target file's pre-rewrite content against its would-be-written content. The diff SHALL use standard unified-diff structure — `--- ` and `+++ ` file headers, `@@ -<start>,<count> +<start>,<count> @@` hunk headers with correct 1-based line numbers, and surrounding context lines — with nearby changes coalesced into a single hunk. The diff SHALL be computed from the actual would-be-written content rather than derived from the rewrite list alone, so line removals (such as stripped integrity entries) appear as removed lines.

#### Scenario: Changed entries render as removed and added lines
- **WHEN** the dry-run preview renders a target with rewritten destination URLs
- **THEN** each changed line appears as a removed (`-`) line followed by its added (`+`) replacement
- **AND** the diff includes surrounding context lines around each change
- **AND** each hunk carries a header with correct source and target line numbers

#### Scenario: Stripped integrity entry appears as a removed line
- **WHEN** the dry-run preview renders a target where an `integrity` entry would be stripped
- **THEN** the removed integrity line appears as a removed (`-`) line in the diff

#### Scenario: Adjacent changes coalesce into one hunk
- **WHEN** multiple changed lines fall within one another's context window
- **THEN** the system renders them within a single hunk rather than separate hunks

#### Scenario: Diff color follows the existing color treatment
- **WHEN** the dry-run preview renders with color enabled
- **THEN** removed lines, added lines, and hunk headers are colorized consistently with the existing report color treatment
- **WHEN** color is disabled via `NO_COLOR` or a non-TTY stream
- **THEN** the diff output contains no color escape sequences

### Requirement: Dry-Run Preview Banner And Ancillary Sections

The dry-run preview SHALL begin with a banner indicating that no files were written, followed by the unified diff, followed by the same ancillary sections the update summary emits: `Warnings`, `Stripped integrity entries`, `Lookup Failures`, and `Notes`. The unified diff replaces only the package before/after rows of the update summary; the ancillary sections SHALL be carried through unchanged. When there are no changes to preview, the system SHALL state that no changes would be written and still emit the applicable ancillary sections.

#### Scenario: Preview leads with a no-write banner
- **WHEN** the system renders a dry-run preview
- **THEN** the output begins with a banner indicating that no files were written

#### Scenario: Ancillary sections accompany the diff
- **WHEN** the analyzer produced warnings, notes, lookup failures, or stripped-integrity entries for a target with previewable changes
- **THEN** the preview renders those sections after the unified diff
- **AND** the sections match the content the update summary would emit for the same run

#### Scenario: No previewable changes
- **WHEN** the system renders a dry-run preview for a target with no updateable entries
- **THEN** the output states that no changes would be written
- **AND** the output still includes any applicable `Warnings`, `Lookup Failures`, or `Notes` sections
- **AND** the output does not include a unified diff
