// Shared semver selector patterns used across analysis and rewrite. A bare
// major (`18`) or major.minor (`18.3`) selector is resolved/rewritten
// differently from a pinned version or a range.
export const MAJOR_SELECTOR_PATTERN = /^\d+$/;
export const MINOR_SELECTOR_PATTERN = /^\d+\.\d+$/;
