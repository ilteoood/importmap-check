#!/usr/bin/env node

const main = async () => {
  console.log("TODO: CLI"); // eslint-disable-line no-undef
};

if (import.meta.main) {
  main().catch((err) => {
    console.error(err); // eslint-disable-line no-undef
    process.exit(1);
  });
}
