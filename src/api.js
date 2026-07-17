// Minimum, not-CLI-aware library API. Each verb takes a target path plus plain
// options and returns `{ output, data }`:
//   - `output` is the rendered, human-readable report/summary string (reporting
//     is a library concern here so the CLI stays a thin adapter).
//   - `data` is the structured result (report, or { report, plan }) for callers
//     and tests that want to assert on values rather than parse the string.
// These functions do no argv parsing, no process.exit, and no TTY sniffing;
// `colorEnabled` and the effective report `width` are supplied by the caller.
// Fatal conditions throw an Error whose `.exitCode` the caller may honor.
//
// Skeleton: these are empty stubs. Implement each verb against openspec/specs/
// with the `(targetPath, options)` signature documented above; they currently
// take no parameters and return an empty result so the baseline suite has a
// loadable module to run against.

export const check = async () => {
  return { data: null, output: "" };
};

export const preview = async () => {
  return { data: null, output: "" };
};

export const update = async () => {
  return { data: null, output: "" };
};
