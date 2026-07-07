# esm-check-updates

Dependency checker/updater for ESM dependencies from common CDNs.

## Overview

ECU reads your ESM import maps and identifies dependency versions and available upgrades. The current CLI is check-only: it analyzes targets and reports findings without modifying files.

Features:

- Modern CDN support: [jsDelivr](https://www.jsdelivr.com/esm), [esm.sh](https://esm.sh/)
- Simple, no-dep CLI.

## Usage

```sh
$ esm-check-updates [options] <target-path>
```

Options:

- `--sources` — Show the import-map entry origins that contributed to each conflated package row.
- `--width <num>` — Override the available report width (used with `--sources`). Defaults to the terminal width, or `120` when not running in a TTY.

Supported target types:

- Standalone import map JSON files
- HTML files with one or more inline `<script type="importmap">` blocks

Current behavior:

- Parses import map `imports` entries from JSON and inline HTML
- Supports package-style keys and remap-style URL/path keys
- Analyzes `jsdelivr` and `esm.sh` destination URLs
- Combines multiple inline import maps into one package-level analysis result
- Optionally shows contributing import-map entries with `--sources`
- Warns for supported-but-unparseable entries and unsupported `scopes`
- Does not update files in place yet

## Development Workflow

- Run `npm run format` after repo changes from a shell where the expected Node version is already active.
- Treat formatting as part of done: auto-fix what can be fixed, and investigate any remaining failures before considering the work complete.

## Example Output

```bash
$ esm-check-updates
Target: ./public/index.html

## Updates
Package    Current  Latest
---------  -------  ------
react      19.2.3   19.3.0
react-dom  19.2.3   19.3.0

## Warnings
- ./public/index.html contains `scopes`, which are not yet supported.
```
