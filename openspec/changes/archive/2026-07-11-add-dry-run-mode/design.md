## Context

Update mode (`--update` / `-u`) rewrites the target file in place through `rewriteTargetInPlace` (`src/rewrite-target.js`), which today couples two concerns: computing the rewrite plan (which entries change, what integrity entries get stripped, what the new file content is) and committing it (atomic temp-file write + `rename`). The post-rewrite summary (`formatUpdateSummary` in `src/report.js`) is only rendered *after* the write succeeds. There is no way to see the exact edits before they land, so the README tells users to commit first and rely on git to revert.

This change adds `--dry-run`: a preview of exactly what `--update` would write, rendered as a unified line diff, with no file modification. It is `future-work.md` §5. The chosen output format is a unified line diff (not a package-level summary), and `--dry-run` is a standalone mode that also overrides `--update` when both are present.

Constraints: zero runtime dependencies (the diff renderer is hand-rolled); user-facing behavior stays in sync with `README.md`; Node.js ESM CLI using built-ins only for arg parsing.

## Goals / Non-Goals

**Goals:**
- Let users preview the update-mode rewrite plan as a unified line diff without writing the file.
- Reuse the existing plan computation so dry-run and `--update` can never diverge in what they report vs. write.
- Preserve the ancillary guidance (`Warnings`, `Stripped integrity entries`, `Lookup Failures`, `Notes`) that a raw diff cannot convey.
- Keep the renderer dependency-free and the output honest — diff the actual bytes that would be written.

**Non-Goals:**
- Flipping the default so `--update` becomes dry-run-by-default (the shipped default stays "`--update` writes").
- A package-level before/after preview (that is what `--update`'s summary already produces; dry-run's diff replaces those rows).
- Intra-line / word-level diff highlighting.
- Making the diff a guaranteed-appliable patch (valid unified-diff format is a nice-to-have, not a contract).
- `--dry-run` interacting with the `--sources` package table (there is no table in dry-run output).

## Decisions

### Decision 1: Split `rewriteTargetInPlace` into `planTargetRewrite` + `commitTargetRewrite`

`planTargetRewrite(targetPath, report)` performs all pure computation: `collectRewritesFromReport`, `collectStrippedIntegrityEntries`, integrity stripping, and destination-URL rewriting, returning `{ rewrites, strippedIntegrityEntries, originalContent, updatedContent, noChanges, notes, warnings, lookupFailures, targetPath }`. `commitTargetRewrite(targetPath, plan)` performs the atomic write (temp file → `chmod` → `rename`, with cleanup on failure).

- `--update` = `planTargetRewrite` → `commitTargetRewrite` → `formatUpdateSummary`.
- `--dry-run` = `planTargetRewrite` → unified diff renderer (no commit).

**Why:** The seam is where the only side effect lives. It guarantees dry-run and update compute an identical plan, and it pays forward — `--interactive` (plan → user selects subset → commit) and any future diff work both need the plan and both content strings, which the plan now returns. `rewriteTargetInPlace` can remain as a thin wrapper over the two for backward compatibility, or callers can be updated directly.

**Alternative considered:** A `{ dryRun: true }` option on `rewriteTargetInPlace` that returns before the write. Rejected — it mixes concerns, and the name "InPlace" lies for a dry run.

### Decision 2: Hand-rolled LCS line diff in a new `src/unified-diff.js`

Compute a line-level diff of `originalContent` vs `updatedContent` using an LCS/Myers-style algorithm (~50 LOC), then emit standard unified-diff format: `--- <path>` / `+++ <path>` headers, `@@ -l,s +l,s @@` hunk headers with correct 1-based line numbers, 3 lines of context, and nearby changes coalesced into a single hunk.

**Why diff the content rather than derive hunks from the rewrite plan:** Integrity stripping (`stripIntegrityEntry`) removes lines and can change line count; deriving hunks from the `{oldUrl, newUrl}` rewrite list alone would miss those and could drift from what actually gets written. Diffing the real `updatedContent` is honest by construction — it reflects exactly the bytes `commitTargetRewrite` would produce.

**Why line-level, not intra-line:** Standard git behavior; a URL change shows as a `-`/`+` pair, which is readable and cheap. Word-diff is extra surface with little payoff for URL surgery.

**Why proper `@@` line numbers + context:** Only ~30 lines beyond a fake `@@` marker, strictly more useful, and keeps the output valid enough that `git apply` *could* consume it.

**Alternative considered:** Pull in a diff library. Rejected — violates the zero-dependency philosophy for ~50 LOC of well-understood code.

### Decision 3: Color reuses the existing treatment

The renderer uses the existing `colorize` helper and honors `NO_COLOR` + TTY detection exactly as `formatReport` / `formatUpdateSummary` do: green `+` lines, red `-` lines, gray/cyan hunk and file headers. `colorEnabled` is threaded through the same option shape.

**Why:** Consistency with existing output and identical test ergonomics (`NO_COLOR` disables color for byte-stable assertions).

### Decision 4: Dry-run output = banner + diff + ancillary sections

Output is a `Dry run — no files written.` banner, then the unified diff, then the same **Warnings / Stripped integrity entries / Lookup Failures / Notes** sections `formatUpdateSummary` emits. The diff replaces only the package `before → after` rows. When `plan.noChanges` is true, the banner body is `No changes would be written.` followed by the ancillary sections.

**Why keep the ancillary sections:** A diff shows *mechanics* (an integrity line disappears as a `-` line) but cannot convey the *guidance* — the "re-pin SRI manually" warning, dist-tag floating notes, destination-skew warnings, and lookup failures aren't visible in a diff at all. The stripped-integrity subsection is intentionally kept even though the removed lines also appear in the diff: the diff shows the removal, the section explains the consequence and names the triggering package.

**Implementation:** Factor the ancillary-section rendering so both `formatUpdateSummary` and the dry-run formatter share it, and parameterize the tense (`Updated X:` → `Would update X:` is unused since the diff replaces those rows; `No changes to write.` → `No changes would be written.`).

### Decision 5: `--dry-run` is a standalone mode; dry wins over `--update`

`parseArgs` computes `mode: dryRun ? "dry-run" : update ? "update" : "check"`. `--dry-run` requires exactly one positional target (same arity as check/update), exits `0` on success, and is valid without `--update`. Bare `esm-check-updates <t>` still prints the availability report; `--dry-run` instead shows the rewrite *plan* as a diff, so the two are distinct and non-redundant.

**Why dry wins:** `--dry-run` is the "do everything except the side effect" flag; when a user asks for a dry run they want no write, regardless of `--update` also being present. Erroring on the combination would be user-hostile.

### Decision 6: `--sources` / `--width` accepted but inert in dry-run; no short flag

`--dry-run` is long-form only (no `-d`, left unclaimed). `--sources` and `--width` parse without error alongside `--dry-run` but have no effect, since dry-run renders a diff, not the package table those flags size.

**Why:** Uniform arg handling (no special rejection path) and least surprise; documented as a no-op rather than a silent inconsistency.

## Risks / Trade-offs

- **Hunk coalescing + accurate line numbers is the only non-trivial code** → Cover the LCS helper with focused unit tests on small inputs (pure additions, pure deletions, mixed, adjacent-vs-separated changes) so the `@@` math is verified independently of the CLI.
- **`--sources`/`--width` as silent no-ops in dry-run could confuse** → Document explicitly in help/README; behavior is accept-and-ignore, not error.
- **Ancillary stripped-integrity lines appear twice (in the diff and in the subsection)** → Intentional and documented; the two serve different purposes (mechanics vs. guidance).
- **Keeping `rewriteTargetInPlace` as a wrapper vs. updating callers** → Prefer updating the single `bin` caller to the plan/commit pair to avoid a dead wrapper; existing update-mode tests confirm no behavior change.
