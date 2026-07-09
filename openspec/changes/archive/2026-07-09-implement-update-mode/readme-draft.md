# README Update Draft — `--update` Mode

This is a draft of the prose that will land in `README.md` during implementation of `implement-update-mode`. The current README is unchanged; this preview exists so the user-facing behavioral commitments are visible *before* implementation begins.

## Diff against current README (overview)

**Replace** in the Overview section:

> ECU reads your ESM import maps and identifies dependency versions and available upgrades. The current CLI is check-only: it analyzes targets and reports findings without modifying files.

**With**:

> ECU reads your ESM import maps and identifies dependency versions and available upgrades. The default invocation is check-only: it analyzes targets and reports findings without modifying files. Pass `--update` / `-u` to rewrite updateable entries in place.

**Replace** in Options:

> - `--sources` — Show the import-map entry origins that contributed to each conflated package row.
> - `--width <num>` — Override the available report width (used with `--sources`). Defaults to the terminal width, or `120` when not running in a TTY.

**With**:

> - `--sources` — Show the import-map entry origins that contributed to each conflated package row.
> - `--width <num>` — Override the available report width (used with `--sources`). Defaults to the terminal width, or `120` when not running in a TTY.
> - `-u, --update` — Rewrite updateable entries in the target file in place. See **Update Mode** below for behavior, judgment calls, and caveats.

**Replace** at the end of "Current behavior":

> - Does not update files in place yet

**With**:

> - Use `--update` / `-u` to rewrite updateable entries in place (see **Update Mode**)

## New `## Update Mode` section (placed after Usage, before Development Workflow)

## Update Mode

```sh
$ esm-check-updates --update [options] <target-path>
```

`--update` / `-u` rewrites updateable import map entries in the target file in place and prints a post-rewrite summary to stdout describing what changed. The default target is the npm registry's `latest` dist-tag.

> ⚠️ **Make sure your target file is in version control and all changes are committed before running `--update`.** ECU does not snapshot before writing; the atomic write step protects against interrupted writes but not against losing work you hadn't committed.

### Rewrite behavior by specifier class

ECU preserves the specifier style you wrote. The exact rewrite depends on the specifier class:

| Specifier class     | Example              | When `--update` finds an update, the entry becomes |
|---------------------|----------------------|------------------------------------------------------|
| Pinned              | `react@19.2.3`       | `react@<latest>`                                     |
| Caret range         | `react@^19.2.3`      | `react@^<latest major>.0.0`                          |
| Tilde range         | `react@~19.2.3`      | `react@~<latest major>.0.0` (cross-major) or `react@~<latest>.<latest minor>.0` (cross-minor within major) |
| Major-only selector | `react@18`           | `react@<latest major>`                               |
| Minor-only selector | `react@18.3`         | `react@<latest major>.<latest minor>`               |
| Dist-tag            | `react@beta`         | **not rewritten** — see *Dist-tag entries* below     |

Each rewrite preserves every other portion of the URL (CDN family, scoped package name, subpath, query parameters). Caret and tilde rewrites follow npm's semver locking rules: caret locks the leftmost non-zero element of `[major, minor, patch]`; tilde locks the position immediately left of the rightmost-specified position.

### Major-version-zero ranges

Per npm's "0.x changes are breaking" rule, ranges on `0.x` packages lock the minor position (not the major):

- `react@^0.1.0` with `latest=0.2.5` rewrites to `^0.2.0` (within-0.x lift, locked-minor moves from 0.1 to 0.2)
- `react@^0.1.0` with `latest=1.0.0` rewrites to `^1.0.0` (fallthrough to major-locked semantics)
- `react@^0.0.3` with `latest=0.0.5` rewrites to `^0.0.5` (within-0.0.x lift, only the locked patch position moves)
- `react@^0.0.3` with `latest=0.1.0` rewrites to `^0.1.0` (promotion from patch-locked to minor-locked)
- `react@~0.0.3` follows npm's quirk where `~0.0.z := >=0.0.z <0.0.z+1` (same as caret on 0.0.x), and rewrites the same way as `^0.0.3`

The narrow `^0.0.z` handling is intentional: ESM CDNs apply actual npm semver rules at request time, so broadening `^0.0.3` to `^0.5.0` would silently admit any 0.x version esm.sh serves — which is not what the `^0.0.3` specifier expresses.

### Dist-tag entries are not rewritten

Dist-tag entries (e.g. `react@beta`, `react@next`, `react@latest`) are **not rewritten** by `--update`. ESM CDNs re-resolve dist-tags from the npm registry live at request time, so a `react@beta` URL already floats to whatever `dist-tags.beta` currently points to — there is no time-of-authoring version lag the tool is responsible for closing. Rewriting `react@beta` to e.g. `react@19.0.0-beta-...` would only snapshot a value the user already had access to via the floating tag, which is an opt-in decision the user should make explicitly.

When `--update` runs and encounters a dist-tag entry whose resolved version is older than the current `latest` dist-tag, the post-rewrite summary **notes** the situation so you can manually re-specify if desired:

```
## Notes
- react appears as `@beta` (resolved 19.0.0-beta-26f2496093-20240514).
  Stable latest is 19.2.7 (greater than your tag).
  No rewrite applied — dist-tag entries float at the registry.
```

Future changes will add `--pin` and `--pin-channel` flags for opt-in dist-tag flattening.

### Integrity entries are stripped, not regenerated

When `--update` rewrites a URL that has a corresponding entry in the import map's `integrity` section, ECU **strips** that integrity entry and emits a hard warning:

```
## Stripped integrity entries
- https://esm.sh/react@19.3.0 (triggered by react)
```

Stripped entries are **not regenerated** in this version. SRI hashes are author-time commitments to specific bytes the browser will fetch; computing a replacement hash requires fetching the new URL's body and matching the request-shaping a browser would use, which has documented edge cases around brotli/gzip encodings and esm.sh's user-agent-sensitive build-target selection. Rather than ship brittle regeneration silently, ECU leaves re-pinning to you: validate the new URL in a browser, then re-add the SRI hash manually.

A future change will add `--regenerate-integrity` (with a `--no-regenerate-integrity` opt-out) once the browser-vs-CLI byte-stability question has been empirically validated.

### `?deps=` query pins are not rewritten

esm.sh URLs may carry a `?deps=react@18,react-dom@19.2.3` query string pinning dependency versions. In this version, `--update` **analyzes and reports** `?deps=` pins in check-only output (in the existing three-column table) but **does not rewrite** those pins during `--update`. The root-package URL is rewritten; the dependency pins inside its `?deps=` query string are left unchanged.

`?deps=` rewriting will land in a separate change where the query-string serialization concerns (separator handling, URL-encoding consistency) can be addressed in their own right.

### Resolution tightening (check-only behavior change)

This change also tightens ECU's existing range-resolution logic for `^0.x.y` and `~0.0.z` specifiers in check-only mode. Previously, `^0.2.3` was treated as `^0` (resolved to the highest 0.x version published), and `~0.0.3` was treated as `~0.0`. Both were looser than npm's strict semver rules.

Going forward, `^0.2.3` resolves to the highest 0.2.x version, and `^0.0.3` resolves to the highest 0.0.x version — matching what esm.sh itself serves at request time. This may change the `Resolved` value ECU reports for some import map entries versus prior versions of the tool. The previous values were reflecting looser-than-npm semantics; the new values reflect what the CDN actually serves.

### Single target, single invocation

ECU operates on exactly one target path per invocation. Multi-target scanning and `--filter`/`--reject` (per-package targeting) are deferred to future changes. `--update` rewrites every updateable entry in the file; to apply updates selectively, use version control to revert unwanted changes after the write, or wait for the `--filter` / `--interactive` follow-up changes.

### Atomic write

`--update` writes the rewritten content to a temporary file in the same directory as the target, then atomically moves the temporary file onto the target path. An interrupted update never leaves a half-written target file. The temporary file is cleaned up if the write or move step fails.

## Example: Update Mode

```bash
$ esm-check-updates --update ./public/index.html
Updated ./public/index.html:

  react         19.2.3 → 19.3.0
  react-dom     ^19.2.3 → ^20.0.0
  swr           18 → 19
  @scope/lib    ^0.1.0 → ^0.2.0

## Stripped integrity entries
- https://esm.sh/react@19.3.0 (triggered by react)
- https://esm.sh/react-dom@^20.0.0 (triggered by react-dom)

## Notes
- typescript appears as `@beta` (resolved 4.6.2-insiders.20220225).
  Stable latest is 7.0.2 (greater than your tag).
  No rewrite applied — dist-tag entries float at the registry.
```

Run `esm-check-updates --update` again against the same file with stable `latest` dist-tags and you'll see `No changes to write` — the update is idempotent until the npm registry's `latest` moves.