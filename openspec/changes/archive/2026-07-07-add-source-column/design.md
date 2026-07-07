## Context

`esm-check-updates` groups multiple import-map entries that resolve to the same package into one row in the Updates and Current sections (`groupByPackage` in `src/index.js`). Each occurrence already carries provenance fields — `cdnFamily`, `destinationUrl`, `key`, `keyKind`, `importMapIndex`, `sourcePath` — but none of this surfaces in the report. A user with `react` referenced in three entries gets one row that says `react | 18.3.1 | 19.3.0` and no clue which entry to edit.

`formatReport` in `src/report.js` sizes columns purely by max content length and never reads `process.stdout.columns`. Wrapping isn't supported anywhere in the existing rendering path. The reporting spec already lists "Exact frozen spacing or column width rules" as a Non-Goal, giving us license to introduce width awareness.

The `resolve-semver-ranges` change (currently paused at 0/24 tasks) will add a `specifier` field to each occurrence and a fourth dimension of per-package skew (specifier skew, plural like the existing `currentVersions` skew). That change also reshapes `packageResults` — we want to land the `sources` field here first, then have `resolve-semver-ranges` add `specifier` alongside it as a strictly additive edit.

## Goals / Non-Goals

**Goals:**
- Make the report actionable by showing which import-map entries contributed to each conflated package row
- Show source entries in a way that scales to a wide modern terminal default (120 cols) while degrading gracefully on narrower widths
- Ship as a separate, orthogonal change before resuming `resolve-semver-ranges`
- Keep default output byte-identical to today (opt-in only)

**Non-Goals:**
- Showing per-occurrence destination URLs (too verbose; defeats conflation)
- Applying width awareness or wrapping to the default three-column report (only the Source column wraps, only when `--sources` is on)
- Showing integrity metadata or other occurrence fields beyond the source label
- Surfacing sources in Warnings or Lookup Failures sections (those already name the offending value)
- Adding `--width` behavior to the default (no-`--sources`) path

## Decisions

### 1. Source label format: `<importMapKey> (<cdnFamily>@<specifier>)`

**Decision:** Each unique source is rendered as `<importMapKey> (<cdnFamily>@<specifier>)` when a non-pin specifier exists, or `<importMapKey> (<cdnFamily>)` for plain pins. For `?deps=` occurrences, the import-map key is `<hostKey>?deps` (matching the existing `collectPackageOccurrences` line 364 convention).

**Examples:**
```
react (esm.sh@18)                      ← root entry, specifier "18"
react/jsx-runtime (jsdelivr@^18.2.0)   ← subpath entry, specifier "^18.2.0"
swr?deps=react@18.3.1 (esm.sh)         ← deps pin, plain pin
react (esm.sh)                         ← root entry, plain pin
```

**Conflation key:** `(importMapKey, cdnFamily, specifier)`. Same key collapses to one Source line even if it appears in multiple import maps (rare but possible for multi-map HTML files).

**Alternatives considered:**
- `(cdnFamily, specifier)` only — compact but the user has to grep the file to find which entry to edit; loses the actionable part.
- Full `destinationUrl` — most literal but defeats conflation and produces extremely wide lines even for one-source cases.

### 2. Width detection: explicit > TTY > 120 fallback

**Decision:** `availableWidth = options.width ?? process.stdout.columns ?? 120`. The 120 fallback applies in all non-TTY contexts (pipes, `node --test`, CI logs).

**Rationale:** 80 is archaic for CLI output in 2026. Contemporary terminal defaults (iTerm, VS Code integrated terminal, Windows Terminal, GNOME Terminal) all open wider than 120 by default on modern displays. 120 matches GitHub's line width and most editor wrapping. `process.stdout.columns` is already the right Node.js API; it returns `undefined` in piped/test contexts, which is exactly when users most need a sensible default.

**Alternatives considered:**
- 80 fallback — too narrow; forces wrapping on most realistic Source content.
- `Number.MAX_SAFE_INTEGER` (no constraint) — would never wrap, breaking the entire point of width awareness.
- Read `COLUMNS` env var — `process.stdout.columns` already accounts for it on POSIX; redundant.

### 3. Width-aware rendering scope: only when `--sources` is on

**Decision:** The width math, the wrapping, and the multi-line cell rendering activate together when `--sources` is passed. Without the flag, `formatReport` produces byte-identical output to today (no width read, no `process.stdout.columns` access, max-content sizing).

**Rationale:**
- Existing test output stays unchanged → no churn in other changes' test tasks.
- The three-column case rarely overflows (package names + two short version strings); wrapping there risks regressing existing UX for marginal benefit.
- Multi-line cells are inherent to Source (source lists are expected to be long); they are out of place in three-column rendering.

**Alternatives considered:**
- Always width-aware — would force re-blessing every existing test fixture output and risks surprising users who piped output and relied on no wrapping.

### 4. Column width math: first three columns max-content, Source gets remainder

**Decision:** When `--sources` is on, `packageWidth`, `currentWidth`, and `latestWidth` are computed as today (max content length). The Source column receives `availableWidth - (packageWidth + currentWidth + latestWidth + delimiter overhead)`.

```
availableWidth = 120 (example)

  pkgWidth | curWidth | latWidth | sourceWidth
  ─────────┼──────────┼──────────┼─────────────
     18    |    7     |    7     |    82
```

Edge case: if the first three columns already exceed `availableWidth`, `sourceWidth` floors at a minimum (e.g. 20 chars) and the Source cell wraps aggressively. We don't truncate Package/Current/Latest to make room — those are the values the user came for.

### 5. Wrapping rules within the Source cell

**Decision:** Three-step rendering with hanging indent aligned to the Source column start.

```
Step 1: Inline (single line)
  react (18)  | 18.3.1 | 19.3.0 | react (esm.sh@18), swr?deps=react@18.3.1 (esm.sh)
                                        ↑ fits in sourceWidth

Step 2: One source per line with hanging indent aligned to Source column start
  Package        | Current | Latest | Source
  ---------------|----------|--------|------------------------------------
  react (18)     | 18.3.1   | 19.3.0 | react (esm.sh@18)
                 |          |        | react/jsx-runtime (jsdelivr@^18.2.0)
                 |          |        | swr?deps=react@18.3.1 (esm.sh)

Step 3: If a single source line exceeds sourceWidth, word-wrap that line
  with a 2-space deeper hanging indent to visually distinguish same-source
  continuation from next-source lines:
                 |          |        | react/jsx-runtime
                 |          |        |   (jsdelivr@^18.2.0)
```

**Rationale:** Hanging indent on multiple sources (Step 2) is readable at a glance. The extra 2-space indent for word-wrap (Step 3) signals "this is still the same source" rather than "this is a new source."

### 6. CLI flag surface: `--sources`, `--width <number>`

**Decision:** Two new flags, both opt-in, no short forms.

```
--sources        Enable the Source column
--width <int>    Override available width (for tests / CI / deterministic piping)
```

**Validation:**
- `--width` must be a positive integer ≥ 40 (smaller values can't fit even the three base columns). Invalid values produce a CLI error to stderr with non-zero exit.
- `--width` without `--sources` is allowed but silently unused (the default path doesn't read width). We could reject it, but allowing it is simpler for users who script `--sources --width=100` and toggle `--sources` off in one place.

**Help text update:** add to the existing `Options:` block in `formatHelp`.

**Alternatives considered:**
- Make `--width` imply `--sources` — surprising implicit behavior; rejected.
- Add short forms (`-s`, `-w`) — `bin/esm-check-updates.js` currently has no short forms for non-help/version flags; we keep the surface minimal.

### 7. `analyzeTarget` and data propagation

**Decision:** `analyzeTarget(targetPath, options)` accepts a new `withSources` boolean (default `false`). When `true`, the loop in `analyzeTarget` populates `packageResults[i].sources` for each grouped package — an array of `{ importMapKey, cdnFamily, specifier }` entries deduped by conflation key and sorted by `(importMapKey, cdnFamily, specifier)` for deterministic output.

When `withSources` is `false`, the `sources` field is `undefined` (not an empty array) to make the "off" path trivially distinguishable and to avoid the dedup/sort cost for the 99% case.

**Alternatives considered:**
- Always populate `sources` and let `formatReport` decide whether to render — wasteful for default use; makes the opt-in flag meaningless in code.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Multi-line cells break consume-by-line parsers (e.g. `grep react`) | Document that `--sources` output is multi-line; default single-line output is preserved for piped consumers |
| Wrapping looks wrong on extremely narrow terminals (< 40 cols) | Floor sourceWidth at 20; flag `--width` below 40 as invalid; accept grumpy rendering below 40 (out of scope) |
| Users set `--width` very high and wrap never fires | That's their choice; aligned columns will just have right-side slack |
| Determinism across CI runs | Width falls back to 120 deterministically in non-TTY contexts; tests use explicit `options.width` |
| Reading `process.stdout.columns` in worker threads or unusual runtimes | The fallback chain handles `undefined`; no throw |
| Sampling error if `process.stdout.columns` lies (some terminals report 0) | Treat `0` as `undefined` (fall through to 120) |
| Future `resolve-semver-ranges` change adds `specifier` to the source label | Source label here already includes `@<specifier>` slot; min() adaptation when that change lands |

## Migration Plan

No migration. Default behavior is byte-identical to today. The new column and width awareness are opt-in via `--sources` (and optionally `--width`).

## Open Questions

- None remaining. All decisions above were discussed and confirmed.