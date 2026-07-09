import {
  MAJOR_SELECTOR_PATTERN,
  MINOR_SELECTOR_PATTERN,
} from "./parse-cdn-url.js";

const parseVersionTriple = (version) => {
  const [majorStr, minorStr, patchStr] = version.split(".");
  const major = Number.parseInt(majorStr, 10);
  const minor = Number.parseInt(minorStr, 10);
  const patch = Number.parseInt(patchStr, 10);

  return [
    Number.isNaN(major) ? 0 : major,
    Number.isNaN(minor) ? 0 : minor,
    Number.isNaN(patch) ? 0 : patch,
  ];
};

const rewriteCaret = (specifier, latestVersion) => {
  const [specMajor] = parseVersionTriple(specifier.slice(1));
  const [latestMajor, latestMinor, latestPatch] =
    parseVersionTriple(latestVersion);

  if (specMajor === 0) {
    const [, specMinor] = parseVersionTriple(specifier.slice(1));

    if (specMinor === 0) {
      // ^0.0.Z patch-locked entry. Promote as needed.
      if (latestMajor > 0) {
        return `^${latestMajor}.0.0`;
      }

      if (latestMinor > 0) {
        return `^0.${latestMinor}.0`;
      }

      return `^0.0.${latestPatch}`;
    }

    // ^0.X.Y minor-locked entry (X > 0).
    if (latestMajor > 0) {
      return `^${latestMajor}.0.0`;
    }

    return `^0.${latestMinor}.0`;
  }

  // specMajor > 0. Caret locks major; lift to whatever major latest sits in.
  return `^${latestMajor}.0.0`;
};

const rewriteTilde = (specifier, latestVersion) => {
  const [specMajor, specMinor] = parseVersionTriple(specifier.slice(1));
  const [latestMajor, latestMinor, latestPatch] =
    parseVersionTriple(latestVersion);

  if (specMajor === 0 && specMinor === 0) {
    // npm quirk: ~0.0.Z is patch-locked. Promote as needed.
    if (latestMajor > 0) {
      return `~${latestMajor}.0.0`;
    }

    if (latestMinor > 0) {
      return `~0.${latestMinor}.0`;
    }

    return `~0.0.${latestPatch}`;
  }

  // Standard tilde locks minor. If latest is in the same major, lift to the
  // new minor; otherwise cross to the new major (tilde crosses major when
  // latest has crossed).
  if (latestMajor === specMajor) {
    return `~${latestMajor}.${latestMinor}.0`;
  }

  return `~${latestMajor}.0.0`;
};

export const rewriteSpecifier = (specifier, latestVersion) => {
  if (!latestVersion) {
    return null;
  }

  if (specifier === "") {
    // Pinned entry — bump the concrete version to latest.
    return latestVersion;
  }

  if (specifier.startsWith("^")) {
    return rewriteCaret(specifier, latestVersion);
  }

  if (specifier.startsWith("~")) {
    return rewriteTilde(specifier, latestVersion);
  }

  if (MAJOR_SELECTOR_PATTERN.test(specifier)) {
    const [latestMajor] = parseVersionTriple(latestVersion);

    return `${latestMajor}`;
  }

  if (MINOR_SELECTOR_PATTERN.test(specifier)) {
    const [latestMajor, latestMinor] = parseVersionTriple(latestVersion);

    return `${latestMajor}.${latestMinor}`;
  }

  // Dist-tag — not rewritten in this change.
  return null;
};
