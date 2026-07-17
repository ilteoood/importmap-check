// Cross-branch evaluation orchestrator.
//
// Runs the canonical test-baseline suite against a set of candidate branches
// (each judged only by its src + bin + package.json) and produces a comparison
// report: report.json (machine-readable) + report.md (human-readable matrix).
// The reference branch (default `main`) MUST pass the suite for the run to be a
// valid instrument; otherwise the report is flagged `referenceInvalid`.
//
// Usage:
//   node evaluation/report.mjs \
//     [--reference main] \
//     [--branches label=ref,label=ref,...] \
//     [--base-ref <ref>]            # archive test-baseline from a pinned ref
//     [--repo <path>] [--out <dir>] \
//     [--test-timeout <ms>] [--wall-timeout <ms>] [--concurrency <n>] \
//     [--keep-scratch]
//
// If --branches is omitted, only the reference branch is evaluated (a self-check
// that proves the harness + canonical overlay work end to end).

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { runBranch } from "./run-branch.mjs";

const MIN_NODE = [24, 2, 0]; // bin/importmap-check.js uses import.meta.main

const parseArgs = (argv) => {
  const args = {
    repo: process.cwd(),
    reference: "main",
    branches: [],
    baseRef: undefined,
    out: undefined,
    testTimeoutMs: 30_000,
    wallTimeoutMs: 180_000,
    concurrency: Math.max(1, os.availableParallelism?.() ?? os.cpus().length),
    keepScratch: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[(i += 1)];
    switch (arg) {
      case "--repo":
        args.repo = path.resolve(next());
        break;
      case "--reference":
        args.reference = next();
        break;
      case "--branches":
        args.branches.push(...splitBranches(next()));
        break;
      case "--branch":
        args.branches.push(...splitBranches(next()));
        break;
      case "--base-ref":
        args.baseRef = next();
        break;
      case "--out":
        args.out = path.resolve(next());
        break;
      case "--test-timeout":
        args.testTimeoutMs = Number(next());
        break;
      case "--wall-timeout":
        args.wallTimeoutMs = Number(next());
        break;
      case "--concurrency":
        args.concurrency = Math.max(1, Number(next()));
        break;
      case "--keep-scratch":
        args.keepScratch = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
};

// "label=ref,other=ref2" or "ref,ref2" (bare ref → label = ref).
const splitBranches = (value) =>
  value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const eq = token.indexOf("=");
      return eq >= 0
        ? { label: token.slice(0, eq), ref: token.slice(eq + 1) }
        : { label: token, ref: token };
    });

const checkNodeVersion = () => {
  const parts = process.versions.node.split(".").map(Number);
  for (let i = 0; i < MIN_NODE.length; i += 1) {
    if ((parts[i] ?? 0) > MIN_NODE[i]) {
      return true;
    }
    if ((parts[i] ?? 0) < MIN_NODE[i]) {
      return false;
    }
  }
  return true;
};

// Bounded-concurrency map preserving input order in the output array.
const pool = async (items, limit, worker) => {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index], index);
      }
    },
  );
  await Promise.all(runners);
  return results;
};

const tierOf = (file) => {
  if (
    file?.startsWith(`test-baseline${path.sep}api`) ||
    file?.startsWith("test-baseline/api")
  ) {
    return "api";
  }
  if (
    file?.startsWith(`test-baseline${path.sep}cli`) ||
    file?.startsWith("test-baseline/cli")
  ) {
    return "cli";
  }
  return "other";
};

const tierTotals = (tests) => {
  const tiers = { api: { pass: 0, total: 0 }, cli: { pass: 0, total: 0 } };
  for (const test of tests) {
    const tier = tierOf(test.file);
    if (!tiers[tier]) {
      continue;
    }
    tiers[tier].total += 1;
    if (test.status === "pass") {
      tiers[tier].pass += 1;
    }
  }
  return tiers;
};

const buildMatrix = (branches) => {
  const meta = new Map(); // id -> { file, name, testNumber }
  const perBranch = new Map(); // label -> Map(id -> status)

  for (const branch of branches) {
    const statuses = new Map();
    for (const test of branch.tests) {
      statuses.set(test.id, test.status);
      if (!meta.has(test.id)) {
        meta.set(test.id, {
          file: test.file,
          name: test.name,
          testNumber: test.testNumber ?? Number.MAX_SAFE_INTEGER,
        });
      }
    }
    perBranch.set(branch.label, statuses);
  }

  const ids = [...meta.keys()].sort((a, b) => {
    const ma = meta.get(a);
    const mb = meta.get(b);
    return (
      (ma.file ?? "").localeCompare(mb.file ?? "") ||
      ma.testNumber - mb.testNumber ||
      (ma.name ?? "").localeCompare(mb.name ?? "")
    );
  });

  const rows = ids.map((id) => ({
    id,
    file: meta.get(id).file,
    name: meta.get(id).name,
    results: Object.fromEntries(
      branches.map((branch) => [
        branch.label,
        perBranch.get(branch.label).get(id) ?? "absent",
      ]),
    ),
  }));

  return { ids, rows };
};

const STATUS_GLYPH = {
  pass: "✓",
  fail: "✗",
  skip: "s",
  todo: "t",
  absent: "–",
};

const renderMarkdown = (report) => {
  const lines = [];
  lines.push(`# Baseline evaluation report`);
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(
    `- Canonical test-baseline: ${report.canonical.baseRef} (${report.canonical.baseCommit ?? "working tree"})`,
  );
  lines.push(
    `- Reference: **${report.referenceLabel}**` +
      (report.referenceInvalid
        ? " — ⚠️ REFERENCE DID NOT PASS; results are not a valid instrument"
        : ""),
  );
  lines.push(
    `- Runner: Node ${report.runner.node} on ${report.runner.platform}, concurrency ${report.runner.concurrency}`,
  );
  lines.push("");

  lines.push(`## Branch summary`);
  lines.push("");
  lines.push(
    `| Branch | Ref @ commit | Status | Pass/Total | API | CLI | Fail | Skip | Time |`,
  );
  lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const branch of report.branches) {
    const t = branch.totals ?? {
      tests: 0,
      pass: 0,
      fail: 0,
      skip: 0,
      durationMs: 0,
    };
    const tiers = branch.tiers ?? {
      api: { pass: 0, total: 0 },
      cli: { pass: 0, total: 0 },
    };
    const commit = branch.commit ? branch.commit.slice(0, 9) : "?";
    const time = t.durationMs ? `${(t.durationMs / 1000).toFixed(1)}s` : "-";
    lines.push(
      `| ${branch.label} | \`${branch.ref}\` @ ${commit} | ${branch.status} | ${t.pass}/${t.tests} | ${tiers.api.pass}/${tiers.api.total} | ${tiers.cli.pass}/${tiers.cli.total} | ${t.fail} | ${t.skip} | ${time} |`,
    );
  }
  lines.push("");

  const errored = report.branches.filter(
    (b) => b.error || b.preflight?.srcImport === "error",
  );
  if (errored.length) {
    lines.push(`## Load / preflight errors`);
    lines.push("");
    for (const branch of errored) {
      lines.push(
        `- **${branch.label}** (${branch.status}): ${branch.error ?? branch.preflight?.error ?? "import failed"}`,
      );
    }
    lines.push("");
  }

  lines.push(`## Pass/fail matrix`);
  lines.push("");
  lines.push(`Legend: ✓ pass · ✗ fail · s skip · t todo · – absent`);
  lines.push("");
  const header = ["Test", ...report.branches.map((b) => b.label)];
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`| ${header.map(() => "---").join(" | ")} |`);
  for (const row of report.matrix.rows) {
    const cells = report.branches.map(
      (b) => STATUS_GLYPH[row.results[b.label]] ?? row.results[b.label],
    );
    lines.push(`| ${row.id} | ${cells.join(" | ")} |`);
  }
  lines.push("");

  if (report.regressions.length) {
    lines.push(`## Regressions vs reference (${report.referenceLabel})`);
    lines.push("");
    lines.push(`Tests that pass on the reference but not on a candidate:`);
    lines.push("");
    for (const reg of report.regressions) {
      lines.push(
        `- \`${reg.branch}\` — ${reg.status.toUpperCase()}: ${reg.id}`,
      );
    }
    lines.push("");
  } else {
    lines.push(`## Regressions vs reference (${report.referenceLabel})`);
    lines.push("");
    lines.push(`None. Every candidate passes each test the reference passes.`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (!checkNodeVersion()) {
    console.error(
      `This harness requires Node >= ${MIN_NODE.join(".")} (bin/importmap-check.js uses import.meta.main).\n` +
        `Current: ${process.versions.node}. Every CLI test would fail on an older runtime.`,
    );
    process.exitCode = 1;
    return;
  }

  // Reference first, then de-duplicated candidates.
  const wanted = [
    { label: args.reference, ref: args.reference },
    ...args.branches,
  ];
  const seen = new Set();
  const branchInputs = wanted.filter((b) => {
    if (seen.has(b.label)) {
      return false;
    }
    seen.add(b.label);
    return true;
  });

  // Resolve the canonical base commit for the record (if pinning a ref).
  let baseCommit = null;
  if (args.baseRef) {
    try {
      baseCommit = execFileSync(
        "git",
        ["-C", args.repo, "rev-parse", args.baseRef],
        {
          encoding: "utf8",
        },
      ).trim();
    } catch {
      baseCommit = null;
    }
  }

  console.error(
    `Evaluating ${branchInputs.length} branch(es) against test-baseline` +
      (args.baseRef ? ` @ ${args.baseRef}` : " (working tree)") +
      `; reference = ${args.reference}\n`,
  );

  const branches = await pool(branchInputs, args.concurrency, async (input) => {
    console.error(`  → ${input.label} (${input.ref})`);
    const result = await runBranch({
      repo: args.repo,
      ref: input.ref,
      label: input.label,
      baseRef: args.baseRef,
      testTimeoutMs: args.testTimeoutMs,
      wallTimeoutMs: args.wallTimeoutMs,
      keepScratch: args.keepScratch,
    });
    result.tiers = tierTotals(result.tests);
    console.error(
      `  ✓ ${input.label}: ${result.status}` +
        (result.totals
          ? ` (${result.totals.pass}/${result.totals.tests})`
          : ""),
    );
    return result;
  });

  const referenceBranch = branches.find((b) => b.label === args.reference);
  const referenceInvalid =
    !referenceBranch || referenceBranch.status !== "passed";

  const matrix = buildMatrix(branches);

  // Regressions: pass on reference, not-pass on candidate.
  const refStatuses = new Map(
    (referenceBranch?.tests ?? []).map((t) => [t.id, t.status]),
  );
  const regressions = [];
  for (const branch of branches) {
    if (branch.label === args.reference) {
      continue;
    }
    for (const row of matrix.rows) {
      if (refStatuses.get(row.id) !== "pass") {
        continue;
      }
      const status = row.results[branch.label];
      if (status !== "pass") {
        regressions.push({
          id: row.id,
          reference: "pass",
          branch: branch.label,
          status,
        });
      }
    }
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    canonical: {
      baseRef: args.baseRef ?? "(working tree)",
      baseCommit,
      globs: ["test-baseline/api/*.test.js", "test-baseline/cli/*.test.js"],
    },
    runner: {
      node: process.versions.node,
      platform: `${process.platform}-${process.arch}`,
      concurrency: args.concurrency,
      testTimeoutMs: args.testTimeoutMs,
      wallTimeoutMs: args.wallTimeoutMs,
    },
    referenceLabel: args.reference,
    referenceInvalid,
    branches: branches.map((branch) => {
      const rest = { ...branch };
      delete rest.scratch;
      return rest;
    }),
    matrix,
    regressions,
  };

  const outDir = args.out ?? path.join(args.repo, "evaluation", "reports");
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "report.json");
  const mdPath = path.join(outDir, "report.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(mdPath, renderMarkdown(report));

  // Console summary.
  console.error("");
  for (const branch of branches) {
    const t = branch.totals;
    console.error(
      `  ${branch.label.padEnd(24)} ${branch.status.padEnd(9)} ${t ? `${t.pass}/${t.tests}` : "-"}`,
    );
  }
  console.error("");
  if (referenceInvalid) {
    console.error(
      `⚠️  Reference '${args.reference}' did not pass — the report is not a valid instrument.`,
    );
  } else {
    console.error(`✓ Reference '${args.reference}' passed.`);
  }
  console.error(`Report written to:\n  ${jsonPath}\n  ${mdPath}`);

  process.exitCode = referenceInvalid ? 1 : 0;
};

await main();
