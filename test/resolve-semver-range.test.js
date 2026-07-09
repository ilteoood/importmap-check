import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveSemverRange } from "../src/index.js";

// Synthetic npm registry body used to exercise resolveSemverRange without
// hitting the network. The `versions` map lists stable releases (no
// prereleases, which listStableVersions excludes).
const buildRegistryBody = (versions) => {
  const versionMap = Object.fromEntries(
    versions.map((version) => [version, {}]),
  );

  return { versions: versionMap };
};

test("^1.2.3 resolves to highest 1.x", () => {
  const body = buildRegistryBody(["1.2.3", "1.3.0", "1.9.5", "2.0.0"]);

  assert.equal(resolveSemverRange("pkg", "^1.2.3", body), "1.9.5");
});

test("^0.2.3 resolves to highest 0.2.x (not highest 0.x)", () => {
  const body = buildRegistryBody(["0.2.3", "0.2.9", "0.3.0", "1.0.0"]);

  assert.equal(resolveSemverRange("pkg", "^0.2.3", body), "0.2.9");
});

test("^0.0.3 resolves to 0.0.3 when only 0.0.3 exists", () => {
  const body = buildRegistryBody(["0.0.3", "0.1.0", "1.0.0"]);

  // ^0.0.3 := >=0.0.3 <0.0.4 — only 0.0.3 itself satisfies.
  assert.equal(resolveSemverRange("pkg", "^0.0.3", body), "0.0.3");
});

test("^0.0.3 does not admit 0.0.5 (patch-locked window)", () => {
  const body = buildRegistryBody(["0.0.3", "0.0.5", "0.1.0"]);

  // The half-open window is <0.0.4, so 0.0.5 is outside — the only stable
  // version in the window is 0.0.3.
  assert.equal(resolveSemverRange("pkg", "^0.0.3", body), "0.0.3");
});

test("~1.2.3 resolves to highest 1.2.x", () => {
  const body = buildRegistryBody(["1.2.3", "1.2.9", "1.3.0", "2.0.0"]);

  assert.equal(resolveSemverRange("pkg", "~1.2.3", body), "1.2.9");
});

test("~0.2.3 resolves to highest 0.2.x", () => {
  const body = buildRegistryBody(["0.2.3", "0.2.9", "0.3.0", "1.0.0"]);

  assert.equal(resolveSemverRange("pkg", "~0.2.3", body), "0.2.9");
});

test("~0.0.3 stays patch-locked per npm quirk", () => {
  const body = buildRegistryBody(["0.0.3", "0.0.5", "0.1.0"]);

  // ~0.0.z := >=0.0.z <0.0.(z+1) — only 0.0.3 satisfies.
  assert.equal(resolveSemverRange("pkg", "~0.0.3", body), "0.0.3");
});

test("~1.2 (no patch) resolves to highest 1.2.x", () => {
  const body = buildRegistryBody(["1.2.0", "1.2.9", "1.3.0"]);

  assert.equal(resolveSemverRange("pkg", "~1.2", body), "1.2.9");
});

test("~1 (no minor) resolves to highest 1.x", () => {
  const body = buildRegistryBody(["1.0.0", "1.2.3", "1.9.9", "2.0.0"]);

  assert.equal(resolveSemverRange("pkg", "~1", body), "1.9.9");
});

test("^0 (major-only zero) resolves to highest 0.x", () => {
  const body = buildRegistryBody(["0.1.0", "0.9.9", "1.0.0"]);

  assert.equal(resolveSemverRange("pkg", "^0", body), "0.9.9");
});

test("^0.0 (no patch) resolves to highest 0.0.x", () => {
  const body = buildRegistryBody(["0.0.1", "0.0.9", "0.1.0"]);

  assert.equal(resolveSemverRange("pkg", "^0.0", body), "0.0.9");
});
