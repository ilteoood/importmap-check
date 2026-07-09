import { test } from "node:test";
import assert from "node:assert/strict";

import { formatUpdateSummary } from "../src/report.js";

const emptyReport = () => ({
  lookupFailures: [],
  notes: [],
  packageResults: [],
  targetPath: "/tmp/target.html",
  warnings: [],
});

test("no changes prints exact literal when nothing else to show", () => {
  const rewrite = {
    lookupFailures: [],
    notes: [],
    noChanges: true,
    rewrites: [],
    strippedIntegrityEntries: [],
    targetPath: "/tmp/target.html",
    warnings: [],
  };

  const output = formatUpdateSummary(rewrite, emptyReport(), {
    colorEnabled: false,
  });

  assert.equal(output, "No changes to write.");
});

test("no changes still surfaces analyzer notes and warnings", () => {
  const rewrite = {
    lookupFailures: [],
    notes: [{ message: "react appears as `@beta` — dist-tag entries float." }],
    noChanges: true,
    rewrites: [],
    strippedIntegrityEntries: [],
    targetPath: "/tmp/target.html",
    warnings: [
      { type: "unsupported-scopes", message: "target contains `scopes`." },
    ],
  };
  const report = {
    ...emptyReport(),
    notes: rewrite.notes,
    warnings: rewrite.warnings,
  };

  const output = formatUpdateSummary(rewrite, report, { colorEnabled: false });

  assert.match(output, /^No changes to write\.\n/);
  assert.match(output, /\n\n## Warnings\n- target contains `scopes`\./);
  assert.match(
    output,
    /\n\n## Notes\n- react appears as `@beta` — dist-tag entries float\./,
  );
});

test("single rewrite renders header, row, and no extra sections", () => {
  const rewrite = {
    lookupFailures: [],
    notes: [],
    noChanges: false,
    rewrites: [
      {
        currentVersion: "19.2.3",
        latestVersion: "19.3.0",
        newSpecifier: "19.3.0",
        newUrl: "https://esm.sh/react@19.3.0",
        oldSpecifier: "",
        oldUrl: "https://esm.sh/react@19.2.3",
        packageName: "react",
      },
    ],
    strippedIntegrityEntries: [],
    targetPath: "/tmp/target.html",
    warnings: [],
  };
  const report = emptyReport();

  const output = formatUpdateSummary(rewrite, report, { colorEnabled: false });

  assert.match(output, /^Updated \/tmp\/target\.html:\n/);
  assert.match(output, /react {2}19\.2\.3 → 19\.3\.0/);
  assert.doesNotMatch(output, /## Warnings/);
  assert.doesNotMatch(output, /## Notes/);
  assert.doesNotMatch(output, /Stripped integrity entries/);
});

test("sorted rows dedupe by name+specifier+newSpecifier", () => {
  const rewrite = {
    lookupFailures: [],
    notes: [],
    noChanges: false,
    rewrites: [
      {
        currentVersion: "19.2.3",
        latestVersion: "19.3.0",
        newSpecifier: "19.3.0",
        newUrl: "https://esm.sh/react-dom@19.3.0/client",
        oldSpecifier: "",
        oldUrl: "https://esm.sh/react-dom@19.2.3/client",
        packageName: "react-dom",
      },
      {
        currentVersion: "19.2.3",
        latestVersion: "19.3.0",
        newSpecifier: "19.3.0",
        newUrl: "https://esm.sh/react@19.3.0",
        oldSpecifier: "",
        oldUrl: "https://esm.sh/react@19.2.3",
        packageName: "react",
      },
      {
        // Duplicate row (same package + same before/after) — should collapse.
        currentVersion: "19.2.3",
        latestVersion: "19.3.0",
        newSpecifier: "19.3.0",
        newUrl: "https://esm.sh/react-dom@19.3.0",
        oldSpecifier: "",
        oldUrl: "https://esm.sh/react-dom@19.2.3",
        packageName: "react-dom",
      },
    ],
    strippedIntegrityEntries: [],
    targetPath: "/tmp/target.html",
    warnings: [],
  };
  const report = emptyReport();

  const output = formatUpdateSummary(rewrite, report, { colorEnabled: false });

  const reactMatches = output.match(/react {2}19\.2\.3 → 19\.3\.0/g);
  const reactDomMatches = output.match(/react-dom {2}19\.2\.3 → 19\.3\.0/g);
  assert.equal(reactMatches.length, 1);
  assert.equal(reactDomMatches.length, 1);
  // Sorted alphabetically: react before react-dom.
  const reactIndex = output.indexOf("react ");
  const reactDomIndex = output.indexOf("react-dom ");
  assert.ok(
    reactIndex < reactDomIndex && reactIndex !== -1 && reactDomIndex !== -1,
    "react should appear before react-dom",
  );
});

test("stripped-integrity subsection renders per-URL rows", () => {
  const rewrite = {
    lookupFailures: [],
    notes: [],
    noChanges: false,
    rewrites: [
      {
        currentVersion: "19.2.3",
        latestVersion: "19.3.0",
        newSpecifier: "19.3.0",
        newUrl: "https://esm.sh/react@19.3.0",
        oldSpecifier: "",
        oldUrl: "https://esm.sh/react@19.2.3",
        packageName: "react",
      },
    ],
    strippedIntegrityEntries: [
      {
        message: "Stripped integrity entry for https://esm.sh/react@19.2.3.",
        packageName: "react",
        url: "https://esm.sh/react@19.2.3",
      },
    ],
    targetPath: "/tmp/target.html",
    warnings: [],
  };
  const report = emptyReport();

  const output = formatUpdateSummary(rewrite, report, { colorEnabled: false });

  assert.match(output, /## Stripped integrity entries/);
  assert.match(
    output,
    /- https:\/\/esm\.sh\/react@19\.2\.3 \(triggered by react\)/,
  );
});

test("rewrite with existing analyzer note surfaces note section", () => {
  const rewrite = {
    lookupFailures: [],
    notes: [{ message: "react has integrity metadata worth reviewing." }],
    noChanges: false,
    rewrites: [
      {
        currentVersion: "19.2.3",
        latestVersion: "19.3.0",
        newSpecifier: "19.3.0",
        newUrl: "https://esm.sh/react@19.3.0",
        oldSpecifier: "",
        oldUrl: "https://esm.sh/react@19.2.3",
        packageName: "react",
      },
    ],
    strippedIntegrityEntries: [],
    targetPath: "/tmp/target.html",
    warnings: [],
  };
  const report = { ...emptyReport(), notes: rewrite.notes };

  const output = formatUpdateSummary(rewrite, report, { colorEnabled: false });

  assert.match(output, /## Notes/);
  assert.match(output, /react has integrity metadata worth reviewing\./);
});

test("rewrite with analyzer warning surfaces warnings section", () => {
  const rewrite = {
    lookupFailures: [],
    notes: [],
    noChanges: false,
    rewrites: [
      {
        currentVersion: "19.2.3",
        latestVersion: "19.3.0",
        newSpecifier: "19.3.0",
        newUrl: "https://esm.sh/react@19.3.0",
        oldSpecifier: "",
        oldUrl: "https://esm.sh/react@19.2.3",
        packageName: "react",
      },
    ],
    strippedIntegrityEntries: [],
    targetPath: "/tmp/target.html",
    warnings: [
      {
        type: "destination-skew",
        message: "react resolves through different CDN providers.",
      },
    ],
  };
  const report = { ...emptyReport(), warnings: rewrite.warnings };

  const output = formatUpdateSummary(rewrite, report, { colorEnabled: false });

  assert.match(output, /## Warnings/);
  assert.match(output, /- react resolves through different CDN providers\./);
});
