export { check, preview, update } from "./api.js";
export { analyzeTarget } from "./analysis/analyze.js";
export { resolveSemverRange } from "./analysis/resolve-version.js";
export {
  formatDryRunSummary,
  formatReport,
  formatUpdateSummary,
} from "./reporting/format.js";
export { renderUnifiedDiff } from "./reporting/unified-diff.js";
export { rewriteSpecifier } from "./rewrite/specifier.js";
export {
  commitTargetRewrite,
  planTargetRewrite,
  replaceDepsSpecifier,
  rewriteTargetInPlace,
} from "./rewrite/target.js";
