import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import { preview } from "../../src/index.js";
import { createFixtureRegistry } from "../helpers/cli.js";
import { packument, startMockRegistry } from "../helpers/mock-registry.js";

// Layer-2 contract tests for the `preview` (dry-run) verb: it computes the
// rewrite plan, renders a diff, and writes nothing. Assertions are semantic —
// plan shape, diff content tokens, and the no-write guarantee.

const { cleanup, createFixtureDir } = createFixtureRegistry();

let registry;

before(async () => {
  registry = await startMockRegistry({
    react: packument("react", { latest: "19.3.0" }),
  });
});

after(async () => {
  await cleanup();
  await registry.close();
});

const writeImportMap = async (contents) => {
  const dir = await createFixtureDir();
  const file = path.join(dir, "import-map.json");
  await writeFile(file, `${JSON.stringify(contents, null, 2)}\n`);

  return file;
};

const runPreview = (file) =>
  preview(file, { colorEnabled: false, registryBaseUrl: registry.url });

test("plans a rewrite, renders a diff, and writes nothing", async () => {
  const file = await writeImportMap({
    imports: { react: "https://esm.sh/react@19.2.3" },
  });
  const before = await readFile(file, "utf8");

  const { data, output } = await runPreview(file);

  assert.equal(data.plan.noChanges, false);
  const rewrite = data.plan.rewrites.find((r) => r.packageName === "react");
  assert.equal(rewrite.currentVersion, "19.2.3");
  assert.equal(rewrite.latestVersion, "19.3.0");
  assert.equal(rewrite.newSpecifier, "19.3.0");

  assert.match(output, /no files written/i);
  assert.match(output, /-[^\n]*react@19\.2\.3/);
  assert.match(output, /\+[^\n]*react@19\.3\.0/);

  // Dry run must not touch the file on disk.
  assert.equal(await readFile(file, "utf8"), before);
});

test("reports no changes when everything is current", async () => {
  const file = await writeImportMap({
    imports: { react: "https://esm.sh/react@19.3.0" },
  });
  const before = await readFile(file, "utf8");

  const { data, output } = await runPreview(file);

  assert.equal(data.plan.noChanges, true);
  assert.match(output, /no changes would be written/i);
  assert.equal(await readFile(file, "utf8"), before);
});

test("surfaces stripped integrity entries in the plan and output", async () => {
  const file = await writeImportMap({
    imports: { react: "https://esm.sh/react@19.2.3" },
    integrity: { "https://esm.sh/react@19.2.3": "sha384-fake" },
  });

  const { data, output } = await runPreview(file);

  assert.ok(data.plan.strippedIntegrityEntries.length >= 1);
  assert.equal(
    data.plan.strippedIntegrityEntries[0].url,
    "https://esm.sh/react@19.2.3",
  );
  assert.match(output, /## Stripped integrity entries/);
});
