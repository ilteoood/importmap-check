# importmap-check

## 0.1.0

### Minor Changes

- 2013b69: Initial release of importmap-check.

  Check and update ESM package versions pinned in browser import maps and CDN URL specifiers, available as both a CLI (`importmap-check`) and a programmatic API.

  - **Check**: scan HTML import maps / CDN URLs and report which pinned packages have newer versions available.
  - **Preview / dry-run**: show a unified diff of the version rewrites that would be applied, without touching files.
  - **Update**: rewrite specifiers in place to the latest versions allowed by each pin's semver range.
  - Semver-range-aware version resolution (caret, tilde, and 0.x quirks) with support for `?deps=` query pins.
