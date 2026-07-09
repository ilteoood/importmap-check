import { writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import assert from "node:assert/strict";

import { createFixtureRegistry, runCli } from "./cli-helpers.js";

const { cleanup, copyFixture, createFixtureDir } = createFixtureRegistry();

after(cleanup);

test("prints help with --help", async () => {
  const result = await runCli(["--help"]);

  assert.equal(result.code, 0);
  assert.match(
    result.stdout,
    /Usage: esm-check-updates \[options\] <target-path>/,
  );
  assert.match(result.stdout, /check-only/i);
  assert.match(
    result.stdout,
    /--sources\s+Show source import-map entries in the report/,
  );
  assert.match(
    result.stdout,
    /--width <num>\s+Override available report width/,
  );
  assert.match(
    result.stdout,
    /-u, --update\s+Rewrite updateable entries in the target file in place/,
  );
  assert.equal(result.stderr, "");
});

test("prints version with -v", async () => {
  const result = await runCli(["-v"]);

  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), "0.0.1");
  assert.equal(result.stderr, "");
});

test("rejects missing target path", async () => {
  const result = await runCli([]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Expected exactly one target path/);
  assert.equal(result.stdout, "");
});

test("rejects multiple target paths", async () => {
  const result = await runCli(["one.json", "two.json"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Expected exactly one target path/);
  assert.equal(result.stdout, "");
});

test("rejects unknown flags", async () => {
  const result = await runCli(["--wat"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown flag: --wat/);
  assert.equal(result.stdout, "");
});

test("rejects flag=value syntax as an unknown flag", async () => {
  const result = await runCli(["--width=100", "target.json"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown flag: --width=100/);
  assert.equal(result.stdout, "");
});

test("rejects --update without a target path", async () => {
  const result = await runCli(["--update"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Expected exactly one target path/);
  assert.equal(result.stdout, "");
});

test("rejects -u with multiple target paths", async () => {
  const result = await runCli(["-u", "one.json", "two.json"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Expected exactly one target path/);
  assert.equal(result.stdout, "");
});

test("rejects missing target file", async () => {
  const fixtureDir = await createFixtureDir();
  const missingFile = path.join(fixtureDir, "missing.json");
  const result = await runCli([missingFile]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /missing or unreadable/);
  assert.equal(result.stdout, "");
});

test("rejects unsupported target extensions", async () => {
  const fixtureDir = await createFixtureDir();
  const targetPath = path.join(fixtureDir, "import-map.txt");
  await writeFile(targetPath, "not an import map");

  const result = await runCli([targetPath]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unsupported target type/);
  assert.equal(result.stdout, "");
});

test("analyzes a valid json import map", async () => {
  const targetPath = await copyFixture(
    "valid-import-map.json",
    "import-map.json",
  );
  const result = await runCli([targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /esm-check-updates/);
  assert.match(result.stdout, /\n\n## Updates\n/);
  assert.match(result.stdout, /Package\s+\|\s+Resolved\s+\|\s+Latest/);
  assert.match(result.stdout, /react\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0/);
  assert.match(result.stdout, /react-dom\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0/);
  assert.equal(result.stderr, "");
});

test("reports malformed json import maps as fatal errors", async () => {
  const targetPath = await copyFixture(
    "malformed-import-map.json",
    "import-map.json",
  );
  const result = await runCli([targetPath]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Could not parse/);
  assert.equal(result.stdout, "");
});

test("analyzes an inline html import map", async () => {
  const targetPath = await copyFixture("inline-importmap.html", "index.html");
  const result = await runCli([targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /\n\n## Updates\n/);
  assert.match(result.stdout, /react\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0/);
  assert.equal(result.stderr, "");
});

test("merges multiple inline import maps for package analysis", async () => {
  const targetPath = await copyFixture(
    "multiple-importmaps.html",
    "index.html",
  );
  const result = await runCli([targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /react\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0/);
  assert.doesNotMatch(result.stdout, /sources:/);
  assert.match(result.stdout, /react-dom\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0/);
});

test("fails when html has no supported inline import map", async () => {
  const targetPath = await copyFixture("no-importmap.html", "index.html");
  const result = await runCli([targetPath]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /No supported inline import map was found/);
  assert.equal(result.stdout, "");
});

test("warns on scopes and analyzes remap keys by destination value", async () => {
  const targetPath = await copyFixture("scopes-and-remaps.html", "index.html");
  const result = await runCli([targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /\n\n## Warnings\n/);
  assert.match(result.stdout, /contains `scopes`, which are not yet supported/);
  assert.match(
    result.stdout,
    /react\s+\|\s+19\.1\.0, 19\.2\.3\s+\|\s+19\.3\.0/,
  );
});

test("warns on destination skew for the same package", async () => {
  const targetPath = await copyFixture("destination-skew.html", "index.html");
  const result = await runCli([targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(
    result.stdout,
    /resolves through different CDN providers or pinned versions/,
  );
});

test("does not warn on duplicate destination urls with the same provider and version", async () => {
  const targetPath = await copyFixture(
    "multiple-importmaps.html",
    "duplicate-destination.html",
  );
  const result = await runCli([targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.doesNotMatch(
    result.stdout,
    /resolves through different CDN providers or pinned versions/,
  );
});

test("warns for supported cdn entries that are unparseable", async () => {
  const targetPath = await copyFixture(
    "unparseable-supported.html",
    "index.html",
  );
  const result = await runCli([targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /\n\n## Warnings\n/);
  assert.match(result.stdout, /Could not parse package identity and version/);
  assert.match(result.stdout, /react-dom\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0/);
});

test("resolves non-pinned specifiers on supported cdns", async () => {
  const targetPath = await copyFixture(
    "non-pinned-supported.html",
    "index.html",
  );
  const result = await runCli([targetPath], {
    NO_COLOR: "1",
    ECU_TEST_SPECIFIER_VERSIONS: JSON.stringify({
      "react@18": "18.3.1",
      "react-dom@^19.2.3": "19.2.7",
    }),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /\n\n## Updates\n/);
  // react@18 (root esm.sh entry plus swr ?deps= pin) both resolve to 18.3.1;
  // latest is 19.3.0, so it lands in Updates with the "18" specifier shown.
  assert.match(result.stdout, /react \(18\)\s+\|\s+18\.3\.1\s+\|\s+19\.3\.0/);
  // react-dom has two occurrences: the root ^19.2.3 range (resolves to
  // 19.2.7) and the swr ?deps=react-dom@19.2.3 pin (19.2.3). The skew
  // surfaces as a current version list.
  assert.match(
    result.stdout,
    /react-dom \(\^19\.2\.3\)\s+\|\s+19\.2\.3, 19\.2\.7\s+\|\s+19\.3\.0/,
  );
  assert.match(
    result.stdout,
    /react-dom resolves through different CDN providers or pinned versions/,
  );
  // The swr URL itself has no @ specifier at all and stays unparseable.
  assert.match(
    result.stdout,
    /Could not parse package identity and version from "https:\/\/esm\.sh\/swr\?deps=react@18,react-dom@19\.2\.3" for key "swr"/,
  );
  // The previously-warning non-pinned selectors no longer warn.
  assert.doesNotMatch(
    result.stdout,
    /Could not parse package identity and version from "https:\/\/esm\.sh\/react@18"/,
  );
  assert.doesNotMatch(
    result.stdout,
    /Could not parse package identity and version from "https:\/\/cdn\.jsdelivr\.net\/npm\/react-dom@\^19\.2\.3/,
  );
});

test("resolves dist-tag specifiers on supported cdns", async () => {
  const fixtureDir = await createFixtureDir();
  const targetPath = path.join(fixtureDir, "index.html");
  await writeFile(
    targetPath,
    [
      '<!doctype html><html><body><script type="importmap">',
      JSON.stringify(
        {
          imports: {
            react: "https://esm.sh/react@latest",
            "react-dom/client": "https://esm.sh/react-dom@beta/client",
          },
        },
        null,
        2,
      ),
      "</script></body></html>",
    ].join("\n"),
  );
  const result = await runCli([targetPath], {
    NO_COLOR: "1",
    ECU_TEST_SPECIFIER_VERSIONS: JSON.stringify({
      "react@latest": "19.3.0",
      "react-dom@beta": "20.0.0-beta.1",
    }),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /\n\n## Updates\n/);
  // react@latest resolves to the same version as the stable latest, so it
  // appears in the Current section with both specifier and version shown.
  assert.match(result.stdout, /\n\n## Current\n/);
  assert.match(
    result.stdout,
    /react \(latest\)\s+\|\s+19\.3\.0\s+\|\s+19\.3\.0/,
  );
  // react-dom@beta resolves to a prerelease above the stable latest, so it
  // lands in Updates with the "beta" specifier shown.
  assert.match(
    result.stdout,
    /react-dom \(beta\)\s+\|\s+20\.0\.0-beta\.1\s+\|\s+19\.3\.0/,
  );
});

test("resolves arbitrary npm dist-tags outside the common allowlist", async () => {
  // npm dist-tags are arbitrary strings — `preview`, `insider`, `legacy`,
  // etc. are all valid registry dist-tags even though they aren't in the
  // common `latest|beta|next|canary|alpha` set.
  const fixtureDir = await createFixtureDir();
  const targetPath = path.join(fixtureDir, "index.html");
  await writeFile(
    targetPath,
    [
      '<!doctype html><html><body><script type="importmap">',
      JSON.stringify(
        {
          imports: {
            react: "https://esm.sh/react@preview",
            "react-dom/client": "https://esm.sh/react-dom@insider/client",
          },
        },
        null,
        2,
      ),
      "</script></body></html>",
    ].join("\n"),
  );
  const result = await runCli([targetPath], {
    NO_COLOR: "1",
    ECU_TEST_SPECIFIER_VERSIONS: JSON.stringify({
      "react@preview": "19.4.0-preview.2",
      "react-dom@insider": "19.4.0-insider.1",
    }),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /\n\n## Updates\n/);
  assert.match(
    result.stdout,
    /react \(preview\)\s+\|\s+19\.4\.0-preview\.2\s+\|\s+19\.3\.0/,
  );
  assert.match(
    result.stdout,
    /react-dom \(insider\)\s+\|\s+19\.4\.0-insider\.1\s+\|\s+19\.3\.0/,
  );
  assert.doesNotMatch(
    result.stdout,
    /Could not parse package identity and version/,
  );
});

test("resolves minor-only selectors on supported cdns", async () => {
  const fixtureDir = await createFixtureDir();
  const targetPath = path.join(fixtureDir, "index.html");
  await writeFile(
    targetPath,
    [
      '<!doctype html><html><body><script type="importmap">',
      JSON.stringify(
        {
          imports: {
            react: "https://esm.sh/react@18.3",
            "react-dom/client": "https://esm.sh/react-dom@18.3/client",
          },
        },
        null,
        2,
      ),
      "</script></body></html>",
    ].join("\n"),
  );
  const result = await runCli([targetPath], {
    NO_COLOR: "1",
    ECU_TEST_SPECIFIER_VERSIONS: JSON.stringify({
      "react@18.3": "18.3.1",
      "react-dom@18.3": "18.3.1",
    }),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /\n\n## Updates\n/);
  assert.match(
    result.stdout,
    /react \(18\.3\)\s+\|\s+18\.3\.1\s+\|\s+19\.3\.0/,
  );
  assert.match(
    result.stdout,
    /react-dom \(18\.3\)\s+\|\s+18\.3\.1\s+\|\s+19\.3\.0/,
  );
});

test("parses esm.sh v-prefix build marks and package subpaths", async () => {
  const targetPath = await copyFixture("esm-sh-vprefix.html", "index.html");
  const result = await runCli([targetPath], {
    NO_COLOR: "1",
    ECU_TEST_LATEST_VERSIONS: JSON.stringify({
      htm: "3.1.1",
      spectacle: "10.2.3",
      "broadcast-channel": "4.18.0",
      history: "5.3.5",
      kbar: "0.1.0-beta.40",
      "lodash.clonedeep": "4.5.0",
      "mdast-builder": "1.1.1",
      "mdast-zone": "4.0.0",
      "merge-anything": "3.0.3",
      mousetrap: "1.6.5",
      "query-string": "7.1.3",
      react: "19.3.0",
      "react-dom": "19.3.0",
      "react-fast-compare": "3.2.0",
      "react-is": "18.1.0",
      "react-spring": "9.5.5",
      "react-swipeable": "7.0.0",
      "react-syntax-highlighter": "15.5.0",
      "rehype-raw": "5.1.0",
      "rehype-react": "6.0.0",
      "remark-parse": "8.0.3",
      "remark-rehype": "7.0.0",
      "styled-components": "5.3.6",
      "styled-system": "5.1.5",
      unified: "9.0.0",
      "unist-util-visit": "2.0.3",
      "use-resize-observer": "9.0.2",
    }),
    ECU_TEST_SPECIFIER_VERSIONS: JSON.stringify({
      "htm@^3": "3.0.4",
      "spectacle@10": "10.2.3",
      "broadcast-channel@^4.17.0": "4.17.0",
      "history@^5.3.0": "5.3.0",
      "react-fast-compare@^3.2.0": "3.2.1",
      "react-is@^18.1.0": "18.1.0",
      "react-spring@^9.5.5": "9.5.5",
      "react-swipeable@^7.0.0": "7.0.0",
      "react-syntax-highlighter@^15.5.0": "15.5.0",
      "rehype-raw@^5.1.0": "5.1.0",
      "rehype-react@^6.0.0": "6.0.0",
      "remark-parse@^8.0.3": "8.0.3",
      "remark-rehype@^7.0.0": "7.0.0",
      "styled-components@^5.3.6": "5.3.6",
      "unified@^9.0.0": "9.0.0",
      "unist-util-visit@^2.0.3": "2.0.3",
      "use-resize-observer@^9.0.2": "9.0.2",
      "lodash.clonedeep@^4.5.0": "4.5.0",
      "mdast-builder@^1.1.1": "1.1.1",
      "mdast-zone@^4.0.0": "4.0.0",
      "merge-anything@^3.0.3": "3.0.3",
      "mousetrap@^1.6.5": "1.6.5",
      "query-string@^7.1.3": "7.1.3",
    }),
  });

  assert.equal(result.code, 0);
  assert.doesNotMatch(
    result.stdout,
    /Could not parse package identity and version from "https:\/\/esm\.sh\/v121\//,
  );
  assert.match(result.stdout, /\n\n## Current\n/);
  assert.match(
    result.stdout,
    /spectacle \(10\)\s+\|\s+10\.2\.3\s+\|\s+10\.2\.3/,
  );
  assert.match(result.stdout, /\n\n## Updates\n/);
  assert.match(result.stdout, /^\s*react\s+\|\s+18\.2\.0\s+\|\s+19\.3\.0/m);
  assert.match(
    result.stdout,
    /react-syntax-highlighter \(\^15\.5\.0\)\s+\|\s+15\.5\.0\s+\|\s+15\.5\.0/,
  );
});

test("distinguishes a real v1 package from an esm.sh v-prefix build mark", async () => {
  // https://www.npmjs.com/package/v1 is a real package. esm.sh build marks
  // look like /v121/ (a bare v<digits> segment with no @version), while a
  // real v1 package appears as v1@<version> in the segment. The parser must
  // not mistake v1@<version> for a build mark just because the package name
  // starts with v1.
  const fixtureDir = await createFixtureDir();
  const targetPath = path.join(fixtureDir, "index.html");
  await writeFile(
    targetPath,
    [
      '<!doctype html><html><body><script type="importmap">',
      JSON.stringify(
        {
          imports: {
            v1: "https://esm.sh/v1@1.0.5",
            "v1/sub": "https://esm.sh/v1@1.0.5/sub",
            react: "https://esm.sh/v135/react@19.2.3",
          },
        },
        null,
        2,
      ),
      "</script></body></html>",
    ].join("\n"),
  );
  const result = await runCli([targetPath], {
    NO_COLOR: "1",
    ECU_TEST_LATEST_VERSIONS: JSON.stringify({
      v1: "2.0.0",
      react: "19.3.0",
    }),
  });

  assert.equal(result.code, 0);
  // v1@1.0.5 is parsed as package "v1" at version "1.0.5", NOT skipped as a
  // build mark. It lands in Updates against latest 2.0.0 with no specifier.
  assert.match(result.stdout, /\n\n## Updates\n/);
  assert.match(result.stdout, /^\s*v1\s+\|\s+1\.0\.5\s+\|\s+2\.0\.0/m);
  assert.match(result.stdout, /^\s*react\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0/m);
  // No unparseable warnings for either the v1 package or the v135 build mark.
  assert.doesNotMatch(
    result.stdout,
    /Could not parse package identity and version from "https:\/\/esm\.sh\/v1@1\.0\.5"/,
  );
  assert.doesNotMatch(
    result.stdout,
    /Could not parse package identity and version from "https:\/\/esm\.sh\/v135\/react@19\.2\.3"/,
  );
});

test("accepts prerelease versions as concrete pins", async () => {
  const targetPath = await copyFixture("prerelease-pinned.html", "index.html");
  const result = await runCli([targetPath], {
    NO_COLOR: "1",
    ECU_TEST_LATEST_VERSIONS: JSON.stringify({
      next: "16.3.0",
      swr: "2.2.5",
    }),
  });

  assert.equal(result.code, 0);
  assert.doesNotMatch(result.stdout, /Could not parse/);
  assert.doesNotMatch(result.stdout, /non-versioned/);
  assert.match(
    result.stdout,
    /next\s+\|\s+16\.3\.0-preview\.5\s+\|\s+16\.3\.0/,
  );
  assert.match(result.stdout, /swr\s+\|\s+2\.2\.5-canary\.12\s+\|\s+2\.2\.5/);
});

test("emits an integrity note when an updated mapping has integrity metadata", async () => {
  const targetPath = await copyFixture("integrity-note.html", "index.html");
  const result = await runCli([targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /\n\n## Notes\n/);
  assert.match(
    result.stdout,
    /integrity metadata tied to a URL that would need review/,
  );
});

test("--sources enables the Source column", async () => {
  const targetPath = await copyFixture("inline-importmap.html", "index.html");
  const result = await runCli(["--sources", targetPath], { NO_COLOR: "1" });

  assert.equal(result.code, 0);
  assert.match(
    result.stdout,
    /Package\s+\|\s+Resolved\s+\|\s+Latest\s+\|\s+Source/,
  );
  assert.match(
    result.stdout,
    /react\s+\|\s+19\.2\.3\s+\|\s+19\.3\.0\s+\|\s+react \(jsdelivr\)/,
  );
  assert.equal(result.stderr, "");
});

test("--width overrides terminal width when --sources is provided", async () => {
  const targetPath = await copyFixture("scopes-and-remaps.html", "index.html");
  const result = await runCli(["--sources", "--width", "60", targetPath], {
    NO_COLOR: "1",
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Source/);
  // At width 60 the source column is narrow enough that labels wrap.
  assert.match(result.stdout, /\|\s+\.\/vendor\/react\.js/);
});

test("rejects invalid --width values", async () => {
  for (const value of ["abc", "0", "39"]) {
    const result = await runCli(["--width", value, "target.json"]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /--width must be a positive integer >= 40/);
    assert.equal(result.stdout, "");
  }
});

test("accepts --width without --sources", async () => {
  const targetPath = await copyFixture("inline-importmap.html", "index.html");
  const result = await runCli(["--width", "100", targetPath], {
    NO_COLOR: "1",
  });

  assert.equal(result.code, 0);
  assert.doesNotMatch(result.stdout, /Source/);
  assert.match(result.stdout, /Package\s+\|\s+Resolved\s+\|\s+Latest/);
  assert.equal(result.stderr, "");
});

test("rejects --width with a non-numeric value", async () => {
  const result = await runCli(["--width", "target.json"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /--width must be a positive integer >= 40/);
});
