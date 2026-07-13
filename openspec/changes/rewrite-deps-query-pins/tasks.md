## 1. Dependency-token splice helper

- [x] 1.1 Add a helper (in `src/rewrite-specifier.js` or a small new module) that, given a raw esm.sh URL, a target package name, and a new specifier, splices that package's version token inside the `?deps=` query value in place — matching the token by package identity (reusing the same `@`-disambiguation as `extractVersionedPackage`, including scoped `@scope/pkg`), preserving separators and ordering, and preserving encoding via the "has `%` → `encodeURIComponent`, else raw" heuristic used by `replaceUrlSpecifier`.
- [x] 1.2 Ensure the helper is a no-op when the target token is absent, is a dist-tag, or its computed new specifier equals the current one, and preserves any sibling token that does not parse.

## 2. Coalesced rewrite plan

- [x] 2.1 In `src/rewrite-target.js`, remove the `!occurrence.fromDepsQuery` filter in `collectRewritesFromReport` so dependency-pin occurrences contribute edits.
- [x] 2.2 Restructure the rewrite plan so all edits sharing a `destinationUrl` (outer version bump plus any number of dependency-pin bumps) are grouped by unique URL and applied in sequence to produce one `finalUrl`, emitting a single `{ oldUrl, finalUrl }` pair per URL. Route outer edits through `replaceUrlSpecifier` and dependency edits through the new deps splice helper (task 1.1).
- [x] 2.3 Confirm `rewriteDestinationUrls` still receives one pair per unique URL so its whole-value quote-boundary substitution and substring-safety behavior are unchanged.

## 3. Integrity coverage

- [x] 3.1 Verify `collectStrippedIntegrityEntries` strips integrity entries for URLs whose only change is a `?deps=` pin (the coalesced `finalUrl` differs from `oldUrl`), and that the stripped-integrity warning names the correct URL. Adjust only if a gap is found — no new logic expected.

## 4. Tests

- [x] 4.1 Single dependency pin rewrite per class: pinned, caret, tilde, major-only, minor-only.
- [x] 4.2 Multiple simultaneous edits on one URL (outer + several deps) coalesce into one rewritten value with all edits applied.
- [x] 4.3 Partial update on a shared URL: outer changes but a dependency pin does not (and vice versa); unchanged tokens preserved.
- [x] 4.4 Scoped dependency pin (`@scope/pkg@x.y.z`) rewrites only the version, preserving the scope.
- [x] 4.5 Dependency order, comma separators, and per-token encoding (e.g. `%5E`) preserved; no whole-query re-encode.
- [x] 4.6 Dist-tag dependency pin (`?deps=react@beta`) is left unchanged.
- [x] 4.7 Integrity entry keyed on a URL whose only change is a `?deps=` pin is stripped with the correct warning.
- [x] 4.8 Idempotency: a second `--update` with stable `latest` produces no further changes.
- [x] 4.9 `--dry-run` diff reflects the coalesced deps rewrites and writes nothing.

## 5. Docs and spec sync

- [x] 5.1 Rewrite the README §"`?deps=` query pins are not rewritten" to describe the now-supported behavior, including the raw-text-splice/minimal-diff guarantee, dist-tag exclusion, and integrity strip; update the "Rewrite behavior by specifier class" and example sections as needed.
- [x] 5.2 Document the known limitation: an outer package entry and a same-named dependency pin produce indistinguishable post-rewrite summary lines.
- [x] 5.3 Run `npm run format` and `npm run check`; fix any lint/format/test failures before considering the work complete.
