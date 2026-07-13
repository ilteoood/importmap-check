## Why

ECU already analyzes and reports esm.sh `?deps=` query pins (e.g. `?deps=react@18,scheduler@^0.23.0`) in check-only mode, but `--update` / `--dry-run` deliberately skip them: the outer package URL is rewritten while the dependency pins inside its query string are left stale. This leaves the update incomplete — a user who runs `--update` still has to hand-edit dep pins — and the gap is invisible unless they read the caveat in the README. Now that resolution and rewrite plumbing for every specifier class already exists, closing this gap is mostly URL surgery, not new resolution logic.

## What Changes

- `--update` / `--dry-run` now rewrite updateable `?deps=` query pins in esm.sh URLs, in addition to the outer package version.
- Dependency pins are rewritten by **raw-text splice** of the individual dep token in place, preserving the surrounding query string's separators, order, and per-token encoding — the same philosophy as the existing outer-slot rewrite (`replaceUrlSpecifier`). The tool never round-trips the query through `URLSearchParams` (which would re-encode the whole query and decode `+` to space).
- The rewrite plan coalesces **all** edits that apply to a single destination URL — an outer bump plus any number of dep bumps that share that URL — into one replacement, replacing today's per-occurrence model that would drop all but the first edit on a shared URL.
- Integrity entries keyed on a URL whose `?deps=` pins are rewritten are stripped (not regenerated), consistent with existing outer-rewrite integrity handling.
- Dist-tag dep pins (e.g. `?deps=react@beta`) are **not** rewritten, matching outer dist-tag behavior.
- README and the `update-mode` spec are updated to flip the "`?deps=` query pins are not rewritten" deferral into supported behavior.

## Capabilities

### New Capabilities
<!-- None. This extends existing update-mode behavior. -->

### Modified Capabilities
- `update-mode`: The requirement documenting that `?deps=` pins are analyzed but not rewritten is replaced by a requirement that updateable `?deps=` pins are rewritten in place (pinned/range/selector classes), with dist-tag pins excluded, integrity stripped on change, and multiple edits per URL coalesced into a single rewrite.

## Impact

- **Code**: `src/rewrite-target.js` (rewrite-plan shape: coalesce edits per unique URL; extend integrity-strip coverage to deps-triggered URL changes), `src/rewrite-specifier.js` or a new helper (splice a dep token within a raw `?deps=` query, preserving encoding). Reuses `parseDependencyPins` and `rewriteSpecifier` unchanged.
- **Docs**: `README.md` §"`?deps=` query pins are not rewritten" rewritten to describe supported behavior.
- **Specs**: `openspec/specs/update-mode/spec.md` delta.
- **Tests**: new coverage for single/multiple dep rewrites per URL, scoped dep packages, encoding preservation, dist-tag dep exclusion, integrity strip on deps rewrite, and idempotency.
- **Known limitation (documented, not fixed)**: when a file contains both an outer `react` entry and a `react` pin inside another package's `?deps=`, the post-rewrite summary shows indistinguishable lines for the two. Deferred to a future summary-clarity change.
- **Stays deferred**: dist-tag flattening (`--pin`/`--pin-channel`), integrity regeneration, `--filter`/`--reject` selectivity.
