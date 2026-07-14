#!/usr/bin/env node

import { access } from "node:fs/promises";
import path from "node:path";

import packageJson from "../package.json" with { type: "json" };
import { check, preview, update } from "../src/index.js";

const HELP_FLAGS = new Set(["--help", "-h"]);
const VERSION_FLAGS = new Set(["--version", "-v"]);
const UPDATE_FLAGS = new Set(["--update", "-u"]);
const DRY_RUN_FLAG = "--dry-run";
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
    "      --dry-run       Preview the rewrite as a diff without writing the file",
  ].join("\n");
};

const parseArgs = (argv) => {
  const positional = [];
  let dryRun = false;
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

    if (arg === DRY_RUN_FLAG) {
      dryRun = true;
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

  // `--dry-run` wins over `--update`: a dry run never writes, even when both
  // flags are present.
  return {
    mode: dryRun ? "dry-run" : update ? "update" : "check",
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

  // Presentation and registry access are decided here (Layer 3) and passed into
  // the not-CLI-aware library verbs, which never sniff the terminal themselves.
  const colorEnabled =
    Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;
  const registryBaseUrl = process.env.ECU_REGISTRY_URL || undefined;

  if (parsed.mode === "dry-run") {
    const { output } = await preview(parsed.targetPath, {
      colorEnabled,
      registryBaseUrl,
    });

    writeStdout(output);

    return 0;
  }

  if (parsed.mode === "update") {
    const { output } = await update(parsed.targetPath, {
      colorEnabled,
      registryBaseUrl,
    });

    writeStdout(output);

    return 0;
  }

  // `--sources` renders a width-aware Source column. When no explicit --width is
  // given, fall back to the current terminal width (Layer 3 concern), then to
  // the library's own default.
  const width =
    parsed.width ??
    (parsed.sources &&
    typeof process.stdout.columns === "number" &&
    process.stdout.columns > 0
      ? process.stdout.columns
      : undefined);

  const { output } = await check(parsed.targetPath, {
    colorEnabled,
    registryBaseUrl,
    sources: parsed.sources,
    width,
  });

  writeStdout(output);

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
