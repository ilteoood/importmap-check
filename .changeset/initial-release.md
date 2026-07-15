---
"esm-check-updates": minor
---

Initial release of esm-check-updates.

Check and update ESM package versions pinned in browser import maps and CDN URL specifiers, available as both a CLI (`esm-check-updates`) and a programmatic API.

- **Check**: scan HTML import maps / CDN URLs and report which pinned packages have newer versions available.
- **Preview / dry-run**: show a unified diff of the version rewrites that would be applied, without touching files.
- **Update**: rewrite specifiers in place to the latest versions allowed by each pin's semver range.
- Semver-range-aware version resolution (caret, tilde, and 0.x quirks) with support for `?deps=` query pins.
