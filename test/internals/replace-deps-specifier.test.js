import { test } from "node:test";
import assert from "node:assert/strict";

import { replaceDepsSpecifier } from "../../src/index.js";

test("splices a pinned dependency version in place", () => {
  assert.equal(
    replaceDepsSpecifier(
      "https://esm.sh/app@1.0.0?deps=react@18.2.0",
      "react",
      "19.3.0",
    ),
    "https://esm.sh/app@1.0.0?deps=react@19.3.0",
  );
});

test("preserves a range prefix when splicing a dependency", () => {
  assert.equal(
    replaceDepsSpecifier(
      "https://esm.sh/app@1.0.0?deps=scheduler@^0.23.0",
      "scheduler",
      "^0.24.0",
    ),
    "https://esm.sh/app@1.0.0?deps=scheduler@^0.24.0",
  );
});

test("preserves a tilde prefix when splicing a dependency", () => {
  assert.equal(
    replaceDepsSpecifier(
      "https://esm.sh/app@1.0.0?deps=react@~19.2.3",
      "react",
      "~19.3.0",
    ),
    "https://esm.sh/app@1.0.0?deps=react@~19.3.0",
  );
});

test("splices a major-only selector dependency", () => {
  assert.equal(
    replaceDepsSpecifier(
      "https://esm.sh/app@1.0.0?deps=react@18",
      "react",
      "19",
    ),
    "https://esm.sh/app@1.0.0?deps=react@19",
  );
});

test("splices a minor-only selector dependency", () => {
  assert.equal(
    replaceDepsSpecifier(
      "https://esm.sh/app@1.0.0?deps=react@18.3",
      "react",
      "19.3",
    ),
    "https://esm.sh/app@1.0.0?deps=react@19.3",
  );
});

test("rewrites only the version token of a scoped dependency", () => {
  assert.equal(
    replaceDepsSpecifier(
      "https://esm.sh/app@1.0.0?deps=@scope/pkg@1.2.3",
      "@scope/pkg",
      "2.0.0",
    ),
    "https://esm.sh/app@1.0.0?deps=@scope/pkg@2.0.0",
  );
});

test("preserves dependency order and comma separators", () => {
  assert.equal(
    replaceDepsSpecifier(
      "https://esm.sh/app@1.0.0?deps=react@18.2.0,scheduler@0.23.0",
      "react",
      "19.3.0",
    ),
    "https://esm.sh/app@1.0.0?deps=react@19.3.0,scheduler@0.23.0",
  );
});

test("preserves percent-encoding style of the original token", () => {
  assert.equal(
    replaceDepsSpecifier(
      "https://esm.sh/app@1.0.0?deps=scheduler@%5E0.23.0",
      "scheduler",
      "^0.24.0",
    ),
    "https://esm.sh/app@1.0.0?deps=scheduler@%5E0.24.0",
  );
});

test("leaves non-deps query parameters untouched", () => {
  assert.equal(
    replaceDepsSpecifier(
      "https://esm.sh/app@1.0.0?deps=react@18.2.0&target=es2022",
      "react",
      "19.3.0",
    ),
    "https://esm.sh/app@1.0.0?deps=react@19.3.0&target=es2022",
  );
});

test("returns the URL unchanged when the package is not a dependency", () => {
  const url = "https://esm.sh/app@1.0.0?deps=react@18.2.0";
  assert.equal(replaceDepsSpecifier(url, "vue", "3.0.0"), url);
});

test("returns the URL unchanged when there is no query string", () => {
  const url = "https://esm.sh/app@1.0.0";
  assert.equal(replaceDepsSpecifier(url, "react", "19.3.0"), url);
});

test("is a no-op when the new specifier equals the current one", () => {
  const url = "https://esm.sh/app@1.0.0?deps=react@19.3.0";
  assert.equal(replaceDepsSpecifier(url, "react", "19.3.0"), url);
});
