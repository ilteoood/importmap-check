# Reference Implementation Notes & Internal API

This document describes the **current reference implementation** of
`importmap-check`. It is **reference documentation, not a rebuild input.**

The observable contract a rebuild must satisfy lives entirely in
`openspec/specs/` — a spec-driven rebuild is derived from `openspec/specs/`
**alone** (no tests, and not this file).

Why this file is not a rebuild input: the "Reference internals" section below
records the reference implementation's internal decomposition (module layout,
helper functions, data-model internals). Feeding that to a rebuild would anchor
an independent derivation to the reference's structure and defeat the point of
building and comparing rebuilds. Keep it for human understanding of the
reference branch only.

## Enforcement without shipping tests

The portable behavioral tests stay on the reference branch and are run **against
a finished rebuild** to check it against the contract — they are not handed to
the rebuild as inputs:

- `test/api/` — asserts the `library-api` verb contract (`check` / `preview` /
  `update` and their `{ output, data }` shape) in-process.
- `test/cli/` — asserts the CLI surface as a black box.
- `test/helpers/` (mock registry + CLI runner) and `test/fixtures/` are the
  shared infrastructure those two buckets need.

`test/internals/` binds to the reference's internal decomposition and is
rewritten per rebuild — it is not part of the portable oracle.

## Observable contract → `openspec/specs/`

The frozen, observable contract is specified as OpenSpec capabilities:

| Concern                                                                                    | Capability             |
| ------------------------------------------------------------------------------------------ | ---------------------- |
| CLI surface (flags, exit codes, streams, sections)                                         | `cli`, `cli-bootstrap` |
| Library verbs (`check`/`preview`/`update`, `{ output, data }`, options, `registryBaseUrl`) | `library-api`          |
| Import-map parsing                                                                         | `importmap-input`      |
| Package/version resolution                                                                 | `package-resolution`   |
| Human-readable output                                                                      | `reporting`            |
| In-place rewrite behavior                                                                  | `update-mode`          |

The `library-api` capability is what makes `test/api/` runnable against a
rebuild: it fixes the verb names, the `{ output, data }` return shape, and the
`data` fields those tests assert on. The CLI registry override is
`IMPORTMAP_CHECK_REGISTRY_URL` (default `https://registry.npmjs.org`), the seam the mock
registry uses.

---

## Reference internals (NOT a rebuild input)

The following records how the reference implementation is decomposed. It is
advisory context for humans reading the reference branch — a rebuild may use a
completely different structure, and `test/internals/` is rewritten to match
whatever it chooses. **Do not feed this section to a spec-driven rebuild.**

### Module map

```
src/
  index.js                 public barrel (package main)
  api.js                   check / preview / update verbs
  semver.js                shared selector regexes (MAJOR/MINOR_SELECTOR_PATTERN)
  analysis/
    load.js                loadImportMaps, normalizeImportMaps, createAnalysisError
    cdn-url.js             parseSupportedPackageFromUrl, parseDependencyPins, buildCdnSpec, formatSourceLabel
    resolve-version.js     defaultResolveLatestVersion, defaultResolveSpecifier, resolveSemverRange, compareVersions
    analyze.js             analyzeTarget
  rewrite/
    specifier.js           rewriteSpecifier
    target.js              planTargetRewrite, commitTargetRewrite, rewriteTargetInPlace, replaceDepsSpecifier
  reporting/
    format.js              formatReport, formatUpdateSummary, formatDryRunSummary
    unified-diff.js        renderUnifiedDiff
```

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

`Report` and `Plan` are the observable `data` payloads (their shape is fixed by
the `library-api` capability); the internal fields not asserted by `test/api`
(`allOccurrences`, `originalContent`, `updatedContent`) are reference detail.

```
Report {
  packageResults: PackageResult[],   // sorted by packageName
  warnings: { type: string, message: string }[],
  notes: { message: string }[],
  lookupFailures: { packageName: string, message: string }[],
  allOccurrences: Occurrence[],      // reference detail
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
  originalContent: string | null,    // reference detail (null when noChanges)
  updatedContent: string | null,     // reference detail (null when noChanges)
  targetPath: string,
  warnings, notes, lookupFailures,   // carried from Report (+ integrity-strip warnings)
}
```

Shared test infrastructure: `test/helpers/mock-registry.js`
(`startMockRegistry`, `packument`, `packumentsFromMaps`), `test/helpers/cli.js`
(`runCli`), and `test/fixtures/importmaps/`. Run the portable oracle against a
rebuild with `npm run test:baseline`; run the decomposition-specific tests with
`npm run test:internals`.
