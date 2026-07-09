import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import assert from "node:assert/strict";

import { createFixtureRegistry, runCli } from "./cli-helpers.js";

const { cleanup, copyFixture, createFixtureDir } = createFixtureRegistry();

after(cleanup);

test("--update rewrites pinned entries and prints the post-rewrite summary", async () => {
  const targetPath = await copyFixture("update-pinned.html");
  const original = await readFile(targetPath, "utf8");
  const result = await runCli(["--update", targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, new RegExp(`^Updated ${targetPath}:`));
  assert.match(result.stdout, /react {2}19\.2\.3 → 19\.3\.0/);
  assert.match(result.stdout, /react-dom {2}19\.2\.3 → 19\.3\.0/);

  const rewritten = await readFile(targetPath, "utf8");
  assert.notEqual(rewritten, original);
  assert.match(rewritten, /"react": "https:\/\/esm\.sh\/react@19\.3\.0"/);
  assert.match(
    rewritten,
    /"react-dom\/client": "https:\/\/esm\.sh\/react-dom@19\.3\.0\/client"/,
  );
});

test("-u short form matches --update long form", async () => {
  const targetPath = await copyFixture("update-pinned.html");
  const result = await runCli(["-u", targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, new RegExp(`^Updated ${targetPath}:`));
  const rewritten = await readFile(targetPath, "utf8");
  assert.match(rewritten, /"react": "https:\/\/esm\.sh\/react@19\.3\.0"/);
});

test("--update on ranges lifts caret/tilde floors per the design matrix", async () => {
  const targetPath = await copyFixture("update-ranges.html");
  const result = await runCli(["--update", targetPath], {
    NO_COLOR: "1",
    ECU_TEST_LATEST_VERSIONS: JSON.stringify({
      react: "20.0.0",
      "react-dom": "19.3.0",
      swr: "3.0.0",
    }),
    ECU_TEST_SPECIFIER_VERSIONS: JSON.stringify({
      "react@^19.2.3": "19.2.9",
      "react-dom@~19.2.3": "19.2.9",
      "swr@^2.0.0": "2.9.9",
    }),
  });

  assert.equal(result.code, 0);
  // Cross-major caret: ^19.2.3 with latest 20.0.0 → ^20.0.0
  assert.match(result.stdout, /react \^19\.2\.3 {2}\^19\.2\.3 → \^20\.0\.0/);
  // Cross-minor tilde within same major: ~19.2.3 with latest 19.3.0 → ~19.3.0
  assert.match(result.stdout, /react-dom ~19\.2\.3 {2}~19\.2\.3 → ~19\.3\.0/);
  // Cross-major caret for swr
  assert.match(result.stdout, /swr \^2\.0\.0 {2}\^2\.0\.0 → \^3\.0\.0/);

  const rewritten = await readFile(targetPath, "utf8");
  assert.match(rewritten, /esm\.sh\/react@\^20\.0\.0/);
  assert.match(rewritten, /esm\.sh\/react-dom@~19\.3\.0/);
  assert.match(rewritten, /esm\.sh\/react-dom@~19\.3\.0\/client/);
  assert.match(rewritten, /esm\.sh\/swr@\^3\.0\.0/);
});

test("--update on 0.0.x ranges follows the patch-locked semantics", async () => {
  const targetPath = await copyFixture("update-ranges-0.0.x.html");
  const result = await runCli(["--update", targetPath], {
    NO_COLOR: "1",
    ECU_TEST_LATEST_VERSIONS: JSON.stringify({
      "lib-a": "0.3.0",
      "lib-b": "0.3.0",
      "lib-c": "0.0.5",
      "lib-d": "0.0.5",
    }),
    ECU_TEST_SPECIFIER_VERSIONS: JSON.stringify({
      "lib-a@^0.2.3": "0.2.9",
      "lib-b@~0.2.3": "0.2.9",
      "lib-c@^0.0.3": "0.0.3",
      "lib-d@~0.0.3": "0.0.3",
    }),
  });

  assert.equal(result.code, 0);
  // ^0.2.3 with latest 0.3.0 → ^0.3.0 (cross-minor within 0.x)
  assert.match(result.stdout, /lib-a \^0\.2\.3 {2}\^0\.2\.3 → \^0\.3\.0/);
  // ~0.2.3 with latest 0.3.0 → ~0.3.0
  assert.match(result.stdout, /lib-b ~0\.2\.3 {2}~0\.2\.3 → ~0\.3\.0/);
  // ^0.0.3 with latest 0.0.5 → ^0.0.5 (within-0.0.x lift)
  assert.match(result.stdout, /lib-c \^0\.0\.3 {2}\^0\.0\.3 → \^0\.0\.5/);
  // ~0.0.3 with latest 0.0.5 → ~0.0.5 (npm quirk)
  assert.match(result.stdout, /lib-d ~0\.0\.3 {2}~0\.0\.3 → ~0\.0\.5/);

  const rewritten = await readFile(targetPath, "utf8");
  assert.match(rewritten, /lib-a@\^0\.3\.0/);
  assert.match(rewritten, /lib-b@~0\.3\.0/);
  assert.match(rewritten, /lib-c@\^0\.0\.5/);
  assert.match(rewritten, /lib-d@~0\.0\.5/);
});

test("--update on 0.0.x promotes to minor-locked when latest crosses to 0.1.x", async () => {
  const targetPath = await copyFixture("update-ranges-0.0.x.html");
  const result = await runCli(["--update", targetPath], {
    NO_COLOR: "1",
    ECU_TEST_LATEST_VERSIONS: JSON.stringify({
      "lib-a": "0.3.0",
      "lib-b": "0.3.0",
      "lib-c": "0.1.0",
      "lib-d": "0.1.0",
    }),
    ECU_TEST_SPECIFIER_VERSIONS: JSON.stringify({
      "lib-a@^0.2.3": "0.2.9",
      "lib-b@~0.2.3": "0.2.9",
      "lib-c@^0.0.3": "0.0.3",
      "lib-d@~0.0.3": "0.0.3",
    }),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /lib-c \^0\.0\.3 {2}\^0\.0\.3 → \^0\.1\.0/);
  assert.match(result.stdout, /lib-d ~0\.0\.3 {2}~0\.0\.3 → ~0\.1\.0/);
});

test("--update on 0.0.x falls through to major-locked when latest crosses to 1.0.0", async () => {
  const targetPath = await copyFixture("update-ranges-0.0.x.html");
  const result = await runCli(["--update", targetPath], {
    NO_COLOR: "1",
    ECU_TEST_LATEST_VERSIONS: JSON.stringify({
      "lib-a": "1.0.0",
      "lib-b": "1.0.0",
      "lib-c": "1.0.0",
      "lib-d": "1.0.0",
    }),
    ECU_TEST_SPECIFIER_VERSIONS: JSON.stringify({
      "lib-a@^0.2.3": "0.2.9",
      "lib-b@~0.2.3": "0.2.9",
      "lib-c@^0.0.3": "0.0.3",
      "lib-d@~0.0.3": "0.0.3",
    }),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /lib-a \^0\.2\.3 {2}\^0\.2\.3 → \^1\.0\.0/);
  assert.match(result.stdout, /lib-b ~0\.2\.3 {2}~0\.2\.3 → ~1\.0\.0/);
  assert.match(result.stdout, /lib-c \^0\.0\.3 {2}\^0\.0\.3 → \^1\.0\.0/);
  assert.match(result.stdout, /lib-d ~0\.0\.3 {2}~0\.0\.3 → ~1\.0\.0/);
});

test("--update rewrites major-only and minor-only selectors", async () => {
  const targetPath = await copyFixture("update-selectors.html");
  const result = await runCli(["--update", targetPath], {
    NO_COLOR: "1",
    ECU_TEST_LATEST_VERSIONS: JSON.stringify({
      react: "19.3.0",
      "react-dom": "19.3.0",
    }),
    ECU_TEST_SPECIFIER_VERSIONS: JSON.stringify({
      "react@18": "18.3.1",
      "react-dom@18.3": "18.3.1",
    }),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /react 18 {2}18 → 19/);
  assert.match(result.stdout, /react-dom 18\.3 {2}18\.3 → 19\.3/);

  const rewritten = await readFile(targetPath, "utf8");
  assert.match(rewritten, /"react": "https:\/\/esm\.sh\/react@19"/);
  assert.match(
    rewritten,
    /"react-dom\/client": "https:\/\/esm\.sh\/react-dom@19\.3\/client"/,
  );
});

test("--update does not rewrite dist-tag entries and leaves the file unchanged", async () => {
  const targetPath = await copyFixture("update-dist-tags.html");
  const original = await readFile(targetPath, "utf8");
  const result = await runCli(["--update", targetPath], {
    NO_COLOR: "1",
    ECU_TEST_LATEST_VERSIONS: JSON.stringify({
      react: "19.3.0",
      "react-dom": "19.3.0",
    }),
    ECU_TEST_SPECIFIER_VERSIONS: JSON.stringify({
      "react@beta": "19.4.0-beta.1",
      "react-dom@latest": "19.3.0",
    }),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /No changes to write\./);
  const after = await readFile(targetPath, "utf8");
  assert.equal(after, original);
});

test("--update strips integrity entries for rewritten URLs and preserves unrewritten ones", async () => {
  const targetPath = await copyFixture("update-integrity.html");
  const result = await runCli(["--update", targetPath], {
    NO_COLOR: "1",
    ECU_TEST_LATEST_VERSIONS: JSON.stringify({
      react: "19.3.0",
      "react-dom": "19.3.0",
      untouched: "1.0.0",
    }),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /## Stripped integrity entries/);
  assert.match(
    result.stdout,
    /- https:\/\/esm\.sh\/react@19\.2\.3 \(triggered by react\)/,
  );
  assert.match(
    result.stdout,
    /- https:\/\/esm\.sh\/react-dom@19\.2\.3\/client \(triggered by react-dom\)/,
  );

  const rewritten = await readFile(targetPath, "utf8");
  // Stripped keys are gone.
  assert.doesNotMatch(rewritten, /https:\/\/esm\.sh\/react@19\.2\.3": "sha384/);
  assert.doesNotMatch(
    rewritten,
    /https:\/\/esm\.sh\/react-dom@19\.2\.3\/client": "sha384/,
  );
  // Untouched key remains.
  assert.match(
    rewritten,
    /"https:\/\/esm\.sh\/untouched@1\.0\.0": "sha384-keep"/,
  );
});

test("--update with no integrity section produces no stripped-integrity subsection", async () => {
  const targetPath = await copyFixture("update-pinned.html");
  const result = await runCli(["--update", targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.doesNotMatch(result.stdout, /Stripped integrity entries/);
});

test("--update rewrites destination-skewed occurrences independently and preserves skew warning", async () => {
  const targetPath = await copyFixture("update-destination-skew.html");
  const result = await runCli(["--update", targetPath], {
    NO_COLOR: "1",
    ECU_TEST_LATEST_VERSIONS: JSON.stringify({
      react: "19.3.0",
      "react-dom": "19.3.0",
    }),
  });

  assert.equal(result.code, 0);
  assert.match(
    result.stdout,
    /react resolves through different CDN providers or pinned versions/,
  );
  const rewritten = await readFile(targetPath, "utf8");
  // Both CDN occurrences of react are rewritten.
  assert.match(rewritten, /esm\.sh\/react@19\.3\.0/);
  assert.match(rewritten, /cdn\.jsdelivr\.net\/npm\/react@19\.3\.0\/\+esm/);
});

test("--update on a no-op fixture prints No changes to write and leaves the file unchanged", async () => {
  const targetPath = await copyFixture("update-noop.html");
  const original = await readFile(targetPath, "utf8");
  const result = await runCli(["--update", targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^No changes to write\.\s*$/);
  const after = await readFile(targetPath, "utf8");
  assert.equal(after, original);
});

test("--update is idempotent — second invocation is a no-op", async () => {
  const targetPath = await copyFixture("update-ranges.html");
  const firstEnv = {
    NO_COLOR: "1",
    ECU_TEST_LATEST_VERSIONS: JSON.stringify({
      react: "20.0.0",
      "react-dom": "19.3.0",
      swr: "3.0.0",
    }),
    ECU_TEST_SPECIFIER_VERSIONS: JSON.stringify({
      "react@^19.2.3": "19.2.9",
      "react-dom@~19.2.3": "19.2.9",
      "swr@^2.0.0": "2.9.9",
    }),
  };

  const first = await runCli(["--update", targetPath], firstEnv);
  assert.equal(first.code, 0);
  assert.match(first.stdout, /→/);

  // Second invocation with matching overrides: the newly written ranges must
  // resolve to the same latest, so no further rewrite occurs. Cross-minor
  // tilde case: ~19.3.0 must stabilize.
  const secondEnv = {
    NO_COLOR: "1",
    ECU_TEST_LATEST_VERSIONS: JSON.stringify({
      react: "20.0.0",
      "react-dom": "19.3.0",
      swr: "3.0.0",
    }),
    ECU_TEST_SPECIFIER_VERSIONS: JSON.stringify({
      "react@^20.0.0": "20.0.0",
      "react-dom@~19.3.0": "19.3.0",
      "swr@^3.0.0": "3.0.0",
    }),
  };
  const second = await runCli(["--update", targetPath], secondEnv);
  assert.equal(second.code, 0);
  assert.match(second.stdout, /^No changes to write\./);
});

test("--update --sources combines the update path with the sources rendering", async () => {
  const targetPath = await copyFixture("update-pinned.html");
  const result = await runCli(["--update", "--sources", targetPath], {
    NO_COLOR: "1",
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^Updated /);
  assert.match(result.stdout, /react {2}19\.2\.3 → 19\.3\.0/);
});

test("--update rewrites a standalone JSON import map preserving formatting", async () => {
  const targetPath = await copyFixture("update-pinned.json");
  const original = await readFile(targetPath, "utf8");
  const result = await runCli(["--update", targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, new RegExp(`^Updated ${targetPath}:`));

  const rewritten = await readFile(targetPath, "utf8");
  assert.notEqual(rewritten, original);
  assert.match(rewritten, /"react": "https:\/\/esm\.sh\/react@19\.3\.0"/);
  assert.match(
    rewritten,
    /"react-dom\/client": "https:\/\/esm\.sh\/react-dom@19\.3\.0\/client"/,
  );
  // Preserve original indentation (two spaces).
  const originalIndent = original.match(/\n( +)"react"/)[1];
  const rewrittenIndent = rewritten.match(/\n( +)"react"/)[1];
  assert.equal(rewrittenIndent, originalIndent);
});

test("--update does not rewrite URL substrings outside their import map value", async () => {
  const fixtureDir = await createFixtureDir();
  const targetPath = path.join(fixtureDir, "index.html");
  // The comment carries the same URL string as the import map value. Only the
  // import map value should be rewritten; the comment must be left untouched.
  await writeFile(
    targetPath,
    [
      "<!doctype html>",
      "<html><body>",
      "<!-- Reference: https://esm.sh/react@19.2.3 (do not edit here) -->",
      '<script type="importmap">',
      JSON.stringify(
        {
          imports: {
            react: "https://esm.sh/react@19.2.3",
          },
        },
        null,
        2,
      ),
      "</script>",
      "</body></html>",
    ].join("\n"),
  );

  const result = await runCli(["--update", targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  const rewritten = await readFile(targetPath, "utf8");
  // The value inside quotes IS rewritten (whole-value boundary).
  assert.match(rewritten, /"react": "https:\/\/esm\.sh\/react@19\.3\.0"/);
  // The bare comment URL is also rewritten because the current implementation
  // performs quoted-value substitution; document actual behavior — the
  // rewriter targets only quoted substrings.
  assert.match(
    rewritten,
    /<!-- Reference: https:\/\/esm\.sh\/react@19\.2\.3 \(do not edit here\) -->/,
  );
});

test("--update does not collide across substring URLs of different length", async () => {
  const fixtureDir = await createFixtureDir();
  const targetPath = path.join(fixtureDir, "index.html");
  // Two entries where one URL is a proper substring of the other's version
  // token. The rewriter must not accidentally rewrite the longer URL when
  // targeting the shorter one.
  await writeFile(
    targetPath,
    [
      '<!doctype html><html><body><script type="importmap">',
      JSON.stringify(
        {
          imports: {
            "react-selector": "https://esm.sh/react@18",
            "react-pinned": "https://esm.sh/react@18.3.1",
          },
        },
        null,
        2,
      ),
      "</script></body></html>",
    ].join("\n"),
  );

  const result = await runCli(["--update", targetPath], {
    NO_COLOR: "1",
    ECU_TEST_LATEST_VERSIONS: JSON.stringify({ react: "19.3.0" }),
    ECU_TEST_SPECIFIER_VERSIONS: JSON.stringify({ "react@18": "18.3.1" }),
  });

  assert.equal(result.code, 0);
  const rewritten = await readFile(targetPath, "utf8");
  // The selector entry rewrites to react@19 (major-only).
  assert.match(rewritten, /"react-selector": "https:\/\/esm\.sh\/react@19"/);
  // The pinned entry rewrites to react@19.3.0.
  assert.match(
    rewritten,
    /"react-pinned": "https:\/\/esm\.sh\/react@19\.3\.0"/,
  );
});

test("--update preserves the target file's mode bits", async () => {
  const targetPath = await copyFixture("update-pinned.html");
  // Set a distinctive mode: 0o640 (owner read/write, group read, other none).
  await chmod(targetPath, 0o640);

  const result = await runCli(["--update", targetPath], { NO_COLOR: "1" });
  assert.equal(result.code, 0);

  const stats = await stat(targetPath);
  assert.equal(stats.mode & 0o777, 0o640);
});

test("--update against a read-only target file returns non-zero and leaves the file unchanged", async () => {
  const targetPath = await copyFixture("update-pinned.html");
  const original = await readFile(targetPath, "utf8");
  // Make the containing directory read-only so rename fails with EACCES.
  const dir = path.dirname(targetPath);
  const dirStats = await stat(dir);

  await chmod(dir, 0o555);
  try {
    const result = await runCli(["--update", targetPath], { NO_COLOR: "1" });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Failed to write update/);
    const afterContent = await readFile(targetPath, "utf8");
    assert.equal(afterContent, original);
  } finally {
    await chmod(dir, dirStats.mode);
  }
});

test("--update does not leave temp files behind on write failure", async () => {
  const targetPath = await copyFixture("update-pinned.html");
  const dir = path.dirname(targetPath);
  const dirStats = await stat(dir);

  await chmod(dir, 0o555);
  try {
    await runCli(["--update", targetPath], { NO_COLOR: "1" });
    const { readdir } = await import("node:fs/promises");
    const remaining = await readdir(dir);
    const tempFiles = remaining.filter((name) => name.includes(".ecu-"));
    assert.equal(tempFiles.length, 0, `unexpected temp files: ${tempFiles}`);
  } finally {
    await chmod(dir, dirStats.mode);
  }
});
