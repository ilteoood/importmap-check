import { MAJOR_SELECTOR_PATTERN, MINOR_SELECTOR_PATTERN } from "../semver.js";

// Default npm registry base URL. Callers may override this (see the CLI's
// IMPORTMAP_CHECK_REGISTRY_URL knob) to point at a private registry or, in tests, a local
// mock registry — keeping registry access an explicit dependency rather than a
// hard-coded host.
export const DEFAULT_REGISTRY_URL = "https://registry.npmjs.org";

const encodePackageName = (packageName) =>
  packageName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const fetchPackument = async (packageName, registryBaseUrl) => {
  const response = await fetch(
    `${registryBaseUrl}/${encodePackageName(packageName)}`,
  );

  if (!response.ok) {
    throw new Error(`npm registry request failed with ${response.status}`);
  }

  return response.json();
};

const compareVersions = (left, right) => {
  const leftParts = left
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);

  for (
    let index = 0;
    index < Math.max(leftParts.length, rightParts.length);
    index += 1
  ) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
};

export const defaultResolveLatestVersion = async (
  packageName,
  registryBaseUrl = DEFAULT_REGISTRY_URL,
) => {
  const body = await fetchPackument(packageName, registryBaseUrl);
  const latestVersion = body?.["dist-tags"]?.latest;

  if (typeof latestVersion !== "string" || latestVersion.length === 0) {
    throw new Error("npm registry response did not include dist-tags.latest");
  }

  return latestVersion;
};

const isStableVersion = (version) => !version.includes("-");

const listStableVersions = (registryBody) => {
  const versions = Object.keys(registryBody?.versions ?? {});

  return versions.filter(isStableVersion);
};

const findHighestInMajor = (versions, major) => {
  return versions
    .filter((version) => version.split(".")[0] === major)
    .sort(compareVersions)
    .pop();
};

const findHighestInMinor = (versions, major, minor) => {
  return versions
    .filter((version) => {
      const [maj, min] = version.split(".");

      return maj === major && min === minor;
    })
    .sort(compareVersions)
    .pop();
};

const resolveDistTag = (packageName, specifier, registryBody) => {
  const distTags = registryBody?.["dist-tags"] ?? {};

  return distTags[specifier] ?? null;
};

const exactMatch = (versions, candidate) => {
  return versions.includes(candidate) ? candidate : null;
};

const resolveCaretRange = (specifier, versions) => {
  // npm caret semantics lock the leftmost non-zero element of [major, minor,
  // patch]. Reference: https://github.com/npm/node-semver#ranges-1
  //
  //   ^1.2.3 := >=1.2.3 <2.0.0       (lock major)
  //   ^0.2.3 := >=0.2.3 <0.3.0       (lock minor — 0.x changes are breaking)
  //   ^0.0.3 := >=0.0.3 <0.0.4       (lock patch — 0.0.x changes are breaking)
  //   ^0.0   := >=0.0.0 <0.1.0       (lock minor when patch unspecified)
  //   ^0     := >=0.0.0 <1.0.0       (lock major when only major specified)
  //
  // The previous implementation collapsed every ^0.* to ^0, returning the
  // highest 0.x version regardless of the user's expressed minor or patch
  // lock. That was looser than esm.sh actually serves at request time.
  const [majorStr, minorStr, patchStr] = specifier.slice(1).split(".");
  const major = Number.parseInt(majorStr, 10);

  if (Number.isNaN(major)) {
    return null;
  }

  if (major > 0) {
    return findHighestInMajor(versions, `${major}`) ?? null;
  }

  // major === 0
  const minor = Number.parseInt(minorStr, 10);

  if (Number.isNaN(minor)) {
    // ^0 := any 0.x.
    return findHighestInMajor(versions, "0") ?? null;
  }

  if (minor > 0) {
    // ^0.X.Y := >=0.X.Y <0.(X+1).0 — lock minor.
    return findHighestInMinor(versions, "0", `${minor}`) ?? null;
  }

  // minor === 0
  const patch = Number.parseInt(patchStr, 10);

  if (Number.isNaN(patch)) {
    // ^0.0 := >=0.0.0 <0.1.0 — lock minor 0 (any 0.0.x).
    return findHighestInMinor(versions, "0", "0") ?? null;
  }

  // ^0.0.Z := >=0.0.Z <0.0.(Z+1) — lock patch. Only Z itself satisfies this
  // half-open range (ignoring prereleases which listStableVersions excludes).
  return exactMatch(versions, `0.0.${patch}`);
};

const resolveTildeRange = (specifier, versions) => {
  // npm tilde semantics lock the position immediately left of the
  // rightmost-specified position. Reference:
  // https://github.com/npm/node-semver#ranges-1
  //
  //   ~1.2.3 := >=1.2.3 <1.3.0       (lock minor)
  //   ~1.2   := >=1.2.0 <1.3.0       (lock minor)
  //   ~1     := >=1.0.0 <2.0.0       (lock major)
  //   ~0.2.3 := >=0.2.3 <0.3.0       (lock minor)
  //   ~0.0.3 := >=0.0.3 <0.0.4       (npm quirk — patch-locked, matches ^0.0.3)
  //   ~0.0   := >=0.0.0 <0.1.0       (lock minor)
  //   ~0     := >=0.0.0 <1.0.0       (lock major)
  //
  // The previous implementation returned the highest 0.0.x for ~0.0.Z because
  // findHighestInMinor ignores the patch component. Per npm's quirk, ~0.0.Z
  // admits only Z itself.
  const [majorStr, minorStr, patchStr] = specifier.slice(1).split(".");
  const major = Number.parseInt(majorStr, 10);

  if (Number.isNaN(major)) {
    return null;
  }

  // ~X := lock major.
  if (minorStr === undefined) {
    return findHighestInMajor(versions, `${major}`) ?? null;
  }

  const minor = Number.parseInt(minorStr, 10);

  // ~X.Y := lock minor (any X.Y.*).
  if (patchStr === undefined) {
    return findHighestInMinor(versions, `${major}`, `${minor}`) ?? null;
  }

  // ~X.Y.Z full
  const patch = Number.parseInt(patchStr, 10);

  if (major === 0 && minor === 0) {
    // npm quirk: ~0.0.Z := >=0.0.Z <0.0.(Z+1) — only Z satisfies.
    return exactMatch(versions, `0.0.${patch}`);
  }

  // All other ~X.Y.Z cases lock the minor.
  return findHighestInMinor(versions, `${major}`, `${minor}`) ?? null;
};

export const resolveSemverRange = (packageName, specifier, registryBody) => {
  const versions = listStableVersions(registryBody);

  if (specifier.startsWith("^")) {
    return resolveCaretRange(specifier, versions);
  }

  if (specifier.startsWith("~")) {
    return resolveTildeRange(specifier, versions);
  }

  if (MAJOR_SELECTOR_PATTERN.test(specifier)) {
    return findHighestInMajor(versions, specifier) ?? null;
  }

  if (MINOR_SELECTOR_PATTERN.test(specifier)) {
    const [major, minor] = specifier.split(".");

    return findHighestInMinor(versions, major, minor) ?? null;
  }

  return null;
};

export const defaultResolveSpecifier = async (
  packageName,
  specifier,
  registryBaseUrl = DEFAULT_REGISTRY_URL,
) => {
  const body = await fetchPackument(packageName, registryBaseUrl);

  // Try dist-tag lookup first (covers arbitrary tag names), then fall back to
  // semver-range/major/minor selector resolution. Returns null when neither
  // path resolves so the caller can warn.
  const distTagVersion = resolveDistTag(packageName, specifier, body);

  if (distTagVersion) {
    return distTagVersion;
  }

  return resolveSemverRange(packageName, specifier, body);
};

// Shared with analyze.js for sorting semver-like strings.
export { compareVersions };
