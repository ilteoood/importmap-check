import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const fixtures = [];

const createFixtureDir = async () => {
  const fixtureDir = await mkdtemp(path.join(os.tmpdir(), "ecu-cli-"));
  fixtures.push(fixtureDir);

  return fixtureDir;
};

after(async () => {
  await Promise.all(
    fixtures.map(async (fixtureDir) => {
      await rm(fixtureDir, { force: true, recursive: true });
    }),
  );
});

const runCli = async (args) => {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["bin/esm-check-updates.js", ...args],
      {
        cwd: "/Users/rye/scm/nf/esm-check-updates",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stderr, stdout });
    });
  });
};

test("prints help with --help", async () => {
  const result = await runCli(["--help"]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage: esm-check-updates <target-path>/);
  assert.match(result.stdout, /check-only/i);
  assert.equal(result.stderr, "");
});

test("prints version with -v", async () => {
  const result = await runCli(["-v"]);

  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), "0.0.1");
  assert.equal(result.stderr, "");
});

test("rejects missing target path", async () => {
  const result = await runCli([]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Expected exactly one target path/);
  assert.equal(result.stdout, "");
});

test("rejects multiple target paths", async () => {
  const result = await runCli(["one.json", "two.json"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Expected exactly one target path/);
  assert.equal(result.stdout, "");
});

test("rejects unknown flags", async () => {
  const result = await runCli(["--wat"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown flag: --wat/);
  assert.equal(result.stdout, "");
});

test("rejects unsupported update flag", async () => {
  const result = await runCli(["--update"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Update mode is not available in v1/);
  assert.equal(result.stdout, "");
});

test("rejects missing target file", async () => {
  const fixtureDir = await createFixtureDir();
  const missingFile = path.join(fixtureDir, "missing.json");
  const result = await runCli([missingFile]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /missing or unreadable/);
  assert.equal(result.stdout, "");
});

test("rejects unsupported target extensions", async () => {
  const fixtureDir = await createFixtureDir();
  const targetPath = path.join(fixtureDir, "import-map.txt");
  await writeFile(targetPath, "not an import map");

  const result = await runCli([targetPath]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unsupported target type/);
  assert.equal(result.stdout, "");
});

test("valid json target reaches bootstrap not-implemented path", async () => {
  const fixtureDir = await createFixtureDir();
  const targetPath = path.join(fixtureDir, "import-map.json");
  await writeFile(targetPath, '{"imports":{}}');

  const result = await runCli([targetPath]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Target analysis is not implemented yet/);
  assert.equal(result.stdout, "");
});

test("valid html target reaches bootstrap not-implemented path", async () => {
  const fixtureDir = await createFixtureDir();
  const targetPath = path.join(fixtureDir, "index.html");
  await writeFile(
    targetPath,
    '<script type="importmap">{"imports":{}}</script>',
  );

  const result = await runCli([targetPath]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Target analysis is not implemented yet/);
  assert.equal(result.stdout, "");
});
