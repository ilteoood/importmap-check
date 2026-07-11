import { test } from "node:test";
import assert from "node:assert/strict";

import { renderUnifiedDiff } from "../src/unified-diff.js";

const opts = { colorEnabled: false };
const ESC = String.fromCharCode(27);

test("identical content produces an empty diff", () => {
  const content = "a\nb\nc\n";

  assert.equal(renderUnifiedDiff(content, content, "f.txt", opts), "");
});

test("single-line change renders with surrounding context and correct header", () => {
  const original = "l1\nl2\nl3\nl4\nl5\nl6\nl7\n";
  const updated = "l1\nl2\nl3\nX\nl5\nl6\nl7\n";

  const output = renderUnifiedDiff(original, updated, "f.txt", opts);

  assert.equal(
    output,
    [
      "--- f.txt",
      "+++ f.txt",
      "@@ -1,7 +1,7 @@",
      " l1",
      " l2",
      " l3",
      "-l4",
      "+X",
      " l5",
      " l6",
      " l7",
    ].join("\n"),
  );
});

test("pure addition renders inserted lines with a widened new count", () => {
  const output = renderUnifiedDiff("a\nb\n", "a\nNEW\nb\n", "f.txt", opts);

  assert.equal(
    output,
    ["--- f.txt", "+++ f.txt", "@@ -1,2 +1,3 @@", " a", "+NEW", " b"].join(
      "\n",
    ),
  );
});

test("pure deletion renders removed lines with a narrowed new count", () => {
  const output = renderUnifiedDiff("a\nGONE\nb\n", "a\nb\n", "f.txt", opts);

  assert.equal(
    output,
    ["--- f.txt", "+++ f.txt", "@@ -1,3 +1,2 @@", " a", "-GONE", " b"].join(
      "\n",
    ),
  );
});

test("changes far apart render as separate hunks with correct line numbers", () => {
  const lines = Array.from({ length: 12 }, (_, i) => `l${i + 1}`);
  const original = `${lines.join("\n")}\n`;
  const changed = [...lines];
  changed[1] = "X"; // line 2
  changed[10] = "Y"; // line 11
  const updated = `${changed.join("\n")}\n`;

  const output = renderUnifiedDiff(original, updated, "f.txt", opts);
  const hunkHeaders = output
    .split("\n")
    .filter((line) => line.startsWith("@@"));

  assert.deepEqual(hunkHeaders, ["@@ -1,5 +1,5 @@", "@@ -8,5 +8,5 @@"]);
  assert.match(output, /-l2\n\+X/);
  assert.match(output, /-l11\n\+Y/);
});

test("nearby changes coalesce into a single hunk", () => {
  const lines = Array.from({ length: 10 }, (_, i) => `l${i + 1}`);
  const original = `${lines.join("\n")}\n`;
  const changed = [...lines];
  changed[2] = "X"; // line 3
  changed[4] = "Y"; // line 5
  const updated = `${changed.join("\n")}\n`;

  const output = renderUnifiedDiff(original, updated, "f.txt", opts);
  const hunkHeaders = output
    .split("\n")
    .filter((line) => line.startsWith("@@"));

  assert.equal(hunkHeaders.length, 1);
});

test("color enabled wraps -, +, and @@ lines in the expected escapes", () => {
  const output = renderUnifiedDiff("a\nb\n", "a\nX\n", "f.txt", {
    colorEnabled: true,
  });

  assert.ok(output.includes(`${ESC}[31m--- f.txt${ESC}[0m`));
  assert.ok(output.includes(`${ESC}[32m+++ f.txt${ESC}[0m`));
  assert.ok(output.includes(`${ESC}[31m-b${ESC}[0m`));
  assert.ok(output.includes(`${ESC}[32m+X${ESC}[0m`));
  assert.ok(output.includes(`${ESC}[36m@@`));
});

test("color disabled emits no escape sequences", () => {
  const output = renderUnifiedDiff("a\nb\n", "a\nX\n", "f.txt", opts);

  assert.ok(!output.includes(ESC));
});
