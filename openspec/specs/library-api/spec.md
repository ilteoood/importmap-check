# Library API

## Purpose

Define the minimal, not-CLI-aware library API surface that `importmap-check`
exposes for programmatic use and that the CLI is built on. This is the
observable contract for the package's main module: the verb entry points, their
options, and the shape of the structured result they return. It deliberately
does not prescribe internal decomposition — only what a caller (and the
`test-baseline/api` suite) can observe.

## Requirements

### Requirement: Verb Entry Points

The system SHALL expose `check`, `preview`, and `update` as asynchronous
functions from the package's main module. Each SHALL accept a target path and an
options object and SHALL resolve to a result of the form `{ output, data }`,
where `output` is the rendered human-readable string and `data` is the
structured result. The functions SHALL NOT read process arguments, call
`process.exit`, or infer presentation from the terminal; the caller supplies
presentation options. A fatal condition SHALL be signaled by throwing an `Error`
carrying an `exitCode` property.

#### Scenario: check returns a report and rendered output

- **WHEN** `check(targetPath, options)` is called for a supported target
- **THEN** the call resolves to `{ output, data }`
- **AND** `output` is the rendered check report defined by the `reporting` capability
- **AND** `data` is the analysis report defined by the `Analysis Result` requirement

#### Scenario: preview returns a plan and a diff without writing

- **WHEN** `preview(targetPath, options)` is called
- **THEN** the call resolves to `{ output, data }` where `data` is `{ report, plan }`
- **AND** `output` is the dry-run preview defined by the `reporting` capability
- **AND** the target file is not modified

#### Scenario: update writes the target and returns a summary

- **WHEN** `update(targetPath, options)` is called and updates are available
- **THEN** the call resolves to `{ output, data }` where `data` is `{ report, plan }`
- **AND** `output` is the post-rewrite summary defined by the `reporting` capability
- **AND** the target file is rewritten per the `update-mode` capability

#### Scenario: verbs are not CLI-aware

- **WHEN** any verb is invoked
- **THEN** the function does not read `process.argv`, call `process.exit`, or infer color from the terminal
- **AND** the caller supplies `colorEnabled` (and report `width`) through options

#### Scenario: fatal error is thrown with an exit code

- **WHEN** a verb cannot complete due to a fatal condition such as a missing or unparseable target
- **THEN** the function throws an `Error` whose `exitCode` property indicates the failure

### Requirement: Verb Options

Each verb SHALL accept an options object providing `colorEnabled` and
`registryBaseUrl`; `check` SHALL additionally accept `sources` and `width`.

#### Scenario: registry base URL is configurable

- **WHEN** a verb is called with `registryBaseUrl`
- **THEN** version and dist-tag resolution requests are issued against that base URL

#### Scenario: registry base URL defaults to the npm registry

- **WHEN** a verb is called without `registryBaseUrl`
- **THEN** resolution uses the public npm registry

#### Scenario: color is opt-in

- **WHEN** a verb is called without `colorEnabled`, or with it set to a falsy value
- **THEN** `output` contains no color escape sequences

#### Scenario: sources toggles source origins and the Source column

- **WHEN** `check` is called with `sources` set to true
- **THEN** each package result in `data` includes its contributing source origins
- **AND** `output` includes the Source column
- **WHEN** `check` is called without `sources`
- **THEN** package results omit source origins and `output` has no Source column

### Requirement: Analysis Result

The system SHALL provide, as the `data` returned by `check` (and as the `report`
inside `preview`/`update` results), a `packageResults` array whose entries each
provide `packageName`, `resolvedVersions`, `latestVersion`, `hasUpdate`,
`severity`, and `specifiers`, plus `sources` when source origins were requested.

#### Scenario: updateable package result

- **WHEN** `check` analyzes a target that has an available update
- **THEN** the corresponding `packageResults` entry has `hasUpdate` true
- **AND** it lists the current versions in `resolvedVersions` and the `latestVersion`
- **AND** it reports a `severity` of `major`, `minor`, or `patch`

#### Scenario: current package result

- **WHEN** `check` analyzes a target whose resolved version already matches the latest version
- **THEN** the corresponding `packageResults` entry has `hasUpdate` false
- **AND** its `severity` is null

#### Scenario: source origins are present only when requested

- **WHEN** `check` is called with `sources` set to true
- **THEN** each `packageResults` entry includes a `sources` array of contributing origins, each with a display label
- **AND** when `sources` is not requested the `sources` field is absent from each entry

### Requirement: Rewrite Plan

The `data.plan` returned by `preview` and `update` SHALL provide `noChanges`,
`rewrites`, and `strippedIntegrityEntries`. Each `rewrites` entry SHALL provide
`packageName`, `currentVersion`, `latestVersion`, `oldSpecifier`, and
`newSpecifier`. Each `strippedIntegrityEntries` entry SHALL provide `url` and
`packageName`.

#### Scenario: plan lists rewrites when updates are available

- **WHEN** `preview` or `update` runs against a target with available updates
- **THEN** `plan.noChanges` is false
- **AND** `plan.rewrites` lists each transformation with its package name, current version, latest version, and old and new specifiers

#### Scenario: plan reports no changes

- **WHEN** `preview` or `update` runs against a target with no available updates
- **THEN** `plan.noChanges` is true

#### Scenario: stripped integrity entries are reported

- **WHEN** a rewrite targets a URL that has a corresponding import map `integrity` entry
- **THEN** `plan.strippedIntegrityEntries` lists that entry's `url` and the triggering `packageName`

## Non-Goals

- Prescribing the internal module decomposition or helper functions used to
  produce `output` and `data` (that is implementation detail, out of scope for
  this spec)
- Freezing exact spacing, column widths, or prose in `output` (see the
  `reporting` capability's non-goals)
