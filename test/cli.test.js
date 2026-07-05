import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const fixturesRoot = path.join(import.meta.dirname, "fixtures");

const fixtures = [];

const createFixtureDir = async () => {
  const fixtureDir = await mkdtemp(path.join(os.tmpdir(), "ecu-cli-"));
  fixtures.push(fixtureDir);

  return fixtureDir;
};

const copyFixture = async (fixtureName, targetName = fixtureName) => {
  const fixtureDir = await createFixtureDir();
  const targetPath = path.join(fixtureDir, targetName);
  await copyFile(path.join(fixturesRoot, fixtureName), targetPath);

  return targetPath;
};

after(async () => {
  await Promise.all(
    fixtures.map(async (fixtureDir) => {
      await rm(fixtureDir, { force: true, recursive: true });
    }),
  );
});

const runCli = async (args, env = {}) => {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["bin/esm-check-updates.js", ...args],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          ECU_TEST_LATEST_VERSIONS: JSON.stringify({
            react: "19.3.0",
            "react-dom": "19.3.0",
          }),
          ...env,
        },
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

test("analyzes a valid json import map", async () => {
  const targetPath = await copyFixture(
    "valid-import-map.json",
    "import-map.json",
  );
  const result = await runCli([targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /esm-check-updates/);
  assert.match(result.stdout, /\n\n## Updates\n/);
  assert.match(result.stdout, /Package\s+\|\s+Current\s+\|\s+Latest/);
  assert.match(result.stdout, /react\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0/);
  assert.match(result.stdout, /react-dom\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0/);
  assert.equal(result.stderr, "");
});

test("reports malformed json import maps as fatal errors", async () => {
  const targetPath = await copyFixture(
    "malformed-import-map.json",
    "import-map.json",
  );
  const result = await runCli([targetPath]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Could not parse/);
  assert.equal(result.stdout, "");
});

test("analyzes an inline html import map", async () => {
  const targetPath = await copyFixture("inline-importmap.html", "index.html");
  const result = await runCli([targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /\n\n## Updates\n/);
  assert.match(result.stdout, /react\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0/);
  assert.equal(result.stderr, "");
});

test("merges multiple inline import maps for package analysis", async () => {
  const targetPath = await copyFixture(
    "multiple-importmaps.html",
    "index.html",
  );
  const result = await runCli([targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /react\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0/);
  assert.doesNotMatch(result.stdout, /sources:/);
  assert.match(result.stdout, /react-dom\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0/);
});

test("fails when html has no supported inline import map", async () => {
  const targetPath = await copyFixture("no-importmap.html", "index.html");
  const result = await runCli([targetPath]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /No supported inline import map was found/);
  assert.equal(result.stdout, "");
});

test("warns on scopes and analyzes remap keys by destination value", async () => {
  const targetPath = await copyFixture("scopes-and-remaps.html", "index.html");
  const result = await runCli([targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /\n\n## Warnings\n/);
  assert.match(result.stdout, /contains `scopes`, which are not yet supported/);
  assert.match(
    result.stdout,
    /react\s+\|\s+19\.1\.0, 19\.2\.3\s+\|\s+19\.3\.0/,
  );
});

test("warns on destination skew for the same package", async () => {
  const targetPath = await copyFixture("destination-skew.html", "index.html");
  const result = await runCli([targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(
    result.stdout,
    /resolves through different CDN providers or pinned versions/,
  );
});

test("does not warn on duplicate destination urls with the same provider and version", async () => {
  const targetPath = await copyFixture(
    "multiple-importmaps.html",
    "duplicate-destination.html",
  );
  const result = await runCli([targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.doesNotMatch(
    result.stdout,
    /resolves through different CDN providers or pinned versions/,
  );
});

test("warns for supported cdn entries that are unparseable", async () => {
  const targetPath = await copyFixture(
    "unparseable-supported.html",
    "index.html",
  );
  const result = await runCli([targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /\n\n## Warnings\n/);
  assert.match(result.stdout, /Could not parse package identity and version/);
  assert.match(result.stdout, /react-dom\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0/);
});

test("emits an integrity note when an updated mapping has integrity metadata", async () => {
  const targetPath = await copyFixture("integrity-note.html", "index.html");
  const result = await runCli([targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /\n\n## Notes\n/);
  assert.match(
    result.stdout,
    /integrity metadata tied to a URL that would need review/,
  );
});
