## Context

`esm-check-updates` currently exposes a published bin entry, but the executable still prints `TODO: CLI` and exits without honoring the documented command contract. The repository already has OpenSpec requirements for help/version flags, argument validation, update-flag rejection, output streams, and target validation, but there is no implementation or test harness yet.

This change is intentionally narrower than the full v1 specs. It establishes the CLI shell, validates invocation shape, and stops at a deliberate fatal dispatch point once a target is known to be valid. That keeps the repo honest about what is implemented while still giving later import map and reporting changes a stable entrypoint to build on.

## Goals / Non-Goals

**Goals:**
- Replace the placeholder bin behavior with a working CLI entrypoint.
- Parse arguments using Node.js built-ins only.
- Implement help/version output and argument/target validation.
- Return consistent stdout/stderr usage and exit codes for bootstrap CLI behavior.
- Add tests that lock down the command surface.

**Non-Goals:**
- Parsing import maps
- Resolving packages or latest versions
- Producing update reports
- Rewriting target files
- Adding third-party CLI libraries

## Decisions

### Keep CLI orchestration in `bin/esm-check-updates.js`
The executable entrypoint should own all user-facing CLI concerns: argument parsing, help/version text, stream writes, exit code handling, and target preflight validation. This preserves `src/` as the area for actual ESM/import map functionality once deeper analysis is implemented.

Alternative considered: place bootstrap parsing and dispatch in `src/index.js` and keep `bin/` as a thin wrapper. Rejected because it mixes CLI shell behavior into the future functional module area and weakens the intended project boundary.

### Treat help/version as early-return informational modes
`--help`, `-h`, `--version`, and `-v` should bypass positional target requirements and return exit code `0`. This directly matches the existing CLI spec and is standard terminal behavior.

Alternative considered: require these flags to be the only argument. Rejected because it is needlessly strict and provides no user benefit.

### Reject valid targets with a dedicated fatal not-yet-implemented error
After existence, readability, and extension validation succeed, the bootstrap CLI should fail with a clear message that analysis is not implemented yet. This preserves a narrow scope for the change while avoiding a misleading success path that claims work was performed.

Alternative considered: return success with a placeholder informational message. Rejected because it would look like a completed check despite no import map analysis or reporting support.

### Validate supported target types by extension only in this slice
The bootstrap phase only needs to guard obvious unsupported inputs before future parsing exists. Accepting `.json`, `.html`, and `.htm` is enough to model the later import map entrypoints without prematurely implementing content inspection.

Alternative considered: eagerly inspect file contents to distinguish import map JSON from arbitrary JSON. Rejected because that crosses into the next implementation slice.

### Test through the published bin entry
Spawn-based CLI tests verify the actual user-facing contract, including stdout/stderr separation and process exit codes, while also enforcing that the published executable remains the source of CLI behavior.

Alternative considered: test `main()` directly. Rejected because it would miss launcher wiring and stream behavior.

## Risks / Trade-offs

- Bootstrap CLI diverges from full `cli` spec success scenarios -> Mitigation: add change-local spec deltas that explicitly define bootstrap behavior until analysis lands.
- Platform-specific unreadable-file behavior can be flaky on local filesystems -> Mitigation: focus automated validation on missing and unsupported targets; only test unreadable behavior if it is reliable in this environment.
- Keeping CLI logic in the bin file can become unwieldy as options grow -> Mitigation: keep CLI-only helpers local to the bin file and move only reusable import map functionality into `src/`.
