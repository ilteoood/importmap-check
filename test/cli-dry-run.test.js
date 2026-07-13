import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import assert from "node:assert/strict";

import { createFixtureRegistry, runCli } from "./cli-helpers.js";

const { cleanup, copyFixture } = createFixtureRegistry();

after(cleanup);

test("--dry-run previews pinned entries as a diff and does not write", async () => {
  const targetPath = await copyFixture("update-pinned.html");
  const original = await readFile(targetPath, "utf8");

  const result = await runCli(["--dry-run", targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^Dry run — no files written\.\n/);
  assert.match(result.stdout, new RegExp(`^--- ${targetPath}$`, "m"));
  assert.match(result.stdout, /^-.*esm\.sh\/react@19\.2\.3",?$/m);
  assert.match(result.stdout, /^\+.*esm\.sh\/react@19\.3\.0",?$/m);

  const updated = await readFile(targetPath, "utf8");
  assert.equal(updated, original, "target file must be unchanged");
});

test("--dry-run leaves no temp file in the target directory", async () => {
  const targetPath = await copyFixture("update-pinned.html");

  await runCli(["--dry-run", targetPath], { NO_COLOR: "1" });

  const entries = await readdir(path.dirname(targetPath));
  assert.deepEqual(entries, [path.basename(targetPath)]);
});

test("--dry-run --update runs dry-run and does not write (dry wins)", async () => {
  const targetPath = await copyFixture("update-pinned.html");
  const original = await readFile(targetPath, "utf8");

  const result = await runCli(["--update", "--dry-run", targetPath], {
    NO_COLOR: "1",
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^Dry run — no files written\.\n/);
  assert.doesNotMatch(result.stdout, /^Updated /m);

  const updated = await readFile(targetPath, "utf8");
  assert.equal(updated, original, "target file must be unchanged");
});

test("--dry-run on ranges shows lifted caret/tilde floors in the diff", async () => {
  const targetPath = await copyFixture("update-ranges.html");
  const original = await readFile(targetPath, "utf8");

  const result = await runCli(["--dry-run", targetPath], {
    NO_COLOR: "1",
    ECU_TEST_LATEST_VERSIONS: JSON.stringify({
      react: "20.0.0",
      "react-dom": "19.3.0",
      swr: "3.0.0",
    }),
    ECU_TEST_SPECIFIER_VERSIONS: JSON.stringify({
      "react@^19.2.3": "19.2.9",
      "react-dom@~19.2.3": "19.2.9",
      "swr@^2.0.0": "2.9.9",
    }),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^-.*esm\.sh\/react@\^19\.2\.3",?$/m);
  assert.match(result.stdout, /^\+.*esm\.sh\/react@\^20\.0\.0",?$/m);
  assert.match(result.stdout, /^\+.*esm\.sh\/react-dom@~19\.3\.0",?$/m);

  const updated = await readFile(targetPath, "utf8");
  assert.equal(updated, original, "target file must be unchanged");
});

test("--dry-run shows coalesced `?deps=` rewrites in the diff and writes nothing", async () => {
  const targetPath = await copyFixture("update-deps-multi.html");
  const original = await readFile(targetPath, "utf8");

  const result = await runCli(["--dry-run", targetPath], {
    NO_COLOR: "1",
    ECU_TEST_LATEST_VERSIONS: JSON.stringify({
      app: "2.0.0",
      react: "19.3.0",
      scheduler: "0.24.1",
    }),
    ECU_TEST_SPECIFIER_VERSIONS: JSON.stringify({
      "scheduler@^0.23.0": "0.23.0",
    }),
  });

  assert.equal(result.code, 0);
  assert.match(
    result.stdout,
    /^-.*app@1\.0\.0\?deps=react@18\.2\.0,scheduler@\^0\.23\.0",?$/m,
  );
  assert.match(
    result.stdout,
    /^\+.*app@2\.0\.0\?deps=react@19\.3\.0,scheduler@\^0\.24\.0",?$/m,
  );

  const updated = await readFile(targetPath, "utf8");
  assert.equal(updated, original, "target file must be unchanged");
});

test("--dry-run shows stripped integrity lines removed and the subsection", async () => {
  const targetPath = await copyFixture("update-integrity.html");
  const original = await readFile(targetPath, "utf8");

  const result = await runCli(["--dry-run", targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(
    result.stdout,
    /^-.*"https:\/\/esm\.sh\/react@19\.2\.3": "sha384-/m,
  );
  assert.match(result.stdout, /## Stripped integrity entries/);
  assert.match(
    result.stdout,
    /- https:\/\/esm\.sh\/react@19\.2\.3 \(triggered by react\)/,
  );

  const updated = await readFile(targetPath, "utf8");
  assert.equal(updated, original, "target file must be unchanged");
});

test("--dry-run with no updates prints 'No changes would be written.'", async () => {
  const targetPath = await copyFixture("update-noop.html");
  const original = await readFile(targetPath, "utf8");

  const result = await runCli(["--dry-run", targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^No changes would be written\./);
  assert.doesNotMatch(result.stdout, /^--- /m);

  const updated = await readFile(targetPath, "utf8");
  assert.equal(updated, original, "target file must be unchanged");
});

test("--dry-run requires exactly one positional target", async () => {
  const missing = await runCli(["--dry-run"], { NO_COLOR: "1" });
  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /Expected exactly one target path\./);

  const multiple = await runCli(["--dry-run", "a.html", "b.html"], {
    NO_COLOR: "1",
  });
  assert.notEqual(multiple.code, 0);
  assert.match(multiple.stderr, /Expected exactly one target path\./);
});

test("help output lists the --dry-run flag", async () => {
  const result = await runCli(["--help"], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /--dry-run/);
});
