// Run the canonical test-baseline suite against a single git branch's
// implementation (src + bin + package.json), in an isolated scratch tree.
//
// Mechanism: assemble a scratch run root that combines
//   - the CANONICAL test-baseline/ (from the local working tree, or from a
//     pinned --base-ref), and
//   - the CANDIDATE's src/, bin/, package.json (via `git archive <ref>`).
// The candidate contributes only those three paths, so it cannot influence the
// tests it is judged by. Relative imports (`../../src/index.js`) and the CLI
// subprocess spawn (cwd = run root, `bin/importmap-check.js`) both resolve
// correctly because the run root has the same shape as the repo root.
//
// Exports `runBranch(options)`. Also runnable directly for debugging:
//   node evaluation/run-branch.mjs <ref> [--base-ref <ref>] [--keep-scratch]

import { spawn } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const REPORTER_URL = new URL("./reporters/ndjson-reporter.mjs", import.meta.url)
  .href;

const DEFAULTS = {
  testTimeoutMs: 30_000,
  wallTimeoutMs: 180_000,
};

// Run a command to completion, buffering stdout/stderr. Never rejects on a
// non-zero exit; rejects only if the process cannot be spawned.
const exec = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) =>
      resolve({ code, signal, stdout, stderr }),
    );
  });

const git = (repo, args) => exec("git", ["-C", repo, ...args]);

// Run `node --test` under a wall-clock timeout, killing the whole process group
// (the runner, the spawned CLI, and its mock-registry server) on expiry.
const runTests = (nodeBin, args, { cwd, wallTimeoutMs }) =>
  new Promise((resolve, reject) => {
    const child = spawn(nodeBin, args, {
      cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, wallTimeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });

const listTestFiles = async (scratch) => {
  const files = [];
  for (const group of ["api", "cli"]) {
    const dir = path.join(scratch, "test-baseline", group);
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const entry of entries.sort()) {
      if (entry.endsWith(".test.js")) {
        files.push(path.join(dir, entry));
      }
    }
  }
  return files;
};

// Derive a scratch-independent path so test ids are stable across branches
// (each branch runs in its own temp dir; the absolute prefix must not leak into
// the id). macOS also symlinks /var -> /private/var, which defeats
// path.relative, so anchor on the `test-baseline` segment instead.
const relativize = (file) => {
  if (!file) {
    return file;
  }
  const needle = `test-baseline${path.sep}`;
  const index = file.lastIndexOf(needle);
  return index >= 0 ? file.slice(index) : file;
};

const parseNdjson = (text) => {
  const tests = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const relFile = relativize(record.file);
    // When an entire test file fails to load, node emits a fail event whose
    // name is the absolute file path; normalize it to a stable, run-independent
    // label so the matrix id is deterministic across branches and runs.
    const name =
      record.name && path.isAbsolute(record.name)
        ? "<file failed to load>"
        : record.name;
    tests.push({
      id: `${relFile} :: ${name}`,
      file: relFile,
      name,
      testNumber: record.testNumber,
      status: record.status,
      durationMs: record.durationMs,
      failure: record.failure ?? null,
    });
  }
  return tests;
};

const totalsFor = (tests) => {
  const totals = {
    tests: 0,
    pass: 0,
    fail: 0,
    skip: 0,
    todo: 0,
    durationMs: 0,
  };
  for (const test of tests) {
    totals.tests += 1;
    totals[test.status] = (totals[test.status] ?? 0) + 1;
    totals.durationMs += test.durationMs ?? 0;
  }
  return totals;
};

export const runBranch = async (options) => {
  const {
    repo,
    ref,
    label = ref,
    baseRef, // when set, test-baseline is archived from this ref; else copied from repo working tree
    nodeBin = process.execPath,
    testTimeoutMs = DEFAULTS.testTimeoutMs,
    wallTimeoutMs = DEFAULTS.wallTimeoutMs,
    keepScratch = false,
  } = options;

  const result = {
    label,
    ref,
    commit: null,
    status: "errored",
    preflight: { srcImport: "unknown", binCheck: "unknown", error: null },
    totals: null,
    tests: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    scratch: null,
    error: null,
  };

  const scratch = await mkdtemp(path.join(os.tmpdir(), "importmap-eval-"));
  result.scratch = scratch;

  try {
    // Resolve the candidate commit for the record.
    const revParse = await git(repo, ["rev-parse", ref]);
    if (revParse.code !== 0) {
      result.error = `Unknown ref: ${ref} (${revParse.stderr.trim()})`;
      return result;
    }
    result.commit = revParse.stdout.trim();

    // 1) Canonical test-baseline.
    if (baseRef) {
      const tarPath = path.join(scratch, "_baseline.tar");
      const archive = await git(repo, [
        "archive",
        "-o",
        tarPath,
        baseRef,
        "--",
        "test-baseline",
      ]);
      if (archive.code !== 0) {
        result.error = `Failed to archive test-baseline from ${baseRef}: ${archive.stderr.trim()}`;
        return result;
      }
      const extract = await exec("tar", ["-xf", tarPath, "-C", scratch]);
      if (extract.code !== 0) {
        result.error = `Failed to extract test-baseline: ${extract.stderr.trim()}`;
        return result;
      }
      await rm(tarPath, { force: true });
    } else {
      await cp(
        path.join(repo, "test-baseline"),
        path.join(scratch, "test-baseline"),
        {
          recursive: true,
        },
      );
    }

    // 2) Candidate implementation — only src, bin, package.json.
    const implTar = path.join(scratch, "_impl.tar");
    const implArchive = await git(repo, [
      "archive",
      "-o",
      implTar,
      ref,
      "--",
      "src",
      "bin",
      "package.json",
    ]);
    if (implArchive.code !== 0) {
      result.error = `Failed to archive src/bin/package.json from ${ref}: ${implArchive.stderr.trim()}`;
      return result;
    }
    const implExtract = await exec("tar", ["-xf", implTar, "-C", scratch]);
    if (implExtract.code !== 0) {
      result.error = `Failed to extract implementation: ${implExtract.stderr.trim()}`;
      return result;
    }
    await rm(implTar, { force: true });

    // 3) Preflight: does the implementation even load?
    const binCheck = await exec(
      nodeBin,
      ["--check", "bin/importmap-check.js"],
      {
        cwd: scratch,
      },
    );
    result.preflight.binCheck = binCheck.code === 0 ? "ok" : "error";

    const srcImport = await exec(
      nodeBin,
      [
        "--input-type=module",
        "-e",
        "import('./src/index.js').then(() => {}, (error) => { console.error(error?.stack ?? error); process.exit(3); })",
      ],
      { cwd: scratch },
    );
    result.preflight.srcImport = srcImport.code === 0 ? "ok" : "error";
    if (srcImport.code !== 0) {
      result.preflight.error = srcImport.stderr.trim() || null;
    }

    // 4) Run the canonical suite. Even on preflight import failure we still run,
    //    so the matrix shows every affected test failing (rather than hiding it).
    const testFiles = await listTestFiles(scratch);
    if (testFiles.length === 0) {
      result.error = "No test-baseline files found in scratch tree.";
      return result;
    }

    const resultsPath = path.join(scratch, "_results.ndjson");
    const run = await runTests(
      nodeBin,
      [
        "--test",
        `--test-timeout=${testTimeoutMs}`,
        "--test-reporter",
        REPORTER_URL,
        "--test-reporter-destination",
        resultsPath,
        "--test-reporter",
        "spec",
        "--test-reporter-destination",
        "stdout",
        ...testFiles,
      ],
      { cwd: scratch, wallTimeoutMs },
    );

    let ndjson = "";
    try {
      ndjson = await readFile(resultsPath, "utf8");
    } catch {
      ndjson = "";
    }
    result.tests = parseNdjson(ndjson);
    result.totals = totalsFor(result.tests);
    result.exitCode = run.code;

    if (run.timedOut) {
      result.status = "timedout";
    } else if (
      result.preflight.srcImport === "error" ||
      result.preflight.binCheck === "error"
    ) {
      result.status = "errored";
    } else if (result.totals.tests === 0) {
      result.status = "errored";
      result.error = "Test runner produced no results.";
    } else if (result.totals.fail === 0) {
      result.status = "passed";
    } else {
      result.status = "failed";
    }

    return result;
  } catch (error) {
    result.error = error?.stack ?? String(error);
    return result;
  } finally {
    result.finishedAt = new Date().toISOString();
    if (!keepScratch) {
      await rm(scratch, { force: true, recursive: true });
      result.scratch = null;
    }
  }
};

// Direct-invocation debug entry point.
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const argv = process.argv.slice(2);
  const ref = argv.find((arg) => !arg.startsWith("--"));
  if (!ref) {
    console.error(
      "usage: node evaluation/run-branch.mjs <ref> [--base-ref <ref>] [--keep-scratch]",
    );
    process.exitCode = 1;
  } else {
    const baseRefIndex = argv.indexOf("--base-ref");
    const options = {
      repo: process.cwd(),
      ref,
      label: ref,
      baseRef: baseRefIndex >= 0 ? argv[baseRefIndex + 1] : undefined,
      keepScratch: argv.includes("--keep-scratch"),
    };
    const result = await runBranch(options);
    // Print a compact summary; the full per-test detail is in result.tests.
    const summary = { ...result, tests: `${result.tests.length} test(s)` };
    console.log(JSON.stringify(summary, null, 2));
  }
}
