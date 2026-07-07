import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { analyzeTarget } from "../src/index.js";
import { formatReport } from "../src/report.js";

const fixturesRoot = path.resolve(import.meta.dirname, "fixtures");

const fixturePath = (name) => path.join(fixturesRoot, name);

const stubResolveLatestVersion = (versions) => {
  return async (packageName) => versions[packageName];
};

const analyzeWithSources = async (fixtureName, latestVersions) => {
  return await analyzeTarget(fixturePath(fixtureName), {
    resolveLatestVersion: stubResolveLatestVersion(latestVersions),
    withSources: true,
  });
};

test("default report without sources is byte-identical to three-column output", async () => {
  const report = await analyzeWithSources("inline-importmap.html", {
    react: "19.3.0",
    "react-dom": "19.3.0",
  });
  const output = formatReport(report, { colorEnabled: false });

  assert.match(output, /Package\s+\|\s+Current\s+\|\s+Latest/);
  assert.doesNotMatch(output, /\|\s+Source/);
  assert.match(output, /react\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0/);
  assert.match(output, /react-dom\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0/);
});

test("sources column renders inline when labels fit", async () => {
  const report = await analyzeWithSources("inline-importmap.html", {
    react: "19.3.0",
    "react-dom": "19.3.0",
  });
  const output = formatReport(report, {
    colorEnabled: false,
    sourcesEnabled: true,
    width: 200,
  });

  assert.match(output, /Package\s+\|\s+Current\s+\|\s+Latest\s+\|\s+Source/);
  assert.match(
    output,
    /react\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0\s+\|\s+react \(jsdelivr\)/,
  );
  assert.match(
    output,
    /react-dom\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0\s+\|\s+react-dom\/client \(jsdelivr\)/,
  );
});

test("sources column wraps with hanging indent when labels overflow", async () => {
  const report = await analyzeWithSources("scopes-and-remaps.html", {
    react: "19.3.0",
  });
  const output = formatReport(report, {
    colorEnabled: false,
    sourcesEnabled: true,
    width: 100,
  });

  assert.match(output, /Package\s+\|\s+Current\s+\|\s+Latest\s+\|\s+Source/);
  // Each source label appears on its own line when the joined form overflows.
  assert.match(output, /\.\/vendor\/react\.js \(esm\.sh\)/);
  assert.match(
    output,
    /https:\/\/cdn\.jsdelivr\.net\/npm\/react@19\.0\.0\/ \(jsdelivr\)/,
  );
  assert.match(output, /react\/ \(jsdelivr\)/);
  // Continuation lines blank the first three columns (no Package/Current/Latest content).
  const continuationLines = output
    .split("\n")
    .filter((line) => /^\s+\|\s+\|\s+\|/.test(line));
  assert.ok(
    continuationLines.length >= 2,
    `expected at least 2 continuation lines, got: ${continuationLines.length}`,
  );
  assert.match(continuationLines[0], /https:\/\/cdn\.jsdelivr\.net/);
  assert.match(continuationLines[1], /react\/ \(jsdelivr\)/);
});

test("long single-token source labels chunk-wrap with a deeper hanging indent", async () => {
  // This fixture's source label has no internal spaces; the wrap path breaks
  // the token at the source column width and indents continuation chunks.
  const report = await analyzeWithSources("long-source-key.html", {
    react: "19.3.0",
  });
  const output = formatReport(report, {
    colorEnabled: false,
    sourcesEnabled: true,
    width: 60,
  });

  assert.match(output, /https:\/\/cdn\.example\.com\/very\/lo/);
  // Deeper 2-space indented continuation chunks from the long-word branch.
  assert.match(output, /\|\s+ {2}ng\/path\/name\/that\/exceeds\/the/);
});

test("multi-word source labels word-wrap at the space boundary with a deeper hanging indent", async () => {
  // ./vendor/react.js (esm.sh) is 27 chars total; at width 60 sourceWidth is
  // narrow enough that the joined form doesn't fit, so it splits at the space.
  // The wrapped continuation line shows (esm.sh) deeper-indented relative to
  // the source column start, distinct from a next-source line.
  const report = await analyzeWithSources("scopes-and-remaps.html", {
    react: "19.3.0",
  });
  const output = formatReport(report, {
    colorEnabled: false,
    sourcesEnabled: true,
    width: 60,
  });

  const wrapContinuation = output
    .split("\n")
    .find(
      (line) =>
        /^\s+\|\s+\|\s+\|/.test(line) &&
        /\(esm\.sh\)/.test(line) &&
        !/vendor/.test(line),
    );

  assert.ok(
    wrapContinuation,
    "expected a word-wrap continuation line carrying only (esm.sh) on a deeper-indented line",
  );
});

test("duplicate sources are deduplicated across import maps", async () => {
  const report = await analyzeWithSources("duplicate-sources.html", {
    react: "19.3.0",
  });

  const reactResult = report.packageResults.find(
    (result) => result.packageName === "react",
  );

  assert.equal(reactResult.sources.length, 1);
  assert.equal(reactResult.sources[0].label, "react (esm.sh)");
});

test("sources are sorted by import map key, cdn family, and specifier", async () => {
  const report = await analyzeWithSources("scopes-and-remaps.html", {
    react: "19.3.0",
  });

  const reactResult = report.packageResults.find(
    (result) => result.packageName === "react",
  );
  const labels = reactResult.sources.map((source) => source.label);

  assert.deepEqual(labels, [
    "./vendor/react.js (esm.sh)",
    "https://cdn.jsdelivr.net/npm/react@19.0.0/ (jsdelivr)",
    "react/ (jsdelivr)",
  ]);
});

test("withSources false leaves packageResults sources undefined", async () => {
  const report = await analyzeTarget(fixturePath("inline-importmap.html"), {
    resolveLatestVersion: stubResolveLatestVersion({
      react: "19.3.0",
      "react-dom": "19.3.0",
    }),
    withSources: false,
  });

  for (const result of report.packageResults) {
    assert.equal(result.sources, undefined);
  }
});

test("current packages also render the source column", async () => {
  const report = await analyzeWithSources("inline-importmap.html", {
    react: "19.2.3",
    "react-dom": "19.2.3",
  });
  const output = formatReport(report, {
    colorEnabled: false,
    sourcesEnabled: true,
    width: 200,
  });

  assert.match(output, /## Current/);
  assert.match(
    output,
    /react\s+\|\s+19\.2\.3\s+\|\s+19\.2\.3\s+\|\s+react \(jsdelivr\)/,
  );
});
