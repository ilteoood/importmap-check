# LLM experiment harness (opencode)

Run the **same task twice** — once on paid Anthropic **Sonnet 5**, once on local
**Qwen3.6 via llama.cpp** — in fully isolated opencode environments, then compare
the process/cost metrics.

This directory is **local-only**: it's hidden via `.git/info/exclude`, so it never
appears in `git status` and never lands on any branch. That keeps the experiment
branches clean (no hint that a comparison is happening) and stays out of the way
of the `evaluation/` output-quality harness (owned separately).

> **Two harnesses, two questions.**
> `evaluation/` (tracked, generic) answers _"did the produced code pass the canonical suite?"_ — output quality.
> `experiment/` (this, untracked) answers _"what did it cost to produce — tokens, dollars, time?"_ — process cost.

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

Each rebuild branch forks from **`openspec-starter`** — the clean fork point
(specs + `src`/`bin` stubs, `package.json` → `test/`). Forking from `openspec-starter`
(not `openspec-base`) means `test-baseline/` and `evaluation/` are **absent from
the working tree** on these branches, so the model never sees the graded suite or
the grader. (`experiment/` itself is local-only via `.git/info/exclude`, so it
stays on disk and remains usable — it's process metrics, not the answer key.)

Work each branch in its matching environment. Use the **same base prompt** in both
(e.g. kick off `/opsx:propose ...`, then implement), iterating changes until the
`evaluation/` harness passes.

```bash
git switch -c exp/sonnet-5 openspec-starter   # fork the clean starter
experiment/exp start sonnet       # opens the opencode TUI, model pinned, isolated DB

git switch -c exp/qwen3.6 openspec-starter
experiment/exp start qwen
```

> `exp` runs opencode in the checkout that physically contains `experiment/` — it
> resolves the repo as `git -C experiment rev-parse --show-toplevel` and `cd`s
> there. So rebuilds run **in place** in this checkout; a separate worktree is not
> used even if you invoke `exp` by path from one.
>
> Caveat: switching to an `exp/*` branch removes the _tracked_ `evaluation/` +
> `test-baseline/`, but the gitignored `evaluation/reports/` (whose `report.md`
> lists canonical test names) survives on disk. Run `rm -rf evaluation` before
> `exp start` so the model can't see it.

Grade output quality from an `openspec-base` checkout (that branch has
`evaluation/` + `test-baseline/`) — see [`../evaluation/README.md`](../evaluation/README.md):

```bash
git switch openspec-base
node evaluation/report.mjs --reference main --base-ref openspec-base \
  --branches "sonnet=exp/sonnet-5,qwen=exp/qwen3.6"
```

Everything that happens in the TUI is recorded in that env's isolated `opencode.db`.
Each launch also appends an audit line to `reports/runs.jsonl` (env, model, branch,
commit, time).

Headless variant (scripted, exact per-invocation timing):

```bash
experiment/exp run sonnet -- --prompt "…" --title "task-1"
```

## Reporting

```bash
experiment/exp report            # writes reports/metrics.{json,md} + console summary
experiment/exp report -- --all   # include sessions from other projects too
experiment/exp stats sonnet      # opencode's built-in per-env stats view
```

`reports/metrics.md` gives a side-by-side comparison:

- **Spend** — total cost per env ($0 for local qwen).
- **Tokens** — total + input / output / reasoning / cache-read / cache-write, and median per session.
- **Time** — session wall-clock (includes your think/read time) **and** model generation time (summed assistant-message compute — the cleaner "model was working" measure).
- **Effort** — assistant turns, user messages, tool calls + tool time, and a full tool-usage breakdown.
- **Output** — lines added/deleted, files touched.
- Plus a per-session table for each env.

Session→environment attribution is automatic (each env has its own DB). Sessions
are filtered to this repo by default; `--all` widens it.

## Commands

```
experiment/exp start  <sonnet|qwen> [-- <opencode args>]   open the TUI (pinned model, isolated env)
experiment/exp run    <sonnet|qwen> -- <opencode run args> headless run
experiment/exp auth   <sonnet|qwen>                        authenticate in the env's isolated store
experiment/exp models <sonnet|qwen>                        list models visible in the env
experiment/exp stats  <sonnet|qwen> [-- <args>]            opencode's built-in stats
experiment/exp report [-- <metrics.mjs args>]              cross-env metrics report
experiment/exp env    <sonnet|qwen>                        print env vars (for `eval $(...)`)
experiment/exp paths  <sonnet|qwen>                        print data dir / db / config paths
```

## Files

```
experiment/
  exp                       launcher (bash)
  env/opencode.sonnet.jsonc paid Anthropic Sonnet 5 config
  env/opencode.qwen.jsonc   local Qwen3.6 (llama.cpp) config
  metrics.mjs               process/cost reporter (reads each env's opencode.db)
  reports/                  generated: metrics.{json,md}, runs.jsonl
```
