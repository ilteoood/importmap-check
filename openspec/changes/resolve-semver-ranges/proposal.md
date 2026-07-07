## Why

`esm-check-updates` currently rejects semver ranges, major-only selectors, minor-only selectors, and dist-tags (e.g. `@18`, `@^19.2.3`, `@latest`, `@beta`) with warnings, even though these are common patterns in import maps and the npm registry provides authoritative resolution for all of them. This causes false "non-versioned" warnings for valid, resolvable entries and misses real update opportunities.

## What Changes

- Resolve semver ranges, major/minor selectors, and dist-tags via npm registry instead of rejecting them
- Extend `?deps=` query parsing to handle ranges and dist-tags the same way as root packages
- Replace two-column reporting (Current | Latest) with three-column reporting (Package | Resolved | Latest)
- Show resolved entries in Updates or Current sections based on comparison with latest, not in Warnings
- Preserve original specifier in report for user clarity
- Update test fixtures to reflect resolved behavior instead of warning behavior

## Capabilities

### Modified Capabilities

- `package-resolution`: Add semver range/dist-tag resolution requirement, remove from Non-Goals, add three-column reporting requirement
- `reporting`: Update column layout from Current|Latest to Resolved|Latest, add specifier display scenarios

## Impact

- `src/index.js`: `extractVersionedPackage` parsing logic, `parseDependencyPins` logic, `collectPackageOccurrences` flow, analysis result shape
- `src/report.js`: Column layout changes (Current → Resolved), specifier display in Package column
- `test/cli.test.js`: Test assertions for non-pinned entries change from warnings to resolved results
- `test/fixtures/non-pinned-supported.html`: Existing fixture works as-is; new behavior changes expected output
