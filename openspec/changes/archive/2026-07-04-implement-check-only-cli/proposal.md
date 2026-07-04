## Why

The repository defines a v1 CLI contract in OpenSpec, but the shipped executable still prints a placeholder message and performs no argument parsing or target validation. Implementing the check-only CLI shell now creates a stable entrypoint, error model, and test harness so later changes can add import map analysis without first replacing ad hoc launcher behavior.

## What Changes

- Replace the placeholder executable behavior with a built-in Node.js CLI parser and dispatcher.
- Implement `--help`/`-h` and `--version`/`-v` handling with correct output streams and exit codes.
- Enforce exactly one positional target path for normal execution.
- Reject `--update`/`-u` and other unknown flags with clear stderr errors.
- Validate that the target exists, is readable, and is a supported `.json`, `.html`, or `.htm` file.
- Stop validated runs with a clear not-yet-implemented analysis error until deeper import map processing lands.
- Add automated CLI tests for invocation, validation, and exit behavior.

## Capabilities

### New Capabilities
- `cli-bootstrap`: Defines the bootstrap CLI shell behavior before import map analysis is implemented.

### Modified Capabilities
- `cli`: Clarify that the v1 command surface can be delivered incrementally, with a bootstrap phase that owns parsing, validation, and fatal dispatch before analysis support exists.

## Impact

- Affected code: `bin/esm-check-updates.js`, `src/index.js`, new `test/*.test.js` files
- Affected specs: change-local deltas for `cli` and a new `cli-bootstrap` capability
- Dependencies: no new runtime dependencies; implementation stays on Node.js built-ins
