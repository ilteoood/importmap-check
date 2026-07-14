import { loadImportMaps, normalizeImportMaps } from "./load.js";
import {
  buildCdnSpec,
  formatSourceLabel,
  parseDependencyPins,
  parseSupportedPackageFromUrl,
} from "./cdn-url.js";
import {
  compareVersions,
  DEFAULT_REGISTRY_URL,
  defaultResolveLatestVersion,
  defaultResolveSpecifier,
} from "./resolve-version.js";

const collectPackageOccurrences = (entries) => {
  const warnings = [];
  const occurrences = [];

  for (const entry of entries) {
    const parsed = parseSupportedPackageFromUrl(entry.value);

    if (parsed) {
      if (parsed?.packageName) {
        occurrences.push({
          cdnFamily: parsed.cdnFamily,
          currentVersion: parsed.currentVersion,
          destinationUrl: entry.value,
          importMapIndex: entry.importMapIndex,
          integrity: entry.integrity,
          key: entry.key,
          keyKind: entry.keyKind,
          packageName: parsed.packageName,
          sourcePath: entry.sourcePath,
          specifier: parsed.specifier ?? "",
        });
      } else {
        warnings.push({
          type: "unparseable-entry",
          message: `Could not parse package identity and version from ${JSON.stringify(entry.value)} for key ${JSON.stringify(entry.key)}.`,
        });
      }
    }

    for (const dependencyPin of parseDependencyPins(entry.value)) {
      if (!dependencyPin?.packageName) {
        warnings.push({
          type: "unparseable-entry",
          message: `Could not parse a pinned dependency from esm.sh deps query on ${JSON.stringify(entry.value)}.`,
        });
        continue;
      }

      occurrences.push({
        cdnFamily: "esm.sh",
        currentVersion: dependencyPin.currentVersion,
        destinationUrl: entry.value,
        // `fromDepsQuery` marks this occurrence as sourced from the outer
        // URL's `?deps=` query pin (not the outer package itself). The rewrite
        // path uses this to route the edit through the `?deps=` token splice
        // rather than the outer `@`-slot rewrite, since the two target
        // different regions of the shared destination URL.
        fromDepsQuery: true,
        importMapIndex: entry.importMapIndex,
        integrity: entry.integrity,
        key: `${entry.key}?deps`,
        keyKind: entry.keyKind,
        packageName: dependencyPin.packageName,
        sourcePath: entry.sourcePath,
        specifier: dependencyPin.specifier ?? "",
      });
    }
  }

  return { occurrences, warnings };
};

const determineSeverity = (currentVersion, latestVersion) => {
  const current = currentVersion
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const latest = latestVersion
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);

  if ((latest[0] ?? 0) !== (current[0] ?? 0)) {
    return "major";
  }

  if ((latest[1] ?? 0) !== (current[1] ?? 0)) {
    return "minor";
  }

  return "patch";
};

const resolveOccurrenceSpecifiers = async (
  occurrences,
  warnings,
  resolveSpecifier,
) => {
  const resolved = [];

  for (const occurrence of occurrences) {
    if (occurrence.currentVersion) {
      resolved.push(occurrence);
      continue;
    }

    if (!occurrence.specifier) {
      warnings.push({
        type: "unparseable-entry",
        message: `Could not parse package identity and version from ${JSON.stringify(occurrence.destinationUrl)} for key ${JSON.stringify(occurrence.key)}.`,
      });
      continue;
    }

    try {
      const resolvedVersion = await resolveSpecifier(
        occurrence.packageName,
        occurrence.specifier,
      );

      if (!resolvedVersion) {
        warnings.push({
          type: "unparseable-entry",
          message: `Could not resolve specifier ${JSON.stringify(occurrence.specifier)} for package ${occurrence.packageName} from ${JSON.stringify(occurrence.destinationUrl)}.`,
        });
        continue;
      }

      occurrence.currentVersion = resolvedVersion;
      resolved.push(occurrence);
    } catch (error) {
      warnings.push({
        type: "unparseable-entry",
        message: `Could not resolve specifier ${JSON.stringify(occurrence.specifier)} for package ${occurrence.packageName} from ${JSON.stringify(occurrence.destinationUrl)}: ${error.message}`,
      });
    }
  }

  return resolved;
};

const groupByPackage = (occurrences) => {
  const grouped = new Map();

  for (const occurrence of occurrences) {
    const existing = grouped.get(occurrence.packageName);

    if (existing) {
      existing.occurrences.push(occurrence);
      continue;
    }

    grouped.set(occurrence.packageName, {
      occurrences: [occurrence],
      packageName: occurrence.packageName,
    });
  }

  return grouped;
};

const hasMeaningfulDestinationSkew = (occurrences) => {
  const uniqueProviders = new Set(occurrences.map((item) => item.cdnFamily));
  const uniqueVersions = new Set(
    occurrences.map((item) => item.currentVersion),
  );

  return uniqueProviders.size > 1 || uniqueVersions.size > 1;
};

const buildPackageSources = (occurrences) => {
  const seen = new Set();
  const sources = [];

  for (const occurrence of occurrences) {
    const key = `${occurrence.key}\0${occurrence.cdnFamily}\0${occurrence.specifier ?? ""}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    sources.push({
      cdnFamily: occurrence.cdnFamily,
      cdnSpec: buildCdnSpec(occurrence.cdnFamily, occurrence.specifier ?? ""),
      importMapKey: occurrence.key,
      label: formatSourceLabel(occurrence),
      specifier: occurrence.specifier ?? "",
    });
  }

  sources.sort((left, right) => {
    if (left.importMapKey !== right.importMapKey) {
      return left.importMapKey.localeCompare(right.importMapKey);
    }

    if (left.cdnFamily !== right.cdnFamily) {
      return left.cdnFamily.localeCompare(right.cdnFamily);
    }

    return left.specifier.localeCompare(right.specifier);
  });

  return sources;
};

export const analyzeTarget = async (targetPath, options = {}) => {
  // Registry access is threaded through as a base URL (default npm). The
  // function-injection hooks remain available for advanced callers, but the
  // base-URL seam is what the CLI and the test mock registry use.
  const registryBaseUrl = options.registryBaseUrl ?? DEFAULT_REGISTRY_URL;
  const resolveLatestVersion =
    options.resolveLatestVersion ??
    ((packageName) =>
      defaultResolveLatestVersion(packageName, registryBaseUrl));
  const resolveSpecifier =
    options.resolveSpecifier ??
    ((packageName, specifier) =>
      defaultResolveSpecifier(packageName, specifier, registryBaseUrl));
  const withSources = options.withSources ?? false;
  const importMaps = await loadImportMaps(targetPath);
  const { normalizedEntries, warnings: normalizationWarnings } =
    normalizeImportMaps(targetPath, importMaps);
  const { occurrences, warnings: parseWarnings } =
    collectPackageOccurrences(normalizedEntries);

  const resolvedOccurrences = await resolveOccurrenceSpecifiers(
    occurrences,
    parseWarnings,
    resolveSpecifier,
  );

  const groupedPackages = groupByPackage(resolvedOccurrences);
  const lookupFailures = [];
  const notes = [];
  const packageResults = [];

  for (const packageGroup of groupedPackages.values()) {
    const currentVersions = [
      ...new Set(packageGroup.occurrences.map((item) => item.currentVersion)),
    ].sort(compareVersions);
    const specifiers = [
      ...new Set(
        packageGroup.occurrences
          .map((item) => item.specifier)
          .filter((specifier) => typeof specifier === "string" && specifier),
      ),
    ].sort();

    let latestVersion;

    try {
      latestVersion = await resolveLatestVersion(packageGroup.packageName);
    } catch (error) {
      lookupFailures.push({
        message: `Could not resolve the latest version for ${packageGroup.packageName}: ${error.message}`,
        packageName: packageGroup.packageName,
      });
      continue;
    }

    const hasUpdate = currentVersions.some(
      (currentVersion) => currentVersion !== latestVersion,
    );

    if (hasMeaningfulDestinationSkew(packageGroup.occurrences)) {
      normalizationWarnings.push({
        type: "destination-skew",
        message: `${packageGroup.packageName} resolves through different CDN providers or pinned versions.`,
      });
    }

    if (hasUpdate) {
      const integritySources = packageGroup.occurrences.filter((occurrence) => {
        return (
          occurrence.integrity &&
          occurrence.destinationUrl in occurrence.integrity
        );
      });

      if (integritySources.length > 0) {
        notes.push({
          message: `${packageGroup.packageName} has import map integrity metadata tied to a URL that would need review if updated.`,
        });
      }
    }

    const result = {
      resolvedVersions: currentVersions,
      hasUpdate,
      latestVersion,
      packageName: packageGroup.packageName,
      severity: hasUpdate
        ? determineSeverity(currentVersions[0], latestVersion)
        : null,
      specifiers,
    };

    if (withSources) {
      result.sources = buildPackageSources(packageGroup.occurrences);
    }

    packageResults.push(result);
  }

  packageResults.sort((left, right) =>
    left.packageName.localeCompare(right.packageName),
  );

  return {
    allOccurrences: resolvedOccurrences,
    lookupFailures,
    notes,
    packageResults,
    targetPath,
    warnings: [...normalizationWarnings, ...parseWarnings],
  };
};
