# Rebuild Contract & API Guide

This document, together with `openspec/specs/`, is the input for rebuilding
`esm-check-updates` from scratch. It separates the **frozen contract** every
rebuild must satisfy (Tier 1) from an **advisory decomposition guide** a rebuild
may adopt or reinvent (Tier 2).

The portable behavioral baseline lives in `test/api/` and `test/cli/`. Those
tests bind only to Tier 1. `test/internals/` binds to Tier 2 and is expected to
be rewritten per rebuild.

Rip-out set for the experiment: `openspec/changes/archive`, `src/`, `test/`.
Survivors (rebuild inputs): `openspec/specs/`, this file, `README.md`,
`package.json`, and the portable baseline tests. `bin/` is a thin adapter over
the Tier-1 verbs; a rebuild may keep it as-is or regenerate it.

---

## Tier 1 — Frozen contract (a rebuild MUST satisfy)

### CLI surface (`bin/esm-check-updates.js`)

- Invocation: `esm-check-updates [options] <target-path>` with exactly one
  positional target path.
- Flags: `-h, --help`; `-v, --version`; `--sources`; `--width <n>` (integer,
  `>= 40`, only meaningful with `--sources`); `-u, --update`; `--dry-run`.
  `--dry-run` takes precedence over `--update` (never writes).
- Target types: `.json` import map, `.html`/`.htm` with inline
  `<script type="importmap">`.
- Streams & exit codes: human-readable report → `stdout`; invalid invocation and
  fatal errors → `stderr`. Exit `0` on success (including "updates found" and
  "no updates"); non-zero on invalid args, missing/unreadable/unsupported
  target, or fatal error.
- `--version` prints `package.json`'s `version` (never hard-code it).
- Registry override: `ECU_REGISTRY_URL` selects the npm registry base URL
  (default `https://registry.npmjs.org`). This is a real configuration knob
  (private registries) and the seam the test suite uses to point at a mock
  registry — it is NOT a test-only hook baked into library code.
- Output section names (when present): `Updates`, `Current`, `Warnings`,
  `Lookup Failures`, `Notes`, `Stripped integrity entries`. Report columns:
  `Package`, `Resolved`, `Latest`, and `Source` (with `--sources`).
  **Exact spacing, column widths, delimiters, and prose wording are NOT frozen**
  (see `openspec/specs/reporting` Non-Goals). The baseline asserts values,
  section presence, and behavior — not formatting.

### Library verbs (`src/index.js`) — the minimum, not-CLI-aware API

Each verb takes a target path plus plain options and returns `{ output, data }`,
where `output` is the rendered human-readable string (reporting is a library
concern) and `data` is the structured result. Verbs do no argv parsing, no
`process.exit`, and no TTY sniffing; the caller supplies `colorEnabled` and the
effective report `width`. Fatal conditions throw an `Error` whose `.exitCode`
the caller may honor.

```
check(targetPath, {
  sources?: boolean,          // render the Source column
  width?: number,             // available width for width-aware rendering
  colorEnabled?: boolean,     // default false
  registryBaseUrl?: string,   // default https://registry.npmjs.org
}) => Promise<{ output: string, data: Report }>

preview(targetPath, {         // dry-run: plan + diff, writes nothing
  colorEnabled?: boolean,
  registryBaseUrl?: string,
}) => Promise<{ output: string, data: { report: Report, plan: Plan } }>

update(targetPath, {          // rewrites the target file atomically
  colorEnabled?: boolean,
  registryBaseUrl?: string,
}) => Promise<{ output: string, data: { report: Report, plan: Plan } }>
```

---

## Tier 2 — Advisory decomposition guide (non-binding)

These are the internal helpers and data models the reference implementation uses.
They encode hard-won semantics (npm semver locking, `?deps=` splicing, unified
diff). A rebuild may adopt this decomposition, restructure it, or replace it —
`test/internals/` is rewritten to match whatever a rebuild chooses.

### Internal functions

```
analyzeTarget(targetPath, {
  registryBaseUrl?, withSources?,
  resolveLatestVersion?, resolveSpecifier?,   // optional injection hooks
}) => Promise<Report>

planTargetRewrite(targetPath, report) => Promise<Plan>
commitTargetRewrite(targetPath, plan) => Promise<void>   // atomic temp+rename

formatReport(report, { colorEnabled?, sourcesEnabled?, width? }) => string
formatUpdateSummary(plan, report, { colorEnabled? }) => string
formatDryRunSummary(plan, report, { colorEnabled? }) => string

resolveSemverRange(packageName, specifier, registryBody) => string | null
rewriteSpecifier(specifier, latestVersion) => string | null
replaceDepsSpecifier(url, packageName, newSpecifier) => string
renderUnifiedDiff(originalContent, updatedContent, filePath, { colorEnabled? }) => string
```

### Data models

```
Report {
  packageResults: PackageResult[],   // sorted by packageName
  warnings: { type: string, message: string }[],
  notes: { message: string }[],
  lookupFailures: { packageName: string, message: string }[],
  allOccurrences: Occurrence[],
  targetPath: string,
}

PackageResult {
  packageName: string,
  resolvedVersions: string[],        // unique current versions, sorted
  latestVersion: string,
  hasUpdate: boolean,
  severity: "major" | "minor" | "patch" | null,
  specifiers: string[],              // original range/selector/dist-tag forms
  sources?: PackageSource[],         // present only when sources requested
}

Plan {
  noChanges: boolean,
  rewrites: { packageName, currentVersion, latestVersion, oldSpecifier, newSpecifier }[],
  strippedIntegrityEntries: { url, packageName, message }[],
  originalContent: string | null,    // null when noChanges
  updatedContent: string | null,     // null when noChanges
  targetPath: string,
  warnings, notes, lookupFailures,   // carried from Report (+ integrity-strip warnings)
}
```

---

## Test layering

| Bucket            | Layer             | Binds to             | Portable across rebuilds?  |
| ----------------- | ----------------- | -------------------- | -------------------------- |
| `test/internals/` | 1 — internals     | Tier 2 signatures    | No — rewritten per rebuild |
| `test/api/`       | 2 — library verbs | Tier 1 verb contract | Yes                        |
| `test/cli/`       | 3 — CLI adapter   | Tier 1 CLI surface   | Yes                        |

Shared test infrastructure (survives with the baseline):

- `test/helpers/mock-registry.js` — a local HTTP npm-registry stand-in
  (`startMockRegistry`, `packument`, `packumentsFromMaps`). Code under test
  reaches it through `registryBaseUrl` / `ECU_REGISTRY_URL`; no test hook is
  compiled into library code.
- `test/helpers/cli.js` — spawns the CLI against a fresh mock registry per run
  (`runCli(args, { env, registry })`) and manages fixture temp dirs.
- `test/fixtures/importmaps/` — import map JSON and inline-HTML fixtures.

Run the portable baseline against any rebuild with `npm run test:baseline`;
run the decomposition-specific tests with `npm run test:internals`.
