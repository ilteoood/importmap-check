import { test } from "node:test";
import assert from "node:assert/strict";

import { formatDryRunSummary } from "../src/report.js";

const emptyReport = () => ({
  lookupFailures: [],
  notes: [],
  packageResults: [],
  targetPath: "/tmp/target.json",
  warnings: [],
});

const noChangePlan = (overrides = {}) => ({
  lookupFailures: [],
  notes: [],
  noChanges: true,
  originalContent: null,
  rewrites: [],
  strippedIntegrityEntries: [],
  targetPath: "/tmp/target.json",
  updatedContent: null,
  warnings: [],
  ...overrides,
});

test("no changes prints the exact literal when nothing else to show", () => {
  const output = formatDryRunSummary(noChangePlan(), emptyReport(), {
    colorEnabled: false,
  });

  assert.equal(output, "No changes would be written.");
});

test("no changes still surfaces analyzer notes and warnings", () => {
  const notes = [
    { message: "react appears as `@beta` — dist-tag entries float." },
  ];
  const warnings = [
    { type: "unsupported-scopes", message: "target contains `scopes`." },
  ];
  const plan = noChangePlan({ notes, warnings });
  const report = { ...emptyReport(), notes, warnings };

  const output = formatDryRunSummary(plan, report, { colorEnabled: false });

  assert.match(output, /^No changes would be written\.\n/);
  assert.match(output, /\n\n## Warnings\n- target contains `scopes`\./);
  assert.match(
    output,
    /\n\n## Notes\n- react appears as `@beta` — dist-tag entries float\./,
  );
  assert.doesNotMatch(output, /^--- /m);
});

test("changes render banner, unified diff, and no extra sections", () => {
  const plan = {
    lookupFailures: [],
    notes: [],
    noChanges: false,
    originalContent:
      '{\n  "imports": {\n    "react": "https://esm.sh/react@19.2.3"\n  }\n}\n',
    rewrites: [],
    strippedIntegrityEntries: [],
    targetPath: "/tmp/target.json",
    updatedContent:
      '{\n  "imports": {\n    "react": "https://esm.sh/react@19.3.0"\n  }\n}\n',
    warnings: [],
  };

  const output = formatDryRunSummary(plan, emptyReport(), {
    colorEnabled: false,
  });

  assert.match(output, /^Dry run — no files written\.\n\n/);
  assert.match(output, /^--- \/tmp\/target\.json$/m);
  assert.match(output, /^\+\+\+ \/tmp\/target\.json$/m);
  assert.match(output, /^- {4}"react": "https:\/\/esm\.sh\/react@19\.2\.3"$/m);
  assert.match(output, /^\+ {4}"react": "https:\/\/esm\.sh\/react@19\.3\.0"$/m);
  assert.doesNotMatch(output, /## Warnings/);
  assert.doesNotMatch(output, /## Notes/);
  assert.doesNotMatch(output, /Stripped integrity entries/);
});

test("changes surface the stripped-integrity subsection alongside the diff", () => {
  const plan = {
    lookupFailures: [],
    notes: [],
    noChanges: false,
    originalContent: '{\n  "react": "https://esm.sh/react@19.2.3"\n}\n',
    rewrites: [],
    strippedIntegrityEntries: [
      {
        message: "Stripped integrity entry for https://esm.sh/react@19.2.3.",
        packageName: "react",
        url: "https://esm.sh/react@19.2.3",
      },
    ],
    targetPath: "/tmp/target.json",
    updatedContent: '{\n  "react": "https://esm.sh/react@19.3.0"\n}\n',
    warnings: [
      {
        type: "integrity-strip",
        message: "Stripped integrity entry for https://esm.sh/react@19.2.3.",
      },
    ],
  };
  const report = { ...emptyReport(), warnings: plan.warnings };

  const output = formatDryRunSummary(plan, report, { colorEnabled: false });

  assert.match(output, /^Dry run — no files written\./);
  assert.match(output, /## Stripped integrity entries/);
  assert.match(
    output,
    /- https:\/\/esm\.sh\/react@19\.2\.3 \(triggered by react\)/,
  );
  // The integrity-strip warning must not double-list in the top-level Warnings.
  assert.doesNotMatch(output, /## Warnings/);
});
