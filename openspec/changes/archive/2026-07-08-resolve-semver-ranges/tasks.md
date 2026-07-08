## 1. Add semver range resolution helper

- [x] 1.1 Add `resolveSemverRange` function that takes a package name, specifier string, and npm registry response body, returns the resolved concrete version
- [x] 1.2 Add `resolveDistTag` function that looks up dist-tag name in npm registry response body's `dist-tags` field
- [x] 1.3 Handle range types: `^X.Y.Z` (caret), `~X.Y.Z` (tilde), `X` (major-only), `X.Y` (minor-only)

## 2. Extend version extraction to accept ranges/dist-tags

- [x] 2.1 Update `extractVersionedPackage` to return `{ packageName, specifier, currentVersion }` instead of just `{ packageName, currentVersion }`
- [x] 2.2 Update `extractVersionedPackage` regex to accept semver ranges (`^X.Y.Z`, `~X.Y.Z`), major selectors (`^\d+$`), minor selectors (`^\d+\.\d+$`), and dist-tag names (`latest|beta|next|canary|alpha`)
- [x] 2.3 When a range/dist-tag is detected, call resolution helpers to resolve to a concrete version; return `null` only if resolution fails

## 3. Extend `?deps=` parsing to handle ranges/dist-tags

- [x] 3.1 Update `parseDependencyPins` to use the same range/dist-tag detection as `extractVersionedPackage`
- [x] 3.2 Apply resolution to deps entries the same way as root package entries

## 4. Update analysis flow to track original specifier

> Note: the `sources` field already exists on `packageResults` from the `add-source-column` change. The specifier work below is strictly additive alongside it.

- [x] 4.1 Add `specifier` field to occurrence objects in `collectPackageOccurrences`
- [x] 4.2 Propagate specifier through `groupByPackage` into `packageResults`
- [x] 4.3 Update `packageResults` shape to include `specifier` field alongside `currentVersions`, `latestVersion`, and the existing `sources` field

## 5. Update reporting for three-column format

- [x] 5.1 Update `formatReport` in `src/report.js` to change table headers from "Package | Current | Latest" to "Package | Resolved | Latest"
- [x] 5.2 Rename `currentWidth` / `currentVersions` references to `resolvedWidth` / `resolvedVersion` in report rendering
- [x] 5.3 Show original specifier in Package column when present (e.g. `react (18)` or `react-dom (^19.2.3)`)
- [x] 5.4 For pinned entries (no specifier), show only the package name (no parentheses)

## 6. Update tests

- [x] 6.1 Update `non-pinned-supported.html` test: `react@18` should resolve and appear in Updates with specifier `18`, resolved version, and latest
- [x] 6.2 Update `non-pinned-supported.html` test: `react-dom@^19.2.3` should resolve and appear in Updates with specifier `^19.2.3`
- [x] 6.3 Update `non-pinned-supported.html` test: `swr` with `?deps=react@18,react-dom@19.2.3` — `react@18` in deps should resolve, `react-dom@19.2.3` is a pin
- [x] 6.4 Remove warning assertions for non-pinned entries; replace with resolved result assertions
- [x] 6.5 Keep existing `unparseable-supported.html` test unchanged (truly unparseable still warns)
- [x] 6.6 Add test for dist-tag resolution (e.g. `@latest`, `@beta`)
- [x] 6.7 Add test for minor-only selector resolution (e.g. `18.3`)

## 7. Verify and format

- [x] 7.1 Run `npm test` to verify all tests pass
- [x] 7.2 Run `npm run format` to ensure code formatting is correct

## 8. Carryover nits from `add-source-column` review

These were identified during the `add-source-column` review but deferred because they touch surface area this change also modifies. Address them while you're already in the same code:

- [x] 8.1 Inline `deriveSpecifier` (`src/index.js`) — it's a one-line `?? ""` wrapper. Either inline it at the two call sites or rename to `normalizeSpecifier` if the helper stays.
- [x] 8.2 Drop the explicit `colorEnabled: undefined` from `bin/esm-check-updates.js` `formatReport` call. The default `??` chain handles the missing key.
- [x] 8.3 Promote `delimiterWidth = 3` (`src/report.js` `computeSectionWidths`) to a module-level `DELIMITER_VISIBLE_WIDTH` constant alongside `FALLBACK_WIDTH` / `MIN_SOURCE_WIDTH`.
- [x] 8.4 Consider asserting `--width=100` (with `=`) rejection as an "Unknown flag" test case if we want to lock in the `--flag=value` syntax contract.
- [x] 8.5 Decide whether the `widths` object union shape (with/without `sourceWidth`) deserves a tighter struct or a JSDoc comment. Currently `renderPackageRow` destructures `sourceWidth` even in the no-sources path; the early `if (!sourcesEnabled) return [...]` guard means it's never used, but a type system would complain.
- [x] 8.6 When range resolution starts producing non-empty `specifier` strings, audit the `wrapSourceLabel` continuation-prefix detection (`stripped.startsWith(" ".repeat(indent))`) — it's ANSI-aware now but a future color change to import-map-key portions could trip it.