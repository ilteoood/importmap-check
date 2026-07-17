# LLM experiment harness (opencode)

Run the **same task twice** — once on paid Anthropic **Sonnet 5**, once on local
**Qwen3.6 via llama.cpp** — in fully isolated opencode environments, then compare
the process/cost metrics.

This harness lives on **`openspec-base`** alongside `evaluation/` (both are
tooling that operates on rebuild branches). It is deliberately **not** on
`openspec-starter`, so rebuild branches forked from the starter never contain it
— the model never sees the harness, the grader, or the graded suite.

> **Two harnesses, two questions** (both tracked on `openspec-base`):
> `evaluation/` answers _"did the produced code pass the canonical suite?"_ — output quality.
> `experiment/` (this) answers _"what did it cost to produce — tokens, dollars, time?"_ — process cost.
> `evaluation/combined.mjs` joins them into one cost-vs-quality table.

## How it fits together

- Rebuilds run in a **git worktree** forked from `openspec-starter` (created by
  `exp new`). That worktree has no `evaluation/`, `test-baseline/`, or
  `experiment/` — a clean spec-only starting point.
- `exp` runs opencode **in that worktree** and records which env/branch/dir each
  session used to `reports/runs.jsonl`.
- You run `exp` (and `evaluation/`) from your **`openspec-base` checkout**, which
  is where this harness physically lives.

## Isolation model

Each environment gets its own XDG dirs under `~/.opencode-exp/<env>/`
(`$OPENCODE_EXP_ROOT` to override):

| Env      | Model                              | Config                      | Data / DB                                          |
| -------- | ---------------------------------- | --------------------------- | -------------------------------------------------- |
| `sonnet` | `anthropic/claude-sonnet-5` (paid) | `env/opencode.sonnet.jsonc` | `~/.opencode-exp/sonnet/data/opencode/opencode.db` |
| `qwen`   | `llamacpp/qwen3.6-35b-a3b-mtp`     | `env/opencode.qwen.jsonc`   | `~/.opencode-exp/qwen/data/opencode/opencode.db`   |

Config, auth, logs, and the session/cost database are **fully separate** per env
and separate from your normal `~/.local/share/opencode`. The launcher points
`XDG_CONFIG_HOME` at an empty per-env dir so your global `~/.config/opencode`
(and its other providers) never leaks in — the model is the only variable.

## One-time setup

The Anthropic env needs the paid key authenticated once (its own auth store):

```bash
experiment/exp auth sonnet      # paste your Anthropic API key
# or: export ANTHROPIC_API_KEY=... before `start`
```

For `qwen`, just make sure llama.cpp is serving on `127.0.0.1:8001` (per
`env/opencode.qwen.jsonc`).

## Running the experiment

From your `openspec-base` checkout. `exp new` creates a worktree off
`openspec-starter` on branch `exp/<env>` (default; override with a branch arg)
and opens the opencode TUI there. Use the **same base prompt** in both envs
(e.g. `/opsx:propose ...`, then implement), iterating until `evaluation/` passes.

```bash
experiment/exp new sonnet         # worktree ../ic-sonnet on exp/sonnet, off openspec-starter
experiment/exp new qwen           # worktree ../ic-qwen   on exp/qwen

# resume later / attach an existing worktree:
experiment/exp start sonnet
```

Worktrees land under `$EXP_WORKTREE_ROOT` (default: the parent of this repo) as
`ic-<slug>`; the base branch is `$EXP_STARTER_REF` (default `openspec-starter`).
Commit the rebuild on its branch when done (`git -C ../ic-sonnet add -A && …`).

Everything in the TUI is recorded in that env's isolated `opencode.db`. Each
launch also appends an audit line to `reports/runs.jsonl` (env, model, branch,
commit, **directory**, time) — the `directory` is how metrics attributes
worktree sessions back to a branch.

Headless variant (scripted, exact per-invocation timing):

```bash
experiment/exp run sonnet -- --prompt "…" --title "task-1"
```

Manage worktrees:

```bash
experiment/exp ls                 # list rebuild worktrees
experiment/exp rm sonnet          # remove the worktree (keeps the branch)
```

## Reporting

### Process cost (this harness)

```bash
experiment/exp report            # writes reports/metrics.{json,md} + console summary
experiment/exp report -- --all   # include sessions from other projects too
experiment/exp stats sonnet      # opencode's built-in per-env stats view
```

`reports/metrics.md` gives a side-by-side comparison: spend; tokens (input /
output / reasoning / cache, + median per session); session wall-clock **and**
model generation time; assistant turns, user messages, tool calls + tool time
with a full tool-usage breakdown; lines added/deleted and files touched; plus a
per-session table per env.

Attribution: each env has its own DB (env is trivial). Sessions are matched to a
branch via `reports/runs.jsonl` (the `directory` recorded at launch → the
worktree → its `exp/*` branch). `exp report` passes `--runs reports/runs.jsonl`
automatically; without a runs file it falls back to `--repo`/`--all`.

### Combined cost vs. quality

After running both harnesses (`experiment/exp report` and
`node evaluation/report.mjs …`), join them:

```bash
npm run eval:combined            # or: node evaluation/combined.mjs
```

→ `evaluation/reports/combined.md`: one row per model with cost + tokens + time
**and** tests-passed / API-CLI tiers / regressions. The join key is each env's
primary branch (from `runs.jsonl`) = the evaluation branch ref.

### Grade output quality (the other harness)

```bash
node evaluation/report.mjs --reference main --base-ref openspec-base \
  --branches "sonnet=exp/sonnet,qwen=exp/qwen"
```

See [`../evaluation/README.md`](../evaluation/README.md).

## Commands

```
experiment/exp new    <sonnet|qwen> [branch] [-- <opencode args>]   create worktree off openspec-starter + open TUI
experiment/exp start  <sonnet|qwen> [branch] [-- <opencode args>]   attach existing worktree + open TUI
experiment/exp run    <sonnet|qwen> [branch] -- <opencode run args> headless run in the worktree
experiment/exp ls                                                   list rebuild worktrees
experiment/exp rm     <sonnet|qwen|branch>                          remove a worktree (keeps the branch)
experiment/exp auth   <sonnet|qwen>                                 authenticate in the env's isolated store
experiment/exp models <sonnet|qwen>                                 list models visible in the env
experiment/exp stats  <sonnet|qwen> [-- <args>]                     opencode's built-in stats
experiment/exp report [-- <metrics.mjs args>]                       cross-env process-cost report
experiment/exp env    <sonnet|qwen>                                 print env vars (for `eval $(...)`)
experiment/exp paths  <sonnet|qwen>                                 print data dir / db / worktree paths
```

## Files

```
experiment/
  exp                       launcher (bash) — worktrees + env isolation
  env/opencode.sonnet.jsonc paid Anthropic Sonnet 5 config
  env/opencode.qwen.jsonc   local Qwen3.6 (llama.cpp) config
  metrics.mjs               process/cost reporter (reads each env's opencode.db)
  reports/                  generated (gitignored): metrics.{json,md}, runs.jsonl
```
