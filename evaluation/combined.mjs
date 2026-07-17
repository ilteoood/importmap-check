// evaluation/combined.mjs — join output-quality (evaluation) with process-cost
// (experiment) into one cost-vs-quality table per model.
//
// Reads evaluation/reports/report.json (quality per branch) and
// experiment/reports/metrics.json (cost per env), joins each experiment env's
// primary branch to the evaluation branch ref, and writes combined.{json,md}.
//
// Usage (from an openspec-base checkout, after running both harnesses):
//   node evaluation/combined.mjs
//   node evaluation/combined.mjs --eval <report.json> --metrics <metrics.json> \
//     [--out <dir>] [--json]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const parseArgs = (argv) => {
  const args = {
    eval: path.resolve("evaluation/reports/report.json"),
    metrics: path.resolve("experiment/reports/metrics.json"),
    out: null,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[(i += 1)];
    switch (arg) {
      case "--eval":
        args.eval = path.resolve(next());
        break;
      case "--metrics":
        args.metrics = path.resolve(next());
        break;
      case "--out":
        args.out = path.resolve(next());
        break;
      case "--json":
        args.json = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
};

const readJson = (p) => {
  if (!existsSync(p)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

const fmtCost = (n) => (n == null ? "—" : `$${n.toFixed(2)}`);
const fmtTokens = (n) => {
  if (n == null) {
    return "—";
  }
  if (n >= 1e6) {
    return `${(n / 1e6).toFixed(2)}M`;
  }
  if (n >= 1e3) {
    return `${(n / 1e3).toFixed(1)}K`;
  }
  return String(Math.round(n));
};
const fmtDur = (ms) => {
  if (ms == null) {
    return "—";
  }
  const s = ms / 1000;
  if (s < 60) {
    return `${s.toFixed(0)}s`;
  }
  const m = Math.floor(s / 60);
  return m < 60
    ? `${m}m ${Math.round(s % 60)}s`
    : `${Math.floor(m / 60)}h ${m % 60}m`;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const evalReport = readJson(args.eval);
  const metrics = readJson(args.metrics);

  if (!evalReport && !metrics) {
    console.error(
      `combined: no inputs found.\n  eval:    ${args.eval}\n  metrics: ${args.metrics}\n` +
        `Run \`node evaluation/report.mjs …\` and \`experiment/exp report\` first.`,
    );
    process.exitCode = 1;
    return;
  }

  // Quality indexed by branch ref; regression counts by branch label.
  const qualityByRef = new Map();
  const regressionsByBranch = new Map();
  if (evalReport) {
    for (const b of evalReport.branches ?? []) {
      qualityByRef.set(b.ref, b);
    }
    for (const r of evalReport.regressions ?? []) {
      regressionsByBranch.set(
        r.branch,
        (regressionsByBranch.get(r.branch) ?? 0) + 1,
      );
    }
  }

  // One row per experiment env (model); join quality on primaryBranch = ref.
  const rows = [];
  const envs = (metrics?.environments ?? []).filter((e) => e.present);
  for (const e of envs) {
    const ref = e.primaryBranch ?? null;
    const q = ref ? qualityByRef.get(ref) : null;
    rows.push({
      model: e.name,
      branch: ref,
      cost: e.rollup?.cost ?? null,
      tokens: e.rollup?.tokens?.total ?? null,
      genMs: e.rollup?.genMs ?? null,
      wallMs: e.rollup?.wallMs ?? null,
      edits: e.rollup?.edits ?? null,
      quality: q
        ? {
            label: q.label,
            status: q.status,
            pass: q.totals?.pass,
            tests: q.totals?.tests,
            api: q.tiers?.api ?? null,
            cli: q.tiers?.cli ?? null,
            regressions: regressionsByBranch.get(q.label) ?? 0,
          }
        : null,
    });
  }

  const reference = evalReport
    ? (evalReport.branches ?? []).find(
        (b) => b.label === evalReport.referenceLabel,
      )
    : null;

  const combined = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    reference: reference
      ? {
          label: reference.label,
          status: reference.status,
          pass: reference.totals?.pass,
          tests: reference.totals?.tests,
        }
      : null,
    rows,
    sources: {
      eval: existsSync(args.eval) ? args.eval : null,
      metrics: existsSync(args.metrics) ? args.metrics : null,
    },
  };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(combined, null, 2)}\n`);
    return;
  }

  const L = [];
  L.push(`# Combined report — cost vs. quality`);
  L.push("");
  L.push(`- Generated: ${combined.generatedAt}`);
  if (combined.reference) {
    L.push(
      `- Reference: **${combined.reference.label}** — ${combined.reference.pass}/${combined.reference.tests} (${combined.reference.status})`,
    );
  }
  if (!metrics) {
    L.push(`- ⚠️ No experiment metrics (${args.metrics}); quality only.`);
  }
  if (!evalReport) {
    L.push(`- ⚠️ No evaluation report (${args.eval}); cost only.`);
  }
  L.push("");
  L.push(
    `| Model | Branch | Cost | Tokens | Gen | Wall | Tests | API | CLI | Regressions |`,
  );
  L.push(`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const r of rows) {
    const q = r.quality;
    L.push(
      `| ${r.model} | ${r.branch ?? "—"} | ${fmtCost(r.cost)} | ${fmtTokens(r.tokens)} | ` +
        `${fmtDur(r.genMs)} | ${fmtDur(r.wallMs)} | ${q ? `${q.pass}/${q.tests}` : "not graded"} | ` +
        `${q?.api ? `${q.api.pass}/${q.api.total}` : "—"} | ${q?.cli ? `${q.cli.pass}/${q.cli.total}` : "—"} | ` +
        `${q ? q.regressions : "—"} |`,
    );
  }
  if (rows.length === 0) {
    L.push(
      `| _(no experiment environments with data yet)_ | | | | | | | | | |`,
    );
  }
  L.push("");
  L.push(
    `_Cost/tokens/time from \`experiment/metrics.json\`; tests/tiers/regressions from \`evaluation/report.json\`. Join key: each experiment env's primary branch = the evaluation branch ref._`,
  );
  L.push("");

  const outDir = args.out ?? path.dirname(args.eval);
  mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "combined.json");
  const mdPath = path.join(outDir, "combined.md");
  writeFileSync(jsonPath, `${JSON.stringify(combined, null, 2)}\n`);
  writeFileSync(mdPath, `${L.join("\n")}\n`);
  console.error(`Combined report written to:\n  ${jsonPath}\n  ${mdPath}`);
};

main();
