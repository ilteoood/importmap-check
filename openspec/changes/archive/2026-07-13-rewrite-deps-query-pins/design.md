## Context

esm.sh destination URLs may carry a `?deps=<pkg>@<version>,<pkg>@<version>` query string that pins the versions of a package's dependencies. ECU already parses these pins (`parseDependencyPins` in `src/parse-cdn-url.js`), classifies each dependency's specifier via the shared `extractVersionedPackage`, and feeds them into the analyzer as occurrences tagged `fromDepsQuery: true` (`src/analyze-target.js`). Consequently, dependency pins already appear in check-only reporting and resolve `latest` like any other package.

The rewrite path deliberately stops short: `collectRewritesFromReport` (`src/rewrite-target.js:95-99`) filters out `fromDepsQuery` occurrences, so `--update` / `--dry-run` bump only the outer package version and leave dependency pins stale. This design closes that gap.

The current rewrite engine has one structural assumption that blocks deps rewriting: it treats each occurrence as an independent `{ oldUrl, newUrl }` pair and applies them by whole-value string replacement (`rewriteDestinationUrls`). Dependency pins violate that assumption because several packages (the outer package plus each dependency) share the *same* `destinationUrl`; emitting them as independent pairs keyed on the same `oldUrl` would let the first substitution consume the string and silently drop the rest.

## Goals / Non-Goals

**Goals:**
- Rewrite updateable `?deps=` dependency pins (pinned, caret, tilde, major-only, minor-only) during `--update` / `--dry-run`, reusing the existing specifier resolution and rewrite logic without adding new resolution code.
- Preserve the query string's dependency order, separators, and per-token encoding via raw-text splicing, matching the philosophy already used for the outer slot in `replaceUrlSpecifier`.
- Coalesce every edit that applies to a single destination URL (outer bump + N dependency bumps) into one substitution so no edit is dropped.
- Strip integrity entries for any URL whose bytes change because of a dependency-pin rewrite.

**Non-Goals:**
- Dist-tag flattening for dependency pins (`?deps=react@beta` stays floating), matching outer dist-tag behavior. Deferred to the future `--pin` / `--pin-channel` work.
- Integrity *regeneration* — stripped hashes are not recomputed.
- `--filter` / `--reject` selectivity over which dependencies get rewritten.
- Changing the post-rewrite summary format to distinguish a dependency-pin rewrite from an outer rewrite (see Risks).

## Decisions

### Decision: Raw-text splice of the dependency token, never a query re-serialize

Rewrite a dependency pin by locating its token within the raw `?deps=` substring and splicing only that token's version, exactly as `replaceUrlSpecifier` does for the outer version slot. The alternative — parse the query with `URLSearchParams`, mutate, and re-serialize — is rejected because:

- Re-serialization re-encodes the *entire* query string (`@`→`%40`, `,`→`%2C`, `^`→`%5E`), producing a large, noisy diff that undermines the tool's minimal-diff contract (visible directly in `--dry-run`).
- `URLSearchParams` decodes `+` to a space, which would silently corrupt any build-metadata version like `1.0.0+build`.

Raw-text splicing keeps the outer-slot and dependency-slot rewrite paths conceptually unified and preserves everything the author wrote around the changed token.

### Decision: Coalesce edits per unique destination URL before substitution

Change the rewrite-plan shape from "one occurrence → one `{ oldUrl, newUrl }`" to "group all applicable edits by unique `oldUrl`, apply them to produce one `finalUrl`, emit a single `{ oldUrl, finalUrl }`." Concretely, `collectRewritesFromReport` no longer skips `fromDepsQuery` occurrences; instead it collects every occurrence's intended edit, groups edits by shared `destinationUrl`, and applies them in sequence to the same starting URL string. Each edit knows which slot it targets:

- outer version slot → the existing `replaceUrlSpecifier` (path portion, before `?`)
- a specific dependency token → a new deps-aware splice keyed by package name within the `?deps=` value

The downstream `rewriteDestinationUrls` (whole-value `"oldUrl"` → `"newUrl"`) then runs once per unique URL, as today, so its substring-safety and quote-boundary guarantees are unchanged.

### Decision: Locate the dependency token by package identity, preserving encoding per token

Within the raw `?deps=` value, split on the raw `,` separator to get tokens, match the token whose parsed package name equals the target package (reusing the same `@`-disambiguation `extractVersionedPackage` uses for scoped names), and splice its version using the same "has `%` → `encodeURIComponent`, else raw" heuristic already in `replaceUrlSpecifier`. Only the matched token's version changes; separators, ordering, and sibling tokens are untouched.

### Decision: Integrity strip falls out of the coalesced final URL

Because a dependency-pin rewrite changes the shared URL's bytes, the coalesced `finalUrl` differs from `oldUrl`, so the existing `collectStrippedIntegrityEntries` (which keys on both old and new URL) already covers deps-triggered changes. No new integrity logic is required — only test coverage to confirm it.

## Risks / Trade-offs

- **Indistinguishable summary lines** → When a file contains both an outer `react` entry and a `react` pin inside another package's `?deps=`, the post-rewrite summary shows two lines that look identical. Mitigation: documented as a known limitation in the README; the summary is grouped by package, and disambiguating dependency-context lines is deferred to a future summary-clarity change. Correctness of the rewrite itself is unaffected.
- **Token matching ambiguity** → A `?deps=` value could in principle list the same package twice or use unusual encodings. Mitigation: match and splice every token whose package identity matches (not just the first), and preserve any token that does not parse rather than guessing.
- **Non-standard separators** → If a real esm.sh URL ever used an encoded comma (`%2C`) between deps, raw splitting on `,` would miss it. Mitigation: current parsing already splits on raw `,` (matching esm.sh's emitted form); the write path mirrors the read path, so both stay consistent. If encoded separators surface in the wild, that is a follow-up for both parse and rewrite together.

## Migration Plan

Not applicable — additive behavior behind existing `--update` / `--dry-run` flags. The only behavior change for existing inputs is that URLs with updateable `?deps=` pins now get those pins rewritten (previously left stale), which is the intended fix. No data migration or rollback steps.

## Open Questions

None. Write strategy (raw-text splice) and scope (deps rewriting only, summary unchanged) were settled during exploration.
