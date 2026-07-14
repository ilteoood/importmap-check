import { analyzeTarget } from "./analyze-target.js";
import {
  formatDryRunSummary,
  formatReport,
  formatUpdateSummary,
} from "./report.js";
import { commitTargetRewrite, planTargetRewrite } from "./rewrite-target.js";

// Minimum, not-CLI-aware library API. Each verb takes a target path plus plain
// options and returns `{ output, data }`:
//   - `output` is the rendered, human-readable report/summary string (reporting
//     is a library concern here so the CLI stays a thin adapter).
//   - `data` is the structured result (report, or { report, plan }) for callers
//     and tests that want to assert on values rather than parse the string.
// These functions do no argv parsing, no process.exit, and no TTY sniffing;
// `colorEnabled` and the effective report `width` are supplied by the caller.
// Fatal conditions throw an Error whose `.exitCode` the caller may honor.

export const check = async (targetPath, options = {}) => {
  const { colorEnabled, registryBaseUrl, sources = false, width } = options;
  const report = await analyzeTarget(targetPath, {
    registryBaseUrl,
    withSources: sources,
  });
  const output = formatReport(report, {
    colorEnabled,
    sourcesEnabled: sources,
    width,
  });

  return { data: report, output };
};

export const preview = async (targetPath, options = {}) => {
  const { colorEnabled, registryBaseUrl } = options;
  const report = await analyzeTarget(targetPath, { registryBaseUrl });
  const plan = await planTargetRewrite(targetPath, report);
  const output = formatDryRunSummary(plan, report, { colorEnabled });

  return { data: { plan, report }, output };
};

export const update = async (targetPath, options = {}) => {
  const { colorEnabled, registryBaseUrl } = options;
  const report = await analyzeTarget(targetPath, { registryBaseUrl });
  const plan = await planTargetRewrite(targetPath, report);
  await commitTargetRewrite(targetPath, plan);
  const output = formatUpdateSummary(plan, report, { colorEnabled });

  return { data: { plan, report }, output };
};
