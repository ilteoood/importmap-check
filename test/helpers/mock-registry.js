import { createServer } from "node:http";

// Local, implementation-neutral stand-in for the npm registry used by the test
// suite. It serves packument JSON over HTTP so that code under test exercises
// its real registry-fetch path (via the `registryBaseUrl` / `IMPORTMAP_CHECK_REGISTRY_URL`
// seam) without touching the network. Any rebuild that honors a configurable
// registry base URL can run these tests unchanged.

// Build a packument from a compact spec: a `latest` dist-tag (plus any extra
// dist-tags) and a flat list of version strings.
export const packument = (
  name,
  { distTags = {}, latest, versions = [] } = {},
) => ({
  name,
  "dist-tags": latest ? { latest, ...distTags } : { ...distTags },
  versions: Object.fromEntries(
    versions.map((version) => [version, { name, version }]),
  ),
});

const isRangeOrSelector = (specifier) =>
  specifier.startsWith("^") ||
  specifier.startsWith("~") ||
  /^\d+$/.test(specifier) ||
  /^\d+\.\d+$/.test(specifier);

// Build a `{ packageName: packument }` map from the compact stub shape the tests
// use: `latest` maps package → its `dist-tags.latest`; `specifiers` maps a
// `"<pkg>@<specifier>"` key → the version that specifier should resolve to.
// Ranges/selectors (^, ~, "18", "18.3") become entries in the package's
// `versions` list (so the real resolveSemverRange walk finds them); anything
// else is treated as a named dist-tag. This mirrors how defaultResolveSpecifier
// resolves — dist-tag first, then semver range — without baking any test hook
// into production code.
export const packumentsFromMaps = ({ latest = {}, specifiers = {} } = {}) => {
  const specs = new Map();

  const ensure = (name) => {
    if (!specs.has(name)) {
      specs.set(name, { distTags: {}, versions: new Set() });
    }

    return specs.get(name);
  };

  for (const [name, version] of Object.entries(latest)) {
    ensure(name).distTags.latest = version;
  }

  for (const [key, version] of Object.entries(specifiers)) {
    const at = key.lastIndexOf("@");
    const name = key.slice(0, at);
    const specifier = key.slice(at + 1);
    const entry = ensure(name);

    if (isRangeOrSelector(specifier)) {
      entry.versions.add(version);
    } else {
      entry.distTags[specifier] = version;
    }
  }

  const packuments = {};

  for (const [name, { distTags, versions }] of specs.entries()) {
    const { latest: latestVersion, ...extraTags } = distTags;

    packuments[name] = packument(name, {
      distTags: extraTags,
      latest: latestVersion,
      versions: [...versions],
    });
  }

  return packuments;
};

// Start a mock registry serving the given `{ packageName: packument }` map.
// Returns `{ url, close }`; `url` is suitable as `registryBaseUrl` /
// `IMPORTMAP_CHECK_REGISTRY_URL`. Requests for unknown packages return 404.
export const startMockRegistry = async (packuments = {}) => {
  const server = createServer((req, res) => {
    // npm encodes the "/" in scoped names as "%2f"; decode back to the real
    // package name used as the map key.
    const name = decodeURIComponent(req.url.replace(/^\//, ""));
    const body = packuments[name];

    if (!body) {
      res.statusCode = 404;
      res.end("{}");

      return;
    }

    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address();

  return {
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
      }),
    url: `http://127.0.0.1:${port}`,
  };
};
