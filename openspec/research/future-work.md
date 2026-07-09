# Future Work and Research

This file is a long-lived home for design threads that were explored during change proposals but explicitly deferred to later proposals. It captures the discussion context so future proposal authors don't have to rediscover the same ground.

Entries are organized by the natural proposal they would likely become. Each entry records:
- **Origin**: where the discussion came up
- **Question**: what we were trying to decide
- **Reasoning**: what we figured out
- **Deferred because**: why we did not land it in the originating change
- **Open design questions**: what to revisit when we pick it up

This file is **not** a spec. It does not describe what the system does today. It records the decisions we *chose not to make yet* so they are not lost.

---

## 1. Target selection knob — `--target <value>` / `-t <value>`

**Origin:** Discussed during `implement-update-mode` (introducing `--update`/`-u`).

**Question:** What version does an entry get rewritten to under `--update`?

**Reasoning:**
- npm-check-updates exposes a `--target` knob with values `latest`, `semver`, `minor`, `patch`, `greatest`, `newest`, `@<tag>`. The default is `latest`.
- For ESM the only target that *changes what esm.sh serves* is `latest`. Within-range cosmetic floor bumps (`^19.2.3` → `^19.2.7`) are silent no-ops at the CDN level because esm.sh re-resolves ranges live.
- `semver` / `minor` / `patch` would be useful only once we also resolve to expose "make genuinely-fine-grained bumps" as a knob rather than the default.
- `@<tag>` for dist-tag entries was tentatively discussed as a way to switch channels without abandoning the tag-pointer semantic. Conflicts semantically with `--pin-channel` (see §2) — both direct dist-tag handling.

**Deferred because:** The `implement-update-mode` change is the smallest good version of update mode — one flag, one behavior (always target=latest). A `--target` knob needs its own validation of `semver`/`minor`/`patch` semantics against the ESM SRI egg-and-spoon problem (`@<tag>` channel switching for dist-tags is even more entangled with `--pin-channel`).

**Open design questions for a future change:**
- Confirm `--target semver` actually does something useful for ESM users given the cosmetic-bump insight. Probably yes for users who want fine-grained "stay within current major" floor lifts that don't rewrite the served version but do lock in a documented floor.
- Decide whether `--target @<tag>` is a synonym for `--pin-channel` or whether they genuinely address different use cases.
- Decide whether `--target` accepts a `function` form like ncu's `.ncurc.js` (presumably no — we have no config file system).

---

## 2. Pin flags — `--pin` and `--pin-channel`

**Origin:** Discussed during `implement-update-mode`.

**Question:** How do we flatten floating specifier entries (ranges and dist-tags) to concrete versions?

**Reasoning:**
- Dist-tag entries (`react@beta`) float at the registry — esm.sh re-resolves `dist-tags.beta` at request time. So a CLI snapshot of "current resolved version" matches what esm.sh serves *right now* and there is no time-of-authoring lag the tool is responsible for closing.
- Two distinct opt-in behaviors make sense:
  - `--pin` — rewrite any floating specifier (range or dist-tag) to a concrete pinned version computed from its *current resolved* value. Dist-tag case freezes the floating semantic to whatever the tag currently points to.
  - `--pin-channel` — applies only to dist-tags. Rewrites the dist-tag selector to whatever `dist-tags.latest` points to, *abandoning* the original channel (`react@beta` → `react@19.2.7`, where `latest` is `19.2.7`).
- The two flags are not synonyms: `--pin` = "freeze my channel to its current version"; `--pin-channel` = "abandon my channel, pin to stable latest."
- One wrinkle: even `--pin` on a caret-range entry (`react@^19.2.3` → `react@19.3.0`) loses the "compatible upgrades" semantic the range was expressing. That's the user's opt-in choice when they pass `--pin`.

**Deferred because:** Dist-tag and range flattening deserve their own decision surface rather than being lumped into the minimal `--update` change. The two-flag design (`--pin`, `--pin-channel`) is too much surface to land in one pass with the rewrite engine itself.

**Open design questions for a future change:**
- Does `--pin` alone rewrite dist-tags to their *current* version, or does it require `--pin-channel` to do anything to dist-tags at all? Cleaner semantics: `--pin` flattens ranges to concrete versions (the natural reinterpretation of "no ranges"), `--pin-channel` is the only dist-tag flattening knob. Worth re-deciding.
- Does `--pin` rewrite major-only selectors (`18` → `19.3.0`)? Skipping this preserves more user intent than pinning.
- How does `--pin` interact with `--target semver`? Probably `--target semver` wins (no cross-major lift) and `--pin` strips the prefix on the resulting floor.

---

## 3. Per-package targeting — `--filter <pattern>` and `--reject <pattern>`

**Origin:** Discussed during `implement-update-mode`, raised specifically to solve the "mixed entry types" problem.

**Problem:** An import map may contain a mix of pinned, range, and dist-tag entries, and the user may want to apply different update policies to different packages. A single `--update --pin-channel` flag has no way to know "abandon react's channel, keep typescript's next."

**Reasoning:**
- ncu's `--filter` and `--reject` flags accept strings, wildcards, globs, comma- or space-delimited lists, and regex (`/^react-.+$/`). Multiple instances of each flag union. `--filter` narrows then `--reject` removes.
- For `esm-check-updates` this is the granularity mechanism for non-interactive mode: filter the package set to update, leaving unfiltered packages untouched.
- Composes cleanly with every other flag (`--target`, `--pin`, `--pin-channel`). All update-affecting flags apply only to filtered packages when `--filter` is set.
- Without `--filter`, the granularity mechanism is `--interactive` (see §4).

**Alternative considered: per-package flag DSL.** Embed a mini-DSL in CLI args (`react:pin-channel,typescript:keep`). Rejected — novel language to design, parse, and test; not worth the surface area when `--filter` is already familiar to ncu users and `--interactive` covers per-package decisions.

**Deferred because:** The minimal `--update` change rewrites every updateable entry. A `--filter` knob is only necessary once we have *multiple* update-mode flag combinations to apply differentially (e.g. `--pin-channel` for some packages, `--target @beta` for others). Without `--pin-channel` and `--target` in this change, `--filter` has nothing to gate.

**Open design questions for a future change:**
- Filter grammar: should we match ncu's grammar exactly, or simplify (drop regex form? drop space-delimited lists?)?
- Filter applies to package occurrences from `?deps=` query parsing too once `?deps=` rewriting lands. Need to design filter semantics across that boundary.
- Does `--filter`/`--reject` also narrow the *check-only* report when `--update` is not set? Useful as a focused view; tentatively yes.
- Empty filter match (no packages match): exit 0 with `No packages matched the filter`? Mirror ncu.

---

## 4. Interactive multi-select TUI — `--interactive` / `-i`

**Origin:** Discussed during `implement-update-mode`.

**Question:** How do users review and choose which updates to apply non-blindly without `--filter`?

**Reasoning:**
- ncu ships a TUI multi-select built on inquirer. Hotkeys: ↑↓ select, space toggle, `a` toggle all, enter proceed.
- For esm-check-updates the natural place to land this is full ncu-style multi-select *with* an `a` toggle-all key. Per-package override of `--pin`/`--pin-channel`/`--target` via inline keybindings (`p` toggle pin, `c` toggle pin-channel) is a possible later extension.
- `--interactive` implies `--update` per ncu convention.
- Non-TTY environment: error out and suggest `--dry-run`.

**Implementation concern:**
- We are zero-dependency today. Hand-rolling raw-mode stdin multi-select is ~150 LOC and aligns with the no-dep philosophy. Pulling in inquirer would add bytes and a transitive dep tree. Decision deferred to the change that introduces this flag — leaning toward hand-rolling.

**Deferred because:** The TUI surface is meaningful on its own. It's also the granularity mechanism once multiple update-mode flags exist (`--pin`, `--pin-channel`, `--target @<tag>` allowing per-package override). Landing it before those flags exist means the TUI has nothing to offer per-package beyond selection.

**Open design questions for a future change:**
- Hand-rolled TUI vs inquirer-style dep. Lean: hand-rolled.
- Per-package flag override via inline keybindings, or per-package just "include/exclude" and global flags apply uniformly to selection? Lean: start with include/exclude only, add per-package override if the TUI feels incomplete.
- Color/visual treatment consistency with the existing report color treatment.
- Does `--interactive` compose with `--dry-run`? Probably yes — interactive selection followed by diff preview, no write. Worth identifying design before proposing.

---

## 5. Diff preview — `--dry-run`

**Origin:** Discussed during `implement-update-mode`.

**Question:** What does the user see when they want to preview updates without writing the file?

**Reasoning:**
- ncu's default is "check-only; use `-u` to write." So the default *is* dry-run in ncu. Our default under `--update` is "write the file" (per the "smallest good decision" compromise).
- A `--dry-run` flag suppresses the write and emits a unified-diff style preview to stdout.
- Diff format candidates: GitHub-style unified diff (line-level, `---`/`+++` headers, `@@` hunks); token-level diff; package-level before/after table (what the post-rewrite summary already uses under `--update`).
- For JSON targets where we re-stringify (we don't, per Decision 5 in `implement-update-mode`'s design), a stable indentation needed. We already concluded string surgery preserves the raw bytes, so a unified diff is meaningful.
- Composes with `--interactive`: interactive selection followed by diff preview, no write.

**Deferred because:** The post-rewrite summary in `implement-update-mode` already shows the user what changed after a successful write. A `--dry-run` is the safer default than "write with summary" but it's separable and easy to add. The "smallest good decision" was to skip `--dry-run` so the proposal surface stays one flag.

**Open design questions for a future change:**
- Diff format: unified diff (requires a small line-diff implementation, no external dep) vs. token-level, vs. just-package-level before/after (already implemented for the summary).
- Where to print: stdout (composable with shell pipelines) vs stderr (alongside the human-readable summary).
- Default target: should the default `--update` *become* dry-run and make a `--write` flag the opt-in to actually writing? Tradeoff: two-flag ergonomics vs. safer default. Discussed during `implement-update-mode` design — the chosen default is `--update` writes; revisit if shipping reveals safety issues.

---

## 6. Integrity hash regeneration

**Origin:** Discussed during `implement-update-mode`.

**Question:** When `--update` rewrites a URL, should we recompute its import-map SRI hash (`<algo>-<base64(hash(body))>`) rather than just stripping it?

**Reasoning:**
- SRI hashes are *not* "inferred" anywhere in normal tooling. Authors compute them at authoring time by `fetch`-ing the URL and hashing the decoded body with the algo specified in the existing hash prefix (typically `sha256`, `sha384`, or `sha512`).
- A CLI can do the same `fetch + hash` operation as the author would: `fetch(newUrl)` → `createHash(existingAlgo)` → `update(body)` → base64. Capability is there.
- **The brittle part**: matching the bytes the *browser* will fetch. Confirmed by analysis:
  - Brotli/gzip encodings: browsers `Accept-Encoding: br` and decode *before* SRI check, so they hash decoded bytes. CLI fetch defaults to `Accept-Encoding: identity` (no compression) and hashes the body as-is. Both hash the same bytes.
  - `User-Agent` / `Sec-Fetch-Site` request shaping: esm.sh DOES vary by UA for some dep set shapes (`esm.sh/x@1` vs `/x@1` based on build targets). Worth empirically validating before committing to regeneration as the default.
  - CDN rebuilds: esm.sh can rebuild the same URL over time. A "correct" hash computed today can become stale independent of our update logic. This problem is the same one authors face when they hand-curate SRI.
- Conclusion: **regeneration is technically straightforward but has a documented browser-vs-CLI byte-mismatch caveat.** Stripping + warning (the chosen behavior for `implement-update-mode`) is the honest minimal behavior; regeneration is an opt-in or default behavior for a later change.

**Deferred because:** The minimal `--update` change ships strip-and-warn behavior as the baseline. Regeneration needs empirical validation of the esm.sh UA-shaping concern and a `--no-regenerate-integrity` opt-out (or `--regenerate-integrity` opt-in) flag design.

**Open design questions for a future change:**
- Default state: regenerate-by-default with `--no-regenerate-integrity` opt-out, or strip-and-warn-by-default with `--regenerate-integrity` opt-in? Reasoning leans regenerate-by-default once we trust the byte-stability.
- Empirical spike: actually `fetch` a few esm.sh URLs with browser-shaped vs CLI-shaped Accept headers and compare hashes. If they match across a few test packages, default-to-regenerate is safe.
- Specify the request headers ecu sends when fetching for SRI computation — `Accept-Encoding: identity` and explicit `User-Agent: esm-check-updates/...` are likely candidates. Document this as a portable assumption.
- Handle multi-`integrity`-algo entries (e.g. `integrity: { url: "sha256-... sha384-..." }`) — recompute for each algorithm the original entry had.
- Handle SRI refresh across `?deps=` rewriting once that lands, since deps URLs may also have integrity entries.

---

## 7. `?deps=` query-string rewriting

**Origin:** Discussed during `implement-update-mode` and earlier `resolve-semver-ranges` exploration.

**Question:** esm.sh URLs can carry a `?deps=react@18,react-dom@19.2.3` query string pinning dependency versions. Should `--update` rewrite those dep pins too?

**Reasoning:**
- Rewriting root-package URLs is straightforward string surgery on a single `<package>@<version>` segment.
- `?deps=` rewrite requires parsing the packed query string, identifying each dep pin's package and version specifier, applying the same specifier-preservation matrix to each pin, reforming the query string, and re-encoding consistently with the original.
- The analyzer already parses `?deps=` pins into occurrences that feed the same analysis path — the parse side is solved. The serialization side is novel.
- Filter behavior under `--filter` once `?deps=` rewriting lands: filter applies per-dep-package, not per-root-package, since `?deps=` pins introduce additional package identities (`react-dom` inside a `react` URL). Per the future `--filter` design, this is "filter applies to each dep independently."

**Deferred because:** `?deps=` is a smaller surface than root-package rewriting but introduces a serialization concern (re-encoding the query string with the right separators and `%`-encoding semantics). Keeping `implement-update-mode` focused on root-package entries keeps the rewriter implementation trivial.

**Open design questions for a future change:**
- Preserve the original separator style: comma-only (current `?deps=` form), or also handle semicolons or other separators if any CDN supports them? esm.sh uses comma.
- Preserve URL encoding style of `%5E` for `^` in deps pins — same concern as the root-URL case.
- Handle multi-occurrence of the same dep across `?deps=` in different root URLs in the same target file (each handled independently).
- Update the `Specifier-Preserving Entry Rewrite` requirement's `?deps=` exclusion caveat in `update-mode` spec to remove the "out of scope" language when this lands.

---

## 8. Additional CDN families — `unpkg`, `jspm.io`

**Origin:** Listed as an Open Question in the existing `package-resolution` spec.

**Question:** Which additional CDN families should follow `esm.sh` and `jsdelivr`?

**Reasoning:**
- `unpkg` (and `esm.unpkg.com`) and `jspm.io` are the obvious candidates.
- Adding a CDN family touches `src/index.js` `parseSupportedPackageFromUrl` (new hostname branch + URL-shape parser) and the analyzer's CDN-specific URL-shape documentation comments (per the existing `CDN Reference Comments` requirement).
- Parser pattern is well-established by the two existing CDN parsers — third and fourth parsers should drop in cleanly.

**Deferred because:** No demand for additional CDNs has been articulated during the v1 + update-mode design. Each CDN also has its own release-URL-shape conventions that may introduce range/special-specifier parsing requirements distinct from esm.sh and jsdelivr.

**Open design questions for a future change:**
- Does `unpkg` URL shape differ for scoped packages, build-marks, subpaths in ways that complicate the existing parser pattern? Likely yes for build-marks, less so for subpaths.
- Does `jspm.io`'s `#solved` query or `?d=...` query patterns interact with our `?deps=` parsing? Need to validate before parsing.
- Should the existing `cli-bootstrap` extension-step shape stay? Yes — addition of new CDNs is pure addition per the existing `importmap-input` spec's "CDN-Backed Mapping Detection" requirement.

---

## 9. Scopes support

**Origin:** Listed as a Non-Goal in the existing `importmap-input` spec.

**Question:** Should `esm-check-updates` analyze `scopes` branches of import maps, not just top-level `imports`?

**Reasoning:**
- Today the analyzer warns that `scopes` are not yet supported and continues processing `imports`. `importmap-input` spec captures this as the `Scopes Handling` requirement.
- Supporting scopes means walking each scope block and applying the same `imports` parsing per scope, with per-scope provenance in the result.
- Provenance reporting (`--sources`) needs to disambiguate which scope block a given binding came from. Existing `(importMapKey, cdnFamily, specifier)` source label would gain a scope component.
- Update-mode rewrite for scoped entries: the URL string-surgery approach still works because destination URLs are still literal substrings of the file content. The boundary detection gets a slight wrinkle when the same URL appears in multiple scopes — but each is captured separately, so the rewriter substitutes correctly per occurrence.

**Deferred because:** The current warning behavior was deemed sufficient for v1 scope. Update mode adds a new reason to support scopes (a user with scopes wants their scoped URLs updated too), but the analysis side is its own design unit.

**Open design questions for a future change:**
- Provenance extension to source labels: `(importMapKey, cdnFamily, specifier, scope?)` or `scope` as a separate grouping dimension?
- Scope-priority semantics for resolution: when a key appears in both a top-level `imports` entry and a `scopes[<scope>].imports` entry, is the analyzer to identify both, dedupe them as one candidate, or report a destination-skew warning?
- Behavior under `--sources`: do source labels for scoped entries get a "scope" prefix/suffix?

---

## 10. Multi-target / recursive project scanning

**Origin:** Listed as an Open Question in the existing `cli` spec.

**Question:** Should the CLI accept multiple target paths or scan a project recursively?

**Reasoning:**
- ncu's `--packageFile` accepts a glob, with `--deep` for recursive scan.
- For esm-check-updates this would change the single-positional-arg contract to a glob-or-directory contract and aggregate analysis+rewrite across multiple files.
- Update mode under multi-target would write each file independently and produce a per-file summary plus an aggregate count at the end.

**Deferred because:** Single-target is simpler and covers the listed v1 cases (one HTML/JSON import map at a time). Multi-target introduces aggregation concerns across targets.

**Open design questions for a future change:**
- Positional glob vs `--target-path <glob>` flag (collision with `--target` for npm version targeting → use `--paths` or similar).
- Output format under multiple targets: per-target summary blocks vs. flat aggregate.
- Skip avoidable files: `.git/`, `node_modules/`, etc. by default.
- Default target lookup when no positional path is provided: walk the cwd? Auto-detect `index.html` / `importmap.json`? Obvious ambiguity — probably refused.

---

## 11. JSON / machine-readable output

**Origin:** Listed as a Non-Goal in the existing `reporting` spec.

**Question:** Should there be a `--json` flag for machine-readable analysis output (e.g. for CI gates)?

**Reasoning:**
- Today the CLI prints only human-readable terminal output. CI consumption would benefit from a JSON schema like `{ target, packages: [{ name, currentVersion, latestVersion, hasUpdate, severity }], warnings, notes, lookupFailures }`.
- Update mode under `--json` would emit the rewrite plan without the human-summary prose, suitable for piping tools or audit scripts.
- Exit code semantics under `--json` for CI: ncu uses `--errorLevel 2` to exit non-zero when no updates are found (CI gate). We considered a similar concern during `implement-update-mode` but deferred (no CI flag in this change).

**Deferred because:** JSON output is its own reporting-format change. Doesn't depend on update mode shipping first.

**Open design questions for a future change:**
- JSON schema shape (top-level vs. per-package result objects).
- Should `--json` imply `--no-color` automatically? Probably yes.
- Should `--json` work in both check-only and update modes? Yes.
- Does the JSON output include the post-rewrite summary semantic (rewritten rows, stripped integrity entries) when `--update` is set?

---

## 12. CI gate behavior

**Origin:** Listed as an Open Question in the existing `cli` spec.

**Question:** Should `esm-check-updates` return a non-zero exit code when updates are available (for CI gate usage)?

**Reasoning:**
- ncu's `--errorLevel 2` makes "no updates" a CI failure; the absence of updates is a CI success.
- For esm-check-updates the natural mapping is: check-only + `--error-level updates-available` exits non-zero when `hasUpdate` is true for any package (gate fails when updates are needed).
- Combined with future `--json` output (§11) this lets CI scripts integrate via either exit code or parsed output.

**Deferred because:** No CI consumer has been articulated. Default exit 0 on successful analysis (whether or not updates are found) is fine for human use.

**Open design questions for a future change:**
- Flag shape: `--error-level <level>` (ncu-style with values 0/1/2) or a simpler `--require-no-updates` boolean?
- Behavior under `--update`: probably still exit 0 on success regardless of whether rewrites happened; CI gates compose better with check-only + error-level.

---

## 13. Dist-tag "newer same-channel snapshot" surfacing

**Origin:** Discussed during `implement-update-mode`. Dist-tag entries already float; the only meaningful within-tag "upgrade" is moving to a snapshot the same channel's dist-tag would serve at request time.

**Question:** Should the analyzer surface as an informational note when another dist-tag on the same channel points to a *newer* snapshot than the user's dist-tag?

**Reasoning:**
- Observed in real data: `react@next → 19.3.0-canary-d5736f09-20260507` and `react@canary → 19.3.0-canary-df4bd1b4-20260708`. Both are canary-channel dist-tags; `canary` is the *snapshot* channel update.
- "Channels are semantic, not syntactic" — a registry scan can tell us "the prerelease channel IDs overlap" but cannot tell us whether `next` is *meant* to track ahead of `canary`.
- Surfacing this *as informational metadata* (a note) preserves user agency. The user reading the note decides whether to manually switch their dist-tag.
- Detecting same-channel snapshot overlap requires nontrivial prerelease comparison (parsing `19.3.0-canary-d5736f09-...` vs `19.3.0-canary-df4bd1b4-...` and treating the dash-separated suffix as a sortable timestamp/identifier). Our existing `compareVersions` `Number.parseInt || 0` fallback does not handle mixed-alphanumeric prerelease ordering.

**Deferred because:** Dist-tags are explicitly not rewritten in `implement-update-mode`. This advanced note behavior is informational polish for a user scenario that doesn't have a clear demand yet; surfacing more notes than necessary can feel noisy.

**Open design questions for a future change:**
- Implement proper semver-aware prerelease ordering (likely via a small `semverCompare` helper replacing the current `Number.parseInt` heuristic). This prerequisite touches the existing analyzer too.
- Decide the note's phrasing: "react appears as `@next` (resolved 19.3.0-canary-May). The `canary` dist-tag points to a newer same-channel snapshot (19.3.0-canary-July)." — too verbose? Compact version?
- Decide whether the note fires only for "newer" snapshots. What about `react@canary → July` and `react@next → May` with `latest > canary` *also*? Multiple notes packages? Information overload.

---

## 14. Default target lookup

**Origin:** Listed as an Open Question in the existing `cli` spec.

**Question:** Should `esm-check-updates` support auto-discovery of the target file when no positional path is provided?

**Reasoning:**
- ncu defaults to `./package.json` if not specified.
- ECU has no canonical target file. Candidates vary by project: `index.html`, `importmap.json`, `public/index.html`, `src/importmap.json`, etc.
- Auto-discovery introduces predictable-by-cwd-but-unpredictable-globally behavior, which is a footgun.

**Deferred because:** Single-target, explicit-positional-arg is the simplest contract. Auto-discovery is convenience for the user not paying attention to their target.

**Open design questions for a future change:**
- Algorithm: walk cwd depth-first for the first file matching a small allowlist (`importmap.json`, `index.html`)? Refuse if multiple candidates found?
- Compose reasonably with `--update` for safety (no accidental discovery of a rewrite target)?
- Almost certainly not worth doing. Leave as a documented Non-Goal.

---

## 15. Complete npm semver compatibility — partial specifier shapes and OR-ranges

**Origin:** Surfaced while extending `implement-update-mode` to cover the full caret/tilde matrix for `0.0.x` and tilde-cross-minor cases.

**Question:** Should ECU support partial specifier shapes (`^1.2`, `^1`, `~1`, `~0`) and OR-ranges (`1.2.3 || 1.5.0`), and how should it resolve/rewrite them?

**Reasoning:**
- npm's `node-semver` accepts partial shapes (`^1.2` = `>=1.2.0 <2.0.0`, `^1` = `>=1.0.0 <2.0.0`, `~1` = `>=1.0.0 <2.0.0`, `~0` = `>=0.0.0 <1.0.0`). esm.sh generally rejects these in URL paths (URLs need the concrete pin or dist-tag), but they can appear in `?deps=` query strings.
- OR-ranges (`1.2.3 || 1.5.0`) are vanishingly rare in CDN URLs and may not even parse cleanly in import-map contexts. The current `SPECIFIER_TOKEN_PATTERN` regex would reject them.
- The `resolveSemverRange` simplification targeted by task group 2 in `implement-update-mode` only handles fully-specified `^X.Y.Z` and `~X.Y.Z` shapes. Partial shapes (`^1.2`, `~1`) are not currently expected in CDN URLs and likely fall through to warning behavior. OR-ranges are categorically rejected.

**Deferred because:** CDN URL semantics don't expose partial shapes — esm.sh and jsdelivr both require fully-specified `X.Y.Z` or dist-tag in URL paths. `?deps=` parsing inherits the same constraint. So the partial-shape gap is more theoretical than practical for v1 / update mode.

**Open design questions for a future change:**
- If `?deps=` rewriting lands (see §7) and real-world `?deps=` values contain partial specifiers, this gap becomes real. Revisit then.
- OR-ranges are categorically unsupported; document this explicitly in a `package-resolution` Non-Goal.
- If we ever want to support `*` (any version) in `?deps=` (which esm.sh accepts in some forms), the resolution and rewrite paths need entirely new logic — currently the `SPECIFIER_TOKEN_PATTERN` regex already rejects bare `*`.

## Reference: existing specs' Non-Goals and Open Questions

This file complements the Non-Goals and Open Questions sections of the main `openspec/specs/` files. Those spec-level sections record *what's currently out of scope* for the main specs; this research file extends by capturing *why* each was deferred and *what we'd need to decide to revisit it*, ensuring exploration context is preserved when a future change picks the thread up.

## Indexing change history

The exploration that gave rise to each entry above is recorded in the corresponding change's `design.md` (and any proposal-level discussion that preceded it). See `openspec/changes/archive/` for completed changes.