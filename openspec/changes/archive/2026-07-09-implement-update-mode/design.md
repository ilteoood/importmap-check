## Context

The v1 analyzer already has everything needed to perform a meaningful update: per-occurrence provenance (`importMapIndex`, `key`, `keyKind`, `destinationUrl`, `cdnFamily`, `specifier`), per-package latest-version resolution, and integrity metadata awareness keyed off `importMap.integrity[destinationUrl]`. What's missing is the modifier pass that takes the analyzer's results and produces a rewritten target file plus a post-rewrite summary.

The check-only CLI in `bin/esm-check-updates.js` already routes `--update`/`-u` to a rejection error, so the new behavior drops into an existing branch in `parseArgs`. The serif-style summary already exists for `formatReport` in `src/report.js` and can be extended for the before/after table without ballooning surface.

The ESM runtime model differs from npm in one load-bearing way: an ESM dist-tag URL (`react@beta`) **floats at the registry** — esm.sh re-resolves it every request. So there is no time-of-authoring lag the tool is responsible for closing for dist-tag entries. The tool already resolves dist-tags to a current concrete version for reporting; for rewrite mode, the right behavior for dist-tag entries is *not* to rewrite, which we have to codify in the spec so future changes have a stable baseline to extend.

## Goals / Non-Goals

**Goals:**
- Promote `--update`/`-u` from a rejected flag to a working flag that rewrites the target file in place
- Rewrite updateable entries per the specifier-preservation matrix (pinned bumps concrete; caret/tilde lifts floor to new major; major-only/minor-only selectors land on latest-major equivalents)
- Leave dist-tag entries untouched under `--update`, surfacing informational notes about their floating behavior
- Strip import map `integrity` entries keyed to rewritten URLs and emit hard per-URL warnings (no regeneration in this change)
- Write the target file atomically so interrupted updates never leave a half-written file
- Print a concise post-rewrite summary to stdout that includes the before/after table, integrity-strip warnings, and existing informational notes

**Non-Goals:**
- A `--dry-run` flag (deferred; the summary already shows before/after for a successful write)
- A `--target` knob (deferred; this change always targets `latest`)
- `--pin` / `--pin-channel` flags (deferred; specifier style is preserved as-is)
- `--filter` / `--reject` flags (deferred; all updateable entries get rewritten)
- `--interactive` TUI (deferred; multi-select UI is a separate, larger surface)
- Dist-tag entries being rewritten at all in this change
- Integrity hash regeneration (deferred; later change will explore fetch + hash with documented browser-vs-CLI byte-mismatch caveats)
- `?deps=` query-string rewriting (deferred per prior exploration)
- `--target @<tag>` channel switching (deferred)
- A new version bump in `package.json` may or may not land in this change; flagged as an open question in tasks

## Decisions

### 1. Single new flag surface

**Decision:** One new flag (`--update`/`-u`) is the entire user-visible surface in this change. No target/pin/filter/dry-run/interactive knobs.

**Rationale:** Each knob introduced here would either need its own decision in isolation or be a placeholder for a deferred feature. The smallest reviewable change is one flag whose behavior is fully determined by the existing analysis and the specifier-preservation matrix below. Future changes can layer richer knobs against a stable baseline.

**Alternatives considered:**
- Pair `--update` with `--dry-run` immediately: rejected — `--dry-run`'s diff format and write-skip logic are a separable concern that can land cleanly in a one-off follow-up; the post-rewrite summary in this change already surfaces what changed.
- Pair with `--target`: rejected — the only target that produces meaningful changes for ESM is `latest`. A `--target` knob is interesting once `semver`, `minor`, `patch`, or `@<tag>` semantics are validated, which belongs to a later change.

### 2. Rewrite target for each specifier class

**Decision:** The rewrite path preserves the user's specifier style and uses the analyzer's already-resolved `latestVersion` to determine the new value:

| Specifier class     | Example              | Analysis result                  | Rewrite                          |
|---------------------|----------------------|----------------------------------|----------------------------------|
| Pinned              | `react@19.2.3`       | latest 19.3.0 > current 19.2.3   | `react@19.3.0`                   |
| Caret range         | `react@^19.2.3`      | latest 20.0.0 > resolved 19.2.x  | `react@^20.0.0`                  |
| Tilde range         | `react@~19.2.3`      | latest 20.0.0 > resolved 19.2.x  | `react@~20.0.0`                  |
| Major-only selector | `react@18`           | latest 19.3.0 > resolved 18.x     | `react@19`                       |
| Minor-only selector | `react@18.3`        | latest 19.3.0 > resolved 18.3.x  | `react@19.3`                     |
| Dist-tag            | `react@beta`        | latest 19.2.7 > resolved 19.0.0-beta-... | **no rewrite**, info note preserved |

Entry is only rewritten when the analyzer's `hasUpdate` is true. For multi-occurrence packages (same package via different keys — package subpaths, multiple import maps, or package-vs-remap keys), every occurrence of the same `packageName` whose `currentVersion` differs from `latestVersion` is rewritten consistently to the same new specifier.

**Major-version-zero and tilde semantics:** Caret locks the leftmost NON-ZERO element of the [major, minor, patch] tuple. Tilde locks everything except the rightmost-specified position, with npm's special-case that `~0.0.z` collapses to caret's patch-locked form. The full rewrite matrix for `--update --target latest` (only listing cases where `hasUpdate=true`, i.e. latest is OUTSIDE the current range — in-range latest movements don't trigger a rewrite because the analyzer would report `hasUpdate=false`):

| Current specifier | Latest version | New specifier | Boundary crossed |
|-------------------|-----------------|---------------|-------------------|
| `^1.2.3`           | `2.0.0`          | `^2.0.0`      | major-locked 1.x window |
| `^0.2.3`           | `0.3.0`          | `^0.3.0`      | minor-locked 0.2.x window |
| `^0.0.3`           | `0.0.5`          | `^0.0.5`      | patch-locked 0.0.3 window |
| `^0.0.3`           | `0.1.0`          | `^0.1.0`      | patch-locked 0.0.3 → minor-locked 0.1.x |
| `^0.0.3`           | `1.0.0`          | `^1.0.0`      | patch-locked → major-locked 1.x |
| `~1.2.3`           | `1.3.0`          | `~1.3.0`      | minor-locked 1.2.x window |
| `~1.2.3`           | `2.0.0`          | `~2.0.0`      | minor-locked → major-locked 2.x |
| `~0.2.3`           | `0.3.0`          | `~0.3.0`      | minor-locked 0.2.x window |
| `~0.2.3`           | `1.0.0`          | `~1.0.0`      | minor-locked → major-locked 1.x |
| `~0.0.3`           | `0.0.5`          | `~0.0.5`      | patch-locked 0.0.3 window (npm quirk) |
| `~0.0.3`           | `0.1.0`          | `~0.1.0`      | patch-locked → minor-locked |
| `~0.0.3`           | `1.0.0`          | `~1.0.0`      | patch-locked → major-locked 1.x |

**General rule:** rewrite `^X.Y.Z` (or `~X.Y.Z`) to the smallest `^X'Y'Z'` (or `~X'Y'Z'`) form that (a) preserves the prefix, (b) uses the same leftmost-nonzero locking semantics, and (c) admits the latest version. When latest crosses a wider boundary than the current locked position permits (e.g. `^0.0.3` with `latest=0.1.0`), promote the locked position upward until latest is admissible.

**Rationale:** The ESM runtime model means only changes that move the served version matter. Bumping the floor of `^19.2.3` to `^19.2.7` is cosmetic — esm.sh already serves the latest 19.x for either URL. Lifting the floor across majors (`^19.2.3` → `^20.0.0`) actually changes what gets served. The matrix above defaults to "produce a rewrite that changes what esm.sh serves," which is what users invoking `--update` expect. The `0.0.x` patch-locked rules preserve the user's expressed intent (a `^0.0.3` user is saying "I depend on exactly the 0.0.3-0.0.x boundary"); rewriting it to `^0.5.0` would silently broaden what gets served.

**Pre-existing analyzer simplification to fix in this change:** `src/index.js` `resolveSemverRange` currently treats any `^0.x.y` as `^0` (returns the highest 0.* version in the registry) and any `~0.0.z` as `~0.0` (returns the highest 0.0.x). Both are too coarse per npm's strict semver rules. Tasks.md adds a group that corrects the resolution logic to honor the lock-til-leftmost-nonzero rule, with regression tests for `^0.2.3`, `^0.0.3`, `~0.0.3`, and `~0.2.3` resolution against synthetic registry versions. This must land in the same change as the rewrite matrix, because rewrites' hasUpdate comparison depends on resolution being correct: a `^0.0.3` entry whose latest is `0.1.0` should report `hasUpdate=true`, but today the analyzer would resolve `^0.0.3` as "highest 0.x" (= `0.1.0`) and report `hasUpdate=false`, leaving the user stuck.

**Alternatives considered:**
- Conservative within-major floor bumps only (caret `^19.2.3` → `^19.3.0`): rejected — silent no-op for the esm.sh runtime, which is worse than the perceived aggression of lifting across majors.
- Pinning ranges to concrete versions behind a separate flag here: rejected — defers the `--pin` decision to its own future change where it can come with `--pin-channel` and dist-tag-freezing semantics in a coherent unit.
- Coarse `^0` interpretation for all `^0.x.y` ranges (matching the pre-existing bug): rejected — silently broadens the user's expressed locking semantics and produces rewrite targets that broaden what esm.sh would serve on the user's import map.

### 3. Dist-tag entries: no rewrite

**Decision:** Dist-tag entries (`react@beta`, `react@latest`, `react@next`) are never rewritten in this change. Existing informational notes (e.g. "latest > tag resolved version") are preserved in the post-rewrite summary so users know the situation and can manually re-specify if desired.

**Rationale:** ESM CDNs re-resolve dist-tags from the npm registry live. The analyzer's "resolved current version" for a dist-tag entry is whatever `dist-tags.<name>` points to *right now*, and that's what esm.sh serves. There is no time-of-authoring version lag the tool is responsible for closing. Rewriting `react@beta` to `react@<some-version>` would only freeze a snapshot the user already had access to via the floating tag, and that freeze decision deserves its own `--pin` / `--pin-channel` design surface in a later change.

**Alternatives considered:**
- Rewrite dist-tag entries to their current resolved version (`react@beta` → `react@19.0.0-beta-...`): rejected — freezes a floating entry without opt-in. Two-flag design space deserves its own proposal.
- Rewrite dist-tag entries to latest dist-tag's version (`react@beta` → `react@19.2.7`): rejected — silently abandons the user's channel choice. Should be explicit opt-in.

### 4. Integrity: strip and warn, do not regenerate

**Decision:** When a URL is rewritten, drop any import map `integrity` entry keyed to either the old or new URL. Emit a hard warning per stripped URL naming the affected package and URL. Do not compute or write replacement integrity hashes.

**Rationale:** Authoring an SRI hash requires hashing the bytes the browser will actually fetch at the rewritten URL. While a CLI-side `fetch + hash` *could* produce a candidate, two failure modes make it brittle in this change:
- The CDN may serve different bytes to the CLI than to the browser (e.g. brotli vs. identity encoding negotiated by `Accept-Encoding`), resulting in an SRI hash the browser would reject — worse than having no integrity entry.
- esm.sh can rebuild the same URL over time, so a "correct" hash computed today can become stale independent of our update logic.

Stripping and warning is the honest minimal behavior: the user knows they need to re-pin SRI manually (or in a future change that opts into integrity regeneration with documented caveats).

**Alternatives considered:**
- Best-effort regenerate via CLI fetch + same-algo hash: deferred to a later change where it can land with the `--no-regenerate-integrity` opt-out and documented byte-mismatch caveats.
- Block the write unless the user passes `--strip-integrity`: rejected — adds a flag and forces a confirmation step that doesn't pay for itself in this minimal scope.

### 5. File rewrite mechanism: in-place string surgery, not re-serialization

**Decision:** Rewrite the target file by performing string-surgery on the original content rather than re-serializing the JSON/HTML. The rewrite path uses each occurrence's recorded `destinationUrl` (which appears literally in the file) and substitutes the new URL string in place. Multiple occurrences of the same URL are all replaced in one pass.

**Rationale:** Re-serializing a JSON import map would lose the user's original indentation, key ordering, and whitespace choices. Re-serializing an HTML file would require an HTML parser, which violates the zero-dependency constraint and the v1 "lightweight HTML extraction" approach. String surgery preserves all formatting and is straightforward because the analyzer already captures the exact `destinationUrl` strings that need replacement.

For HTML targets with multiple inline import maps, each map's content is independent in the source — string replacement on `destinationUrl` works identically across all of them because the URLs themselves are unique substrings in the file.

**Edge cases the implementation must handle (called out in tasks):**
- A URL string that appears as a substring of another URL must not be replaced when targeting the shorter one. The rewriter pairs each old URL with its new URL and replaces whole occurrences only (boundary check on quote characters or import-map-value delimiters).
- URL-encoded specifiers: the source may contain `%5E` for caret. The rewriter operates on the raw substring as it appears in the file, not on the decoded form, and emits the new specifier in the same encoding style as the original.
- Two occurrences of the same package via different URLs (e.g. a jsdelivr entry and an esm.sh entry for the same package, destively a destination-skew case): both are rewritten independently per their own `destinationUrl` under this change. The analyzer already emits a destination-skew warning that stays in the post-rewrite report.

**Alternatives considered:**
- Re-serialize JSON via `JSON.stringify(parsedMap, null, <inferred indent>)`: rejected — even with per-file indentation inference, key ordering and array spacing are fragile.
- Use an HTML parser to walk inline script tags: rejected — breaks the zero-dependency principle and the established light-HTML-extraction pattern.

### 6. Atomic write via temp file + rename

**Decision:** The write step writes the rewritten content to a temp file in the same directory as the target (using `os.tmpdir()` is unsafe because cross-filesystem rename can fail), then calls `fs.rename()` to atomically replace the target file.

**Rationale:** A half-written import map is the worst failure mode — it can ship a broken page. Atomic rename on the same directory is the standard Node.js pattern and works on both POSIX and Windows for same-filesystem renames.

**Edge cases:**
- The temp file is named `.<basename>.ecu-<pid>-<random>.tmp` to avoid collisions and starts with a `.` so it is not picked up by watch workflows that ignore dotfiles.
- If the write step fails partway, the temp file is cleaned up in a `finally` block before the error propagates.
- File mode/ownership is preserved via `fs.copyFileSync(target, tempFile)` as the initialization step so `rename()` produces a file with the original mode bits — or the rewriter can call `fs.chmod(tempFile, originalMode)` after writing. Picking one approach is a tasks.md-level decision.

**Alternatives considered:**
- Direct `fs.writeFile` to the target: rejected — half-written state on interrupt.
- Write to `os.tmpdir()` then rename: rejected — may cross filesystems on macOS (`/var/folders` is on a different volume than the project in some setups), causing `EXDEV` errors.

### 7. Post-rewrite summary format

**Decision:** After a successful write, print a concise summary to stdout containing:

1. A header line naming the target file: `Updated ./public/index.html:`
2. A before/after table with one row per rewritten package, sorted by package name, showing `<package>` (with original specifier inline when present) and `before → after`
3. The existing warnings section if any warnings occurred during analysis (e.g. `unsupported-scopes`, `unparseable-entry`, `destination-skew`)
4. A dedicated `Stripped integrity entries:` subsection when any integrity entries were removed, listing the stripped URLs
5. The existing notes section if any notes were produced (e.g. dist-tag floating notices)

The post-rewrite summary supersedes the standard check-only report when `--update` is used. If the analyzer finds no updates, the summary says exactly that and no write happens.

**Rationale:** The post-write report is the user's primary feedback loop and must say both *what changed* and *what side-effects happened* (integrity strips). Reusing the existing warnings/notes machinery keeps formatting consistent across check-only and update modes.

**Alternatives considered:**
- Emit a unified diff (GitHub-style `---`/`+++` blocks): deferred — a real diff requires a line-diff implementation (or a dependency), and the before/after table conveys the same essential information at the package level. A future `--dry-run` change is the natural place for a real diff format.
- Print nothing on success: rejected — silent success hides integrity strips from the user.

## Risks / Trade-offs

- **Dist-tag entries appear "ignored" by update mode** → Mitigation: the post-rewrite summary explicitly preserves the existing informational notes about dist-tag entries ("latest > your tag's resolved version"). The behavior is also documented in the README and `cli`/`package-resolution` specs so users know what to expect. A later change will introduce explicit `--pin`/`--pin-channel` controls for dist-tag flattening.
- **Integrity stripping is a one-way operation** → Mitigation: the per-URL warning naming the affected URL and packages makes the side effect loud. Users in version control can `git diff` to see the stripped entry and re-add SRI externally after validating the new URL. A future change will add opt-in regeneration.
- **String-surgery rewrite can corrupt malformed files** → Mitigation: the rewriter only substitutes exactly-captured `destinationUrl` substrings; any file content the analyzer couldn't parse correctly would already have triggered an analysis warning before the rewrite step. Tasks.md calls out test coverage for tricky boundary cases (substrings of longer URLs, URL-encoded specifiers, mixed quote styles).
- **The "lift floor to new major" behavior for ranges is opinionated** → Mitigation: documented in README and `update-mode` spec with rationale. Users who only want within-major bumps can wait for the `--target semver` follow-up change.
- **Atomic write doesn't help if the user has uncommitted changes in version control** → Mitigation: README stacks "make sure your file is in version control and all changes are committed" alongside the `--update` documentation, mirroring ncu's warning text. The tool itself doesn't snapshot before write.
- **Running `--update` twice could double-apply if the npm registry `latest` moves between invocations** → Mitigation: in practice this is correct behavior — the second invocation is a no-op if `latest` hasn't moved, and applies the new `latest` if it has. Tasks.md calls out an idempotency test that proves this with a fixture and a stable `latest` override via `ECU_TEST_LATEST_VERSIONS`.
- **Major-version-zero ranges may surprise users who don't expect `^0.1.0` to lift to `^0.2.0`** → Mitigation: codified in the `update-mode` spec per semver's "0.x changes are breaking" convention, mirroring npm-check-updates' handling. Tasks.md calls out explicit tests for both within-major-zero lifts and cross-to-major-1 fallthrough.

## Migration Plan

No migration required. The check-mode default behavior is unchanged for users who never pass `--update`. Users can adopt `--update` immediately by running `esm-check-updates --update <path>` after committing their import map to version control.

A version bump from `0.0.1` to `0.1.0` in `package.json` is appropriate to reflect the first non-check-only behavior; flagged as a decision point in tasks.

Rollback: stop passing `--update`. No persistent state is stored by the tool; the CLI behavior reverts to check-only.

## Open Questions

- Should `package.json` be bumped from `0.0.1` to `0.1.0` in this change to signal the first actual modification capability to users?