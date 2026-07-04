## 1. CLI Bootstrap

- [x] 1.1 Replace the placeholder bin behavior with a `main(argv)` entrypoint invocation.
- [x] 1.2 Implement built-in argument parsing for help, version, unsupported update flags, unknown flags, and positional target arity.
- [x] 1.3 Implement target existence, readability, and supported-extension validation plus the bootstrap not-yet-implemented fatal dispatch.

## 2. Automated Verification

- [x] 2.1 Add `node:test` coverage for help/version, invalid invocation, unsupported flags, missing targets, unsupported target types, and validated bootstrap dispatch.
- [x] 2.2 Run the relevant repository checks and confirm the CLI bootstrap behavior passes.
