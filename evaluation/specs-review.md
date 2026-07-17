# OpenSpec specs review

Reviewed `openspec/specs/` for the spec-driven rebuild exercise: are these
good, well-formed OpenSpec specs, and are they clean inputs for a from-scratch
rebuild? The historical `openspec/changes/` were removed as part of the reset,
so this file records the review and the cleanup rationale.

All 6 surviving specs validate: `openspec validate --specs` → 6 passed, 0 failed.

## Baseline assessment

The specs are structurally sound and follow OpenSpec conventions: `## Purpose`,
`## Requirements`, `### Requirement: <Name>` with normative **SHALL** statements,
and `#### Scenario:` blocks written as WHEN/THEN/AND. Collectively they cover the
three verbs (`check`/`preview`/`update`) and the CLI modes, with a clean
library-vs-CLI split:

| Capability           | Role                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `library-api`        | `check`/`preview`/`update` contract: `{ output, data }`, not-CLI-aware, `data`/`plan` shapes       |
| `cli`                | Command surface: flags, arity, modes, exit codes, help                                             |
| `importmap-input`    | Accepted inputs: JSON / inline-HTML import maps, entry classification, scopes, integrity awareness |
| `package-resolution` | CDN URL parsing, version/range/dist-tag resolution, package conflation                             |
| `reporting`          | Human-readable output: sections, columns, Source column, color, diff, dry-run banner               |
| `update-mode`        | Atomic rewrite, specifier-preserving lifts, `?deps=` pins, integrity strip, dry-run                |

## Cleanup applied (full cleanup)

1. **Removed `cli-bootstrap`** — it was stale and _contradicted_ the other
   specs. Its central scenario asserted a valid target yields "analysis is not
   implemented yet" + a non-zero exit, while `cli`/`library-api`/`reporting`
   specify full analysis + exit `0`. It was the first-change bootstrap spec,
   superseded by `cli`. Deleted `openspec/specs/cli-bootstrap/`.

2. **Stripped repo-layout leakage** — `cli`'s _CLI And Functional Code
   Separation_ requirement mandated the `bin/importmap-check.js` ↔ `src/` file
   split. Reworded to the behavioral contract (command-line orchestration in the
   CLI layer; analysis/reporting in the not-CLI-aware library layer) without
   naming file paths. The "no third-party CLI parsing library" constraint
   (_Built-In CLI Implementation_) was kept — it is a genuine design constraint,
   not layout.

3. **Removed code-comment requirements** — _Import Map Reference Comments_
   (`importmap-input`) and _CDN Reference Comments_ (`package-resolution`)
   mandated that source code carry doc-link comments. That is a process/style
   rule, not observable behavior, and does not belong in a behavior spec.

4. **De-scoped change-era wording** in `update-mode` — "not rewritten _in this
   change_", "SHALL NOT compute … _in this change_", and the scenario title
   "Integrity regeneration is not performed _in this change_" were rewritten as
   steady-state statements. A synced spec should read as the current contract,
   not as a point-in-time change proposal.

5. **De-duplicated reporting layout** — the column/table format was specified in
   both `reporting` (authoritative: _Package-Centric Reporting_) and
   `package-resolution` (_Three-Column Reporting Format_). Replaced the latter
   with _Resolved Entry Reporting Data_ — it states which values each resolved
   entry must carry (package name, original specifier, resolved version, latest)
   and defers presentation to `reporting`, removing the drift risk.

6. **Removed the dead `docs/CONTRACT.md` reference** — `library-api`'s Non-Goals
   pointed at `docs/CONTRACT.md`, which the reset deleted. Reworded to describe
   internal decomposition as out of scope without pointing at a removed file.
   Also updated the stale `test/api` path reference to `test-baseline/api`.

7. **Added the mode↔verb mapping** — `cli` spoke only in "modes"; only
   `library-api` used the verb names. Added a one-line note in `cli`'s Purpose:
   default → `check`, `--dry-run` → `preview`, `--update`/`-u` → `update`.

Minor: normalized `## Purpose`/`## Requirements` blank-line spacing in
`package-resolution` and `reporting`.

## Applicability to the rebuild exercise

With the above changes the specs describe **observable behavior only** — no file
layout, no code-comment mandates, no change-era caveats — so a from-scratch
rebuild is free to organize `src/` however it likes while remaining judged
purely on the behavior the `test-baseline/` suite exercises. The one remaining
behavioral constraint that touches implementation choice (no third-party CLI
parsing library) is intentional and preserved.
