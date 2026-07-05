#!/usr/bin/env node

import { access } from "node:fs/promises";
import path from "node:path";

import packageJson from "../package.json" with { type: "json" };
import { analyzeTarget } from "../src/index.js";
import { formatReport } from "../src/report.js";

const HELP_FLAGS = new Set(["--help", "-h"]);
const VERSION_FLAGS = new Set(["--version", "-v"]);
const UPDATE_FLAGS = new Set(["--update", "-u"]);
const SUPPORTED_EXTENSIONS = new Set([".json", ".html", ".htm"]);

const writeStdout = (message) => {
  process.stdout.write(`${message}\n`);
};

const writeStderr = (message) => {
  process.stderr.write(`${message}\n`);
};

const createError = (message, code = 1) => {
  const error = new Error(message);
  error.exitCode = code;

  return error;
};

const formatHelp = () => {
  return [
    "Usage: esm-check-updates <target-path>",
    "",
    "Check-only v1 CLI for import map JSON and HTML files with inline import maps.",
    "This mode is non-destructive and does not update files.",
    "",
    "Options:",
    "  -h, --help     Show help",
    "  -v, --version  Show version",
    "  -u, --update   Unsupported in v1",
  ].join("\n");
};

const parseArgs = (argv) => {
  const positional = [];

  for (const arg of argv) {
    if (HELP_FLAGS.has(arg)) {
      return { mode: "help" };
    }

    if (VERSION_FLAGS.has(arg)) {
      return { mode: "version" };
    }

    if (UPDATE_FLAGS.has(arg)) {
      throw createError("Update mode is not available in v1.");
    }

    if (arg.startsWith("-")) {
      throw createError(`Unknown flag: ${arg}`);
    }

    positional.push(arg);
  }

  if (positional.length === 0) {
    throw createError("Expected exactly one target path.");
  }

  if (positional.length > 1) {
    throw createError("Expected exactly one target path.");
  }

  return {
    mode: "check",
    targetPath: positional[0],
  };
};

const validateTargetPath = async (targetPath) => {
  try {
    await access(targetPath);
  } catch {
    throw createError(`Target path is missing or unreadable: ${targetPath}`);
  }

  const extension = path.extname(targetPath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw createError(
      `Unsupported target type: ${targetPath}. Supported types are .json, .html, and .htm.`,
    );
  }
};

const main = async (argv = process.argv.slice(2)) => {
  const parsed = parseArgs(argv);

  if (parsed.mode === "help") {
    writeStdout(formatHelp());

    return 0;
  }

  if (parsed.mode === "version") {
    writeStdout(packageJson.version);

    return 0;
  }

  await validateTargetPath(parsed.targetPath);

  const report = await analyzeTarget(parsed.targetPath);
  writeStdout(formatReport(report));

  return 0;
};

const run = async (argv = process.argv.slice(2)) => {
  try {
    const exitCode = await main(argv);
    // Note: manually set exit code and let Node.js process terminate on it's own.
    // https://nodejs.org/api/process.html#processexitcode-1
    process.exitCode = exitCode;
  } catch (error) {
    writeStderr(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
};

if (import.meta.main) {
  await run();
}
