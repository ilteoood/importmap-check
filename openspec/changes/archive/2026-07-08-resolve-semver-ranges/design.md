## Context

`esm-check-updates` parses CDN URLs (esm.sh, jsdelivr) and extracts package names with pinned versions (`X.Y.Z`). Entries with semver ranges (`^19.2.3`), major selectors (`18`), minor selectors (`18.3`), or dist-tags (`latest`, `beta`) are rejected with warnings. The npm registry provides authoritative resolution for all these patterns. Both esm.sh and jsdelivr resolve them server-side at request time, confirming these patterns are valid and expected in import maps.

## Goals / Non-Goals

**Goals:**
- Resolve semver ranges, major/minor selectors, and dist-tags to concrete versions via npm registry
- Extend `?deps=` parsing to handle ranges/dist-tags identically to root packages
- Report resolved entries in three-column format (Package, Resolved, Latest)
- Show entries in Updates or Current sections based on version comparison, not warnings

**Non-Goals:**
- Dist-tag targeting beyond npm built-in dist-tags (custom dist-tags are later)
- Channel-aware prerelease comparison (handled in separate concern)
- Rewrite/update mode changes (check-only in v1)
- Support for additional CDN families

## Decisions

### 1. Use npm registry for resolution, not CDN APIs

**Decision:** Resolve ranges/dist-tags via `https://registry.npmjs.org/<package>` (the same source already used for `latest`).

**Rationale:** The npm registry is the authoritative source. Both esm.sh and jsdelivr resolve ranges server-side to npm versions — the result must match. No need for CDN-specific logic. The existing `defaultResolveLatestVersion` function already fetches from npm registry; we extend it for range resolution.

**Alternatives considered:**
- CDN API: esm.sh has no public version resolution API. jsdelivr resolves at request time but has no dedicated version API.
- `semver` npm package: Adds a dependency. We can implement range matching simply since we only need "highest matching version" logic.

### 2. Range resolution logic: simple semver matching without external dependency

**Decision:** Implement lightweight range resolution using the existing `compareVersions` function in `src/index.js`.

**Approach:**
- For `^X.Y.Z`: find highest version where major === X
- For `~X.Y.Z`: find highest version where major === X and minor === Y
- For `X` (major-only): find highest version where major === X
- For `X.Y` (minor-only): find highest version where major === X and minor === Y
- For dist-tags (`latest`, `beta`, `next`, `canary`, `alpha`): use `dist-tags` from npm registry response directly

**Rationale:** The semver patterns we need to resolve are limited and well-defined. A full semver library is overkill. We already fetch all versions from npm registry for `latest` — we can resolve ranges against that same data.

### 3. Extend `extractVersionedPackage` to return original specifier

**Decision:** Modify `extractVersionedPackage` to accept a broader version pattern and return both the original specifier and a resolved version.

**Current behavior:** Returns `{ packageName, currentVersion }` only when version matches `^\d+\.\d+\.\d+...`. Returns `null` otherwise.

**New behavior:** Returns `{ packageName, specifier, currentVersion }` where:
- `specifier` is the original string from the URL (e.g. `^19.2.3`, `18`, `latest`)
- `currentVersion` is the resolved concrete version (e.g. `19.2.7`, `18.3.1`)

If resolution fails, return `null` (falls through to existing warning path).

**Rationale:** Preserves user intent in reporting while enabling update analysis.

### 4. Three-column reporting: Package | Resolved | Latest

**Decision:** Replace "Current" column with "Resolved" column. Package column shows specifier alongside package name when applicable.

**Format:**
```
Package          | Resolved  | Latest
-----------------|-----------|--------
react (18)       | 18.3.1    | 19.3.0
react-dom (^19)  | 19.2.7    | 19.3.0
swr              | 2.5.0     | 2.5.0
```

**Rationale:** Users need to see both what they wrote and what it resolved to. The specifier in parentheses provides context for the resolved version.

### 5. `?deps=` parsing: resolve ranges the same as root packages

**Decision:** Apply the same resolution logic to `?deps=` query entries. Currently only `X.Y.Z` pins are parsed from deps. Extend to resolve ranges/dist-tags.

**Rationale:** `?deps=react@18,react-dom@^19.2.3` is a real pattern. Users expect these to be resolved the same way as root package entries.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| npm registry rate limiting with many packages | Existing code already makes one request per package; no change in pattern |
| Range resolution adds complexity to parsing | Resolution is deferred until after package identity is extracted; fails gracefully to existing warning path |
| Test fixtures need updating | Existing `non-pinned-supported.html` fixture works; test assertions change from warnings to resolved results |
| Backward compatibility: warnings become results | This is the intended behavior change; existing "warnings" were false positives |

## Migration Plan

No migration needed. This is a behavioral improvement — entries that previously generated warnings will now produce meaningful results. Existing tests for truly unparseable entries (no `@` at all) remain unchanged.

## Open Questions

- None remaining. All decisions above were discussed and agreed.
