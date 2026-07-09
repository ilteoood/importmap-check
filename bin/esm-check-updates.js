#!/usr/bin/env node

import { access } from "node:fs/promises";
import path from "node:path";

import packageJson from "../package.json" with { type: "json" };
import {
  analyzeTarget,
  formatReport,
  formatUpdateSummary,
  rewriteTargetInPlace,
} from "../src/index.js";

const HELP_FLAGS = new Set(["--help", "-h"]);
const VERSION_FLAGS = new Set(["--version", "-v"]);
const UPDATE_FLAGS = new Set(["--update", "-u"]);
const SOURCES_FLAG = "--sources";
const WIDTH_FLAG = "--width";
const MIN_WIDTH = 40;
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
    "Usage: esm-check-updates [options] <target-path>",
    "",
    "Check-only CLI for import map JSON and HTML files with inline import maps.",
    "The default invocation is non-destructive and reports available updates.",
    "Use --update to rewrite updateable entries in place.",
    "",
    "Options:",
    "  -h, --help          Show help",
    "  -v, --version       Show version",
    "      --sources       Show source import-map entries in the report",
    "      --width <num>   Override available report width (used with --sources)",
    "  -u, --update        Rewrite updateable entries in the target file in place",
  ].join("\n");
};

const parseArgs = (argv) => {
  const positional = [];
  let sources = false;
  let update = false;
  let width;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (HELP_FLAGS.has(arg)) {
      return { mode: "help" };
    }

    if (VERSION_FLAGS.has(arg)) {
      return { mode: "version" };
    }

    if (UPDATE_FLAGS.has(arg)) {
      update = true;
      continue;
    }

    if (arg === SOURCES_FLAG) {
      sources = true;
      continue;
    }

    if (arg === WIDTH_FLAG) {
      const nextArg = argv[index + 1];

      if (nextArg === undefined || nextArg.startsWith("-")) {
        throw createError("--width requires a positive integer value.");
      }

      const parsed = Number(nextArg);

      if (
        !Number.isInteger(parsed) ||
        parsed < MIN_WIDTH ||
        String(parsed) !== nextArg
      ) {
        throw createError(
          `--width must be a positive integer >= ${MIN_WIDTH}.`,
        );
      }

      width = parsed;
      index += 1;
      continue;
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
    mode: update ? "update" : "check",
    sources,
    targetPath: positional[0],
    width,
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

  const report = await analyzeTarget(parsed.targetPath, {
    withSources: parsed.sources,
  });

  if (parsed.mode === "update") {
    const rewrite = await rewriteTargetInPlace(parsed.targetPath, report);

    writeStdout(
      formatUpdateSummary(rewrite, report, {
        sourcesEnabled: parsed.sources,
        width: parsed.width,
      }),
    );

    return 0;
  }

  writeStdout(
    formatReport(report, {
      sourcesEnabled: parsed.sources,
      width: parsed.width,
    }),
  );

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
