# importmap-check

Dependency checker/updater for ESM dependencies from common CDNs.

## Overview

importmap-check reads your ESM import maps and identifies dependency versions and available upgrades. The default invocation is check-only: it analyzes targets and reports findings without modifying files. Pass `--update` / `-u` to rewrite updateable entries in place.

Features:

- Modern CDN support: [jsDelivr](https://www.jsdelivr.com/esm), [esm.sh](https://esm.sh/)
- Simple, no-dep CLI.

## Installation

Run it on demand with `npx`:

```sh
$ npx importmap-check <target-path>
```

Or install it globally:

```sh
$ npm install --global importmap-check
```
