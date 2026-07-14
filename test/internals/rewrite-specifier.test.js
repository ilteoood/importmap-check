import { test } from "node:test";
import assert from "node:assert/strict";

import { rewriteSpecifier } from "../../src/index.js";

test("pinned bumps concrete version", () => {
  assert.equal(rewriteSpecifier("", "19.3.0"), "19.3.0");
});

test("caret major>0 lifts to new major", () => {
  assert.equal(rewriteSpecifier("^19.2.3", "20.0.0"), "^20.0.0");
});

test("caret 0.x lifts within-0-major when latest crosses minor", () => {
  assert.equal(rewriteSpecifier("^0.1.0", "0.2.5"), "^0.2.0");
});

test("caret 0.x falls through to new major", () => {
  assert.equal(rewriteSpecifier("^0.1.0", "1.0.0"), "^1.0.0");
});

test("caret 0.0.x stays patch-locked within 0.0.x", () => {
  assert.equal(rewriteSpecifier("^0.0.3", "0.0.5"), "^0.0.5");
});

test("caret 0.0.x promotes to minor-locked when latest crosses to 0.1.x", () => {
  assert.equal(rewriteSpecifier("^0.0.3", "0.1.0"), "^0.1.0");
});

test("caret 0.0.x falls through to major-locked when latest crosses to 1.0.0", () => {
  assert.equal(rewriteSpecifier("^0.0.3", "1.0.0"), "^1.0.0");
});

test("tilde within-major cross-minor lift (~19.2.3 with latest 19.3.0)", () => {
  // Cross-minor tilde case: tilde locks minor, so ~19.2.3 with latest 19.3.0
  // rewrites within-major to ~19.3.0.
  assert.equal(rewriteSpecifier("~19.2.3", "19.3.0"), "~19.3.0");
});

test("tilde cross-major lift (~19.2.3 with latest 20.0.0)", () => {
  assert.equal(rewriteSpecifier("~19.2.3", "20.0.0"), "~20.0.0");
});

test("tilde 0.x lifts within-0-major when latest crosses minor", () => {
  assert.equal(rewriteSpecifier("~0.2.3", "0.3.0"), "~0.3.0");
});

test("tilde 0.x falls through to new major", () => {
  assert.equal(rewriteSpecifier("~0.2.3", "1.0.0"), "~1.0.0");
});

test("tilde 0.0.x stays patch-locked within 0.0.x (npm quirk)", () => {
  assert.equal(rewriteSpecifier("~0.0.3", "0.0.5"), "~0.0.5");
});

test("tilde 0.0.x promotes to minor-locked when latest crosses to 0.1.x", () => {
  assert.equal(rewriteSpecifier("~0.0.3", "0.1.0"), "~0.1.0");
});

test("tilde 0.0.x falls through to major-locked when latest crosses to 1.0.0", () => {
  assert.equal(rewriteSpecifier("~0.0.3", "1.0.0"), "~1.0.0");
});

test("major-only selector moves to new major", () => {
  assert.equal(rewriteSpecifier("18", "19.3.0"), "19");
});

test("minor-only selector moves to new major.minor", () => {
  assert.equal(rewriteSpecifier("18.3", "19.3.0"), "19.3");
});

test("dist-tag returns null (no rewrite)", () => {
  assert.equal(rewriteSpecifier("beta", "19.4.0-beta.1"), null);
  assert.equal(rewriteSpecifier("latest", "19.3.0"), null);
  assert.equal(rewriteSpecifier("next", "19.4.0"), null);
});

test("no latestVersion returns null", () => {
  assert.equal(rewriteSpecifier("^19.2.3", null), null);
  assert.equal(rewriteSpecifier("^19.2.3", ""), null);
});
