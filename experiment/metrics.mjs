// metrics.mjs — process/cost metrics for the opencode LLM experiment.
//
// Reads each environment's ISOLATED opencode.db (session/message/part tables)
// and produces a cross-environment comparison: tokens (by category), spend,
// wall-clock vs. model-generation time, messages/turns, tool-call breakdown,
// and code edits. Output: reports/metrics.json + reports/metrics.md, plus a
// console summary.
//
// This is the counterpart to evaluation/report.mjs: that one judges the QUALITY
// of the produced code (does it pass the canonical suite); this one measures the
// COST of producing it (tokens, dollars, time).
//
// Zero dependencies — shells out to the `sqlite3` CLI (`-json`).
//
// Usage:
//   node experiment/metrics.mjs [--exp-root <dir>] [--repo <path>]
//     [--env sonnet,qwen] [--db <path>]   # override a single DB (repeatable)
//     [--all]                             # include sessions from other projects
//     [--out <dir>] [--json]              # write files / dump JSON to stdout
//
// Session→environment attribution is trivial: each environment has its own DB.
// Session→project is filtered by `session.directory == repo` unless --all.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_ENVS = ["sonnet", "qwen"];

const parseArgs = (argv) => {
  const args = {
    expRoot: path.join(process.env.HOME ?? "", ".opencode-exp"),
    repo: process.cwd(),
    envs: null, // null → DEFAULT_ENVS
    dbOverrides: {}, // env → path
    all: false,
    runs: null, // path to runs.jsonl (env→worktree-dir attribution)
    out: null,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[(i += 1)];
    switch (arg) {
      case "--exp-root":
        args.expRoot = path.resolve(next());
        break;
      case "--repo":
        args.repo = path.resolve(next());
        break;
      case "--env":
        args.envs = next()
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "--all":
        args.all = true;
        break;
      case "--runs":
        args.runs = path.resolve(next());
        break;
      case "--out":
        args.out = path.resolve(next());
        break;
      case "--json":
        args.json = true;
        break;
      case "--db": {
        // --db env=path  (or bare path → applies to a synthetic "db" env)
        const val = next();
        const eq = val.indexOf("=");
        if (eq >= 0) {
          args.dbOverrides[val.slice(0, eq)] = path.resolve(val.slice(eq + 1));
        } else {
          args.dbOverrides["db"] = path.resolve(val);
        }
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
};

// Parse runs.jsonl into per-env attribution: which worktree directories a
// session must have run in to count for that env, plus the dir→branch map and
// the most-recent branch per env. Returns Map(env → {dirs:Set, branchByDir:Map,
// primaryBranch}). Empty map if the file is missing/unreadable.
const loadRuns = (runsPath) => {
  const byEnv = new Map();
  if (!runsPath || !existsSync(runsPath)) {
    return byEnv;
  }
  let text;
  try {
    text = readFileSync(runsPath, "utf8");
  } catch {
    return byEnv;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let rec;
    try {
      rec = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const { env, directory, branch, time } = rec;
    if (!env || !directory) {
      continue;
    }
    const dir = path.resolve(directory);
    const entry = byEnv.get(env) ?? {
      dirs: new Set(),
      branchByDir: new Map(),
      primaryBranch: branch ?? null,
      latest: time ?? "",
    };
    entry.dirs.add(dir);
    if (branch) {
      entry.branchByDir.set(dir, branch);
    }
    if ((time ?? "") >= (entry.latest ?? "")) {
      entry.latest = time ?? "";
      entry.primaryBranch = branch ?? entry.primaryBranch;
    }
    byEnv.set(env, entry);
  }
  return byEnv;
};

// Run one SQL query, return rows as objects (empty array on any failure).
const query = (db, sql) => {
  try {
    const out = execFileSync("sqlite3", ["-json", "-readonly", db, sql], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
    const trimmed = out.trim();
    return trimmed ? JSON.parse(trimmed) : [];
  } catch {
    return [];
  }
};

const num = (v) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;

const median = (values) => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Collect per-session metrics for one environment's database.
//
// Attribution, in priority order:
//   1. `dirs` (from runs.jsonl) — keep sessions whose directory is one of this
//      env's recorded rebuild-worktree dirs. This is exact and worktree-aware.
//   2. else `all` — keep every session in the DB.
//   3. else `repo` — legacy single-directory match.
const collectEnv = (
  name,
  db,
  { repo, all, dirs = null, branchByDir = null },
) => {
  const env = {
    name,
    db,
    present: existsSync(db),
    sessions: [],
    rollup: null,
    branches: [],
    primaryBranch: null,
  };
  if (!env.present) {
    return env;
  }

  const sessions = query(
    db,
    `SELECT id, title, slug, directory, agent,
       json_extract(model,'$.providerID') AS provider,
       json_extract(model,'$.id')         AS model_id,
       cost, tokens_input, tokens_output, tokens_reasoning,
       tokens_cache_read, tokens_cache_write,
       time_created, time_updated,
       summary_additions, summary_deletions, summary_files
     FROM session ORDER BY time_created`,
  );

  // Message counts by role, and summed assistant generation time.
  const msgRows = query(
    db,
    `SELECT session_id,
       json_extract(data,'$.role') AS role,
       count(*) AS n,
       sum(COALESCE(json_extract(data,'$.time.completed'),0)
           - COALESCE(json_extract(data,'$.time.created'),0)) AS gen_ms
     FROM message GROUP BY session_id, role`,
  );
  const msgBySession = new Map();
  for (const r of msgRows) {
    const s = msgBySession.get(r.session_id) ?? {
      user: 0,
      assistant: 0,
      genMs: 0,
    };
    if (r.role === "user") {
      s.user += num(r.n);
    } else if (r.role === "assistant") {
      s.assistant += num(r.n);
      s.genMs += num(r.gen_ms);
    }
    msgBySession.set(r.session_id, s);
  }

  // Tool-call counts + summed duration per session+tool.
  const toolRows = query(
    db,
    `SELECT session_id,
       json_extract(data,'$.tool') AS tool,
       count(*) AS n,
       sum(COALESCE(json_extract(data,'$.state.time.end'),0)
           - COALESCE(json_extract(data,'$.state.time.start'),0)) AS dur_ms
     FROM part WHERE json_extract(data,'$.type')='tool'
     GROUP BY session_id, tool`,
  );
  const toolsBySession = new Map();
  for (const r of toolRows) {
    const s = toolsBySession.get(r.session_id) ?? {
      total: 0,
      byTool: {},
      durMs: 0,
    };
    s.total += num(r.n);
    s.durMs += num(r.dur_ms);
    s.byTool[r.tool ?? "?"] = (s.byTool[r.tool ?? "?"] ?? 0) + num(r.n);
    toolsBySession.set(r.session_id, s);
  }

  const repoResolved = path.resolve(repo);
  const branchSet = new Set();
  for (const s of sessions) {
    const dir = path.resolve(s.directory ?? "");
    if (dirs) {
      if (!dirs.has(dir)) {
        continue;
      }
    } else if (!all && dir !== repoResolved) {
      continue;
    }
    const branch = branchByDir?.get(dir) ?? null;
    if (branch) {
      branchSet.add(branch);
    }
    const msg = msgBySession.get(s.id) ?? { user: 0, assistant: 0, genMs: 0 };
    const tools = toolsBySession.get(s.id) ?? {
      total: 0,
      byTool: {},
      durMs: 0,
    };
    const tokensTotal =
      num(s.tokens_input) +
      num(s.tokens_output) +
      num(s.tokens_reasoning) +
      num(s.tokens_cache_read) +
      num(s.tokens_cache_write);
    env.sessions.push({
      id: s.id,
      title: s.title,
      branch,
      model: `${s.provider ?? "?"}/${s.model_id ?? "?"}`,
      agent: s.agent,
      cost: num(s.cost),
      tokens: {
        input: num(s.tokens_input),
        output: num(s.tokens_output),
        reasoning: num(s.tokens_reasoning),
        cacheRead: num(s.tokens_cache_read),
        cacheWrite: num(s.tokens_cache_write),
        total: tokensTotal,
      },
      wallMs: Math.max(0, num(s.time_updated) - num(s.time_created)),
      genMs: msg.genMs,
      messages: { user: msg.user, assistant: msg.assistant },
      tools: { total: tools.total, durMs: tools.durMs, byTool: tools.byTool },
      edits: {
        additions: num(s.summary_additions),
        deletions: num(s.summary_deletions),
        files: num(s.summary_files),
      },
      timeCreated: num(s.time_created),
      timeUpdated: num(s.time_updated),
    });
  }

  env.branches = [...branchSet].sort();
  env.rollup = rollupEnv(env.sessions);
  return env;
};

const rollupEnv = (sessions) => {
  const r = {
    sessions: sessions.length,
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
    wallMs: 0,
    genMs: 0,
    messages: { user: 0, assistant: 0 },
    toolCalls: 0,
    toolDurMs: 0,
    byTool: {},
    edits: { additions: 0, deletions: 0, files: 0 },
    medianTokensPerSession: 0,
    medianWallMsPerSession: 0,
  };
  for (const s of sessions) {
    r.cost += s.cost;
    for (const k of Object.keys(r.tokens)) {
      r.tokens[k] += s.tokens[k];
    }
    r.wallMs += s.wallMs;
    r.genMs += s.genMs;
    r.messages.user += s.messages.user;
    r.messages.assistant += s.messages.assistant;
    r.toolCalls += s.tools.total;
    r.toolDurMs += s.tools.durMs;
    for (const [tool, n] of Object.entries(s.tools.byTool)) {
      r.byTool[tool] = (r.byTool[tool] ?? 0) + n;
    }
    r.edits.additions += s.edits.additions;
    r.edits.deletions += s.edits.deletions;
    r.edits.files += s.edits.files;
  }
  r.medianTokensPerSession = median(sessions.map((s) => s.tokens.total));
  r.medianWallMsPerSession = median(sessions.map((s) => s.wallMs));
  return r;
};

// ---- formatting helpers ---------------------------------------------------

const fmtInt = (n) => Math.round(n).toLocaleString("en-US");
const fmtTokens = (n) => {
  if (n >= 1e9) {
    return `${(n / 1e9).toFixed(2)}B`;
  }
  if (n >= 1e6) {
    return `${(n / 1e6).toFixed(2)}M`;
  }
  if (n >= 1e3) {
    return `${(n / 1e3).toFixed(1)}K`;
  }
  return String(Math.round(n));
};
const fmtCost = (n) => `$${n.toFixed(2)}`;
const fmtDur = (ms) => {
  const s = ms / 1000;
  if (s < 60) {
    return `${s.toFixed(1)}s`;
  }
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  if (m < 60) {
    return `${m}m ${rem}s`;
  }
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
const ratio = (a, b) =>
  b === 0 ? (a === 0 ? "—" : "∞") : `${(a / b).toFixed(2)}×`;

const renderMarkdown = (report) => {
  const L = [];
  const envs = report.environments;
  const present = envs.filter((e) => e.present);

  L.push(`# Experiment metrics — opencode process & cost`);
  L.push("");
  L.push(`- Generated: ${report.generatedAt}`);
  L.push(`- Repo: \`${report.repo}\`${report.all ? " (all projects)" : ""}`);
  L.push(
    `- Environments: ${envs.map((e) => `${e.name}${e.present ? "" : " (no data)"}`).join(", ")}`,
  );
  L.push("");

  if (present.length === 0) {
    L.push(
      `_No environment databases found yet. Run \`experiment/exp start <env>\` and work a session first._`,
    );
    L.push("");
    return `${L.join("\n")}\n`;
  }

  // Headline comparison table: metric × environment (+ ratio when exactly 2).
  L.push(`## Comparison`);
  L.push("");
  const cols = present.map((e) => e.name);
  const showRatio = present.length === 2;
  const header = [
    "Metric",
    ...cols,
    ...(showRatio ? [`${cols[0]} / ${cols[1]}`] : []),
  ];
  L.push(`| ${header.join(" | ")} |`);
  L.push(`| ${header.map(() => "---").join(" | ")} |`);

  const row = (label, pick, fmt = fmtInt) => {
    const vals = present.map((e) => pick(e.rollup));
    const cells = vals.map((v) => fmt(v));
    if (showRatio) {
      cells.push(ratio(vals[0], vals[1]));
    }
    L.push(`| ${label} | ${cells.join(" | ")} |`);
  };

  row("Sessions", (r) => r.sessions);
  row("Total cost", (r) => r.cost, fmtCost);
  row("Total tokens", (r) => r.tokens.total, fmtTokens);
  row("· input", (r) => r.tokens.input, fmtTokens);
  row("· output", (r) => r.tokens.output, fmtTokens);
  row("· reasoning", (r) => r.tokens.reasoning, fmtTokens);
  row("· cache read", (r) => r.tokens.cacheRead, fmtTokens);
  row("· cache write", (r) => r.tokens.cacheWrite, fmtTokens);
  row("Median tokens/session", (r) => r.medianTokensPerSession, fmtTokens);
  row("Session wall-clock", (r) => r.wallMs, fmtDur);
  row("Model generation time", (r) => r.genMs, fmtDur);
  row("Assistant turns", (r) => r.messages.assistant);
  row("User messages", (r) => r.messages.user);
  row("Tool calls", (r) => r.toolCalls);
  row("Tool time", (r) => r.toolDurMs, fmtDur);
  row("Lines added", (r) => r.edits.additions);
  row("Lines deleted", (r) => r.edits.deletions);
  row("Files touched", (r) => r.edits.files);
  L.push("");

  // Tool-usage breakdown per env.
  L.push(`## Tool usage`);
  L.push("");
  const allTools = [
    ...new Set(present.flatMap((e) => Object.keys(e.rollup.byTool))),
  ].sort((a, b) => {
    const sum = (t) =>
      present.reduce((n, e) => n + (e.rollup.byTool[t] ?? 0), 0);
    return sum(b) - sum(a);
  });
  if (allTools.length) {
    L.push(`| Tool | ${cols.join(" | ")} |`);
    L.push(`| ${["---", ...cols.map(() => "---")].join(" | ")} |`);
    for (const t of allTools) {
      L.push(
        `| ${t} | ${present.map((e) => fmtInt(e.rollup.byTool[t] ?? 0)).join(" | ")} |`,
      );
    }
    L.push("");
  }

  // Per-session detail, per env.
  for (const e of present) {
    L.push(`## Sessions — ${e.name}`);
    L.push("");
    if (e.sessions.length === 0) {
      L.push(
        `_No sessions in this repo yet (\`--all\` to include other projects)._`,
      );
      L.push("");
      continue;
    }
    L.push(
      `| Session | Model | Cost | Tokens | Wall | Gen | Turns | Tools | +/− |`,
    );
    L.push(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
    for (const s of e.sessions) {
      const title = (s.title ?? s.id).slice(0, 32);
      L.push(
        `| ${title} | ${s.model} | ${fmtCost(s.cost)} | ${fmtTokens(s.tokens.total)} | ` +
          `${fmtDur(s.wallMs)} | ${fmtDur(s.genMs)} | ${s.messages.assistant} | ` +
          `${s.tools.total} | +${s.edits.additions}/−${s.edits.deletions} |`,
      );
    }
    L.push("");
  }

  L.push(`---`);
  L.push(
    `_Notes: **Session wall-clock** is the span from first to last activity (includes your think/read time). **Model generation time** is the summed assistant-message compute time — a cleaner "the model was working" measure. Cost is $0 for local llama.cpp._`,
  );
  L.push("");
  return `${L.join("\n")}\n`;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const envNames = args.envs ?? DEFAULT_ENVS;
  const runs = loadRuns(args.runs); // Map(env → {dirs, branchByDir, primaryBranch})

  const collect = (name, db) => {
    const r = runs.get(name);
    const env = collectEnv(name, db, {
      repo: args.repo,
      all: args.all,
      dirs: r?.dirs ?? null,
      branchByDir: r?.branchByDir ?? null,
    });
    env.primaryBranch = r?.primaryBranch ?? env.branches[0] ?? null;
    return env;
  };

  const environments = envNames.map((name) => {
    const db =
      args.dbOverrides[name] ??
      path.join(args.expRoot, name, "data", "opencode", "opencode.db");
    return collect(name, db);
  });
  // Bare --db path with no matching env name → add as its own environment.
  for (const [name, db] of Object.entries(args.dbOverrides)) {
    if (!envNames.includes(name)) {
      environments.push(collect(name, db));
    }
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repo: args.repo,
    all: args.all,
    environments,
  };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const outDir = args.out ?? path.join(process.cwd(), "reports");
  mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "metrics.json");
  const mdPath = path.join(outDir, "metrics.md");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(mdPath, renderMarkdown(report));

  // Console summary.
  const present = environments.filter((e) => e.present);
  console.error("");
  if (present.length === 0) {
    console.error(
      "No environment databases found yet. Start a session with `experiment/exp start <env>`.",
    );
  } else {
    for (const e of present) {
      const r = e.rollup;
      console.error(
        `  ${e.name.padEnd(8)} ${String(r.sessions).padStart(2)} sess  ` +
          `${fmtCost(r.cost).padStart(8)}  ${fmtTokens(r.tokens.total).padStart(8)} tok  ` +
          `gen ${fmtDur(r.genMs)}`,
      );
    }
  }
  console.error("");
  console.error(`Report written to:\n  ${jsonPath}\n  ${mdPath}`);
};

main();
