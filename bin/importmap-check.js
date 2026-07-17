#!/usr/bin/env node

// Skeleton CLI. Implement `run`: parse argv, validate the target, dispatch to
// the library verbs (check/preview/update), and write their output. The library
// stays not-CLI-aware; presentation and registry decisions are made here.
const run = async () => {
  // TODO: implement CLI against openspec/specs/cli. Read process.argv.slice(2),
  // validate the target, dispatch to check/preview/update, and write output.
};

if (import.meta.main) {
  await run();
}
