import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const fixturesRoot = path.join(import.meta.dirname, "fixtures");

// Shared registry across test files so `registerFixtureCleanup` from any test
// file can enqueue its own directories. Each *.test.js file's `after` hook
// removes only the directories it enqueued.
const createFixtureRegistry = () => {
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

  const cleanup = async () => {
    await Promise.all(
      fixtures.map(async (fixtureDir) => {
        await rm(fixtureDir, { force: true, recursive: true });
      }),
    );
  };

  return { cleanup, copyFixture, createFixtureDir };
};

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

export { createFixtureRegistry, fixturesRoot, repoRoot, runCli };
