// Custom `node:test` reporter that emits one NDJSON record per leaf test.
//
// Consumed by ../run-branch.mjs via:
//   node --test --test-reporter=file://<abs>/ndjson-reporter.mjs \
//        --test-reporter-destination=<results.ndjson> ...
//
// Each line is a JSON object: { file, name, testNumber, nesting, status,
// durationMs, failure? }. `status` is one of pass | fail | skip | todo.
//
// Assumption: the test-baseline suite uses only top-level `test(...)` calls
// (no `describe` nesting), which `node --test` reports at nesting 0 with no
// wrapping file event, so every pass/fail event is a real leaf test. If nested
// `describe` suites are ever added, their suite rollup events would also be
// recorded here.

export default async function* ndjsonReporter(source) {
  for await (const event of source) {
    if (event.type !== "test:pass" && event.type !== "test:fail") {
      continue;
    }

    const data = event.data ?? {};

    const status = data.todo
      ? "todo"
      : data.skip
        ? "skip"
        : event.type === "test:pass"
          ? "pass"
          : "fail";

    const record = {
      file: data.file ?? null,
      name: data.name ?? null,
      testNumber: data.testNumber ?? null,
      nesting: data.nesting ?? null,
      status,
      durationMs: data.details?.duration_ms ?? null,
    };

    if (status === "fail") {
      const error = data.details?.error;
      record.failure = error
        ? {
            message: error.message ?? String(error),
            stack: error.stack ?? null,
          }
        : null;
    }

    yield `${JSON.stringify(record)}\n`;
  }
}
