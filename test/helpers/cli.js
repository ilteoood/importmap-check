import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { packumentsFromMaps, startMockRegistry } from "./mock-registry.js";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const fixturesRoot = path.join(
  import.meta.dirname,
  "..",
  "fixtures",
  "importmaps",
);

// Every CLI run resolves versions against a local mock registry (never the real
// npm registry) via the CLI's IMPORTMAP_CHECK_REGISTRY_URL knob. react/react-dom default to
// latest 19.3.0; callers extend or override through `registry` (see below).
const DEFAULT_LATEST = { react: "19.3.0", "react-dom": "19.3.0" };

// Shared registry across test files so each *.test.js file can enqueue its own
// temp directories. Each file's `after` hook removes only what it enqueued.
const createFixtureRegistry = () => {
  const fixtures = [];

  const createFixtureDir = async () => {
    const fixtureDir = await mkdtemp(
      path.join(os.tmpdir(), "importmap-check-cli-"),
    );
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

// Run the CLI in a subprocess against a fresh mock registry.
//
//   runCli(args, {
//     env,       // extra environment variables (e.g. { NO_COLOR: "1" })
//     registry,  // { latest, specifiers } version stubs merged over defaults;
//                //   latest:    { "<pkg>": "<version>" }
//                //   specifiers:{ "<pkg>@<specifier>": "<version>" }
//   })
//
// Resolves to { code, stdout, stderr }. Never rejects on a non-zero exit.
const runCli = async (args, { env = {}, registry = {} } = {}) => {
  const packuments = packumentsFromMaps({
    latest: { ...DEFAULT_LATEST, ...(registry.latest ?? {}) },
    specifiers: registry.specifiers ?? {},
  });
  const mock = await startMockRegistry(packuments);

  // NO_COLOR and FORCE_COLOR are mutually exclusive; Node prints a warning to
  // stderr when both are set. The CLI runs here with piped (non-TTY) stdio and
  // tests assert on uncolored output, so drop any inherited FORCE_COLOR to keep
  // the child's stderr clean and color deterministic.
  const childEnv = {
    ...process.env,
    IMPORTMAP_CHECK_REGISTRY_URL: mock.url,
    ...env,
  };
  delete childEnv.FORCE_COLOR;

  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["bin/importmap-check.js", ...args],
        {
          cwd: repoRoot,
          env: childEnv,
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
  } finally {
    await mock.close();
  }
};

export { createFixtureRegistry, fixturesRoot, repoRoot, runCli };
