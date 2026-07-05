import { readFile } from "node:fs/promises";
import path from "node:path";

export { formatReport } from "./report.js";

const IMPORTMAP_SCRIPT_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const ATTRIBUTE_PATTERN =
  /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

const isObjectRecord = (value) => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const createAnalysisError = (message) => {
  const error = new Error(message);
  error.exitCode = 1;

  return error;
};

const parseJsonDocument = (content, label) => {
  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw createAnalysisError(
      `Could not parse ${label} as valid JSON: ${error.message}`,
    );
  }

  if (!isObjectRecord(parsed)) {
    throw createAnalysisError(`${label} must be a JSON object.`);
  }

  return parsed;
};

const validateImportMapShape = (importMap, label) => {
  if ("imports" in importMap && !isObjectRecord(importMap.imports)) {
    throw createAnalysisError(`${label} has an invalid \`imports\` section.`);
  }

  if ("scopes" in importMap && !isObjectRecord(importMap.scopes)) {
    throw createAnalysisError(`${label} has an invalid \`scopes\` section.`);
  }

  if ("integrity" in importMap && !isObjectRecord(importMap.integrity)) {
    throw createAnalysisError(`${label} has an invalid \`integrity\` section.`);
  }
};

const parseScriptAttributes = (attributesSource) => {
  const attributes = new Map();
  ATTRIBUTE_PATTERN.lastIndex = 0;

  for (const match of attributesSource.matchAll(ATTRIBUTE_PATTERN)) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attributes.set(name, value);
  }

  return attributes;
};

const extractHtmlImportMaps = (content, targetPath) => {
  const importMaps = [];

  // HTML import maps are inline <script type="importmap"> blocks. MDN reference:
  // https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap
  for (const match of content.matchAll(IMPORTMAP_SCRIPT_PATTERN)) {
    const attributes = parseScriptAttributes(match[1]);

    if (attributes.get("type") !== "importmap") {
      continue;
    }

    const label = `${targetPath} importmap[${importMaps.length + 1}]`;
    const importMap = parseJsonDocument(match[2].trim(), label);
    validateImportMapShape(importMap, label);
    importMaps.push({
      importMap,
      importMapIndex: importMaps.length + 1,
    });
  }

  if (importMaps.length === 0) {
    throw createAnalysisError(
      `No supported inline import map was found in ${targetPath}.`,
    );
  }

  return importMaps;
};

const classifyKey = (key) => {
  if (key.startsWith("./") || key.startsWith("../") || key.startsWith("/")) {
    return "remap";
  }

  try {
    const parsed = new URL(key);

    if (parsed.protocol) {
      return "remap";
    }
  } catch {
    // Fall through to package-style classification.
  }

  return "package";
};

const loadImportMaps = async (targetPath) => {
  const extension = path.extname(targetPath).toLowerCase();
  const content = await readFile(targetPath, "utf8");

  if (extension === ".json") {
    const importMap = parseJsonDocument(content, targetPath);
    validateImportMapShape(importMap, targetPath);

    return [{ importMap, importMapIndex: null }];
  }

  return extractHtmlImportMaps(content, targetPath);
};

const normalizeImportMaps = (targetPath, importMaps) => {
  const warnings = [];
  const normalizedEntries = [];

  const formatImportMapLocation = (importMapIndex) => {
    return importMapIndex === null
      ? targetPath
      : `${targetPath} importmap[${importMapIndex}]`;
  };

  for (const { importMap, importMapIndex } of importMaps) {
    if ("scopes" in importMap) {
      warnings.push({
        type: "unsupported-scopes",
        message: `${formatImportMapLocation(importMapIndex)} contains \`scopes\`, which are not yet supported.`,
      });
    }

    const imports = importMap.imports ?? {};

    for (const [key, value] of Object.entries(imports)) {
      if (typeof value !== "string") {
        warnings.push({
          type: "invalid-entry",
          message: `Ignoring non-string import value for key ${JSON.stringify(key)} in ${formatImportMapLocation(importMapIndex)}.`,
        });
        continue;
      }

      normalizedEntries.push({
        key,
        keyKind: classifyKey(key),
        value,
        importMapIndex,
        sourcePath: targetPath,
        integrity: isObjectRecord(importMap.integrity)
          ? importMap.integrity
          : null,
      });
    }
  }

  if (normalizedEntries.length === 0) {
    warnings.push({
      type: "no-supported-entries",
      message: `No supported import entries were found in ${targetPath}.`,
    });
  }

  return { normalizedEntries, warnings };
};

const tryParseUrl = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const extractVersionedPackage = (firstSegment, scopeSegment = null) => {
  const versionSeparatorIndex = firstSegment.lastIndexOf("@");

  if (versionSeparatorIndex <= 0) {
    return null;
  }

  const packageName = scopeSegment
    ? `${scopeSegment}/${firstSegment.slice(0, versionSeparatorIndex)}`
    : firstSegment.slice(0, versionSeparatorIndex);
  const currentVersion = firstSegment.slice(versionSeparatorIndex + 1);

  if (!packageName || !currentVersion) {
    return null;
  }

  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(currentVersion)) {
    return null;
  }

  return { currentVersion, packageName };
};

const parseJsdelivrPackage = (parsedUrl) => {
  // jsDelivr ESM package URL shapes are documented at https://www.jsdelivr.com/esm
  const segments = parsedUrl.pathname.split("/").filter(Boolean);

  if (segments[0] !== "npm" || segments.length < 2) {
    return null;
  }

  if (segments[1].startsWith("@")) {
    if (segments.length < 3) {
      return null;
    }

    return extractVersionedPackage(segments[2], segments[1]);
  }

  return extractVersionedPackage(segments[1]);
};

const parseEsmShPackage = (parsedUrl) => {
  // esm.sh package URL shapes are documented at https://esm.sh/
  const segments = parsedUrl.pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  if (segments[0].startsWith("@")) {
    if (segments.length < 2) {
      return null;
    }

    return extractVersionedPackage(segments[1], segments[0]);
  }

  return extractVersionedPackage(segments[0]);
};

const parseSupportedPackageFromUrl = (value) => {
  const parsedUrl = tryParseUrl(value);

  if (!parsedUrl) {
    return null;
  }

  if (parsedUrl.hostname === "cdn.jsdelivr.net") {
    const parsedPackage = parseJsdelivrPackage(parsedUrl);

    return parsedPackage
      ? { ...parsedPackage, cdnFamily: "jsdelivr" }
      : {
          cdnFamily: "jsdelivr",
          currentVersion: null,
          packageName: null,
        };
  }

  if (parsedUrl.hostname === "esm.sh") {
    const parsedPackage = parseEsmShPackage(parsedUrl);

    return parsedPackage
      ? { ...parsedPackage, cdnFamily: "esm.sh" }
      : {
          cdnFamily: "esm.sh",
          currentVersion: null,
          packageName: null,
        };
  }

  return null;
};

const parseDependencyPins = (value) => {
  const parsedUrl = tryParseUrl(value);

  if (!parsedUrl || parsedUrl.hostname !== "esm.sh") {
    return [];
  }

  const dependencies = parsedUrl.searchParams.get("deps");

  if (!dependencies) {
    return [];
  }

  return dependencies
    .split(",")
    .map((dependency) => dependency.trim())
    .filter(Boolean)
    .map((dependency) => {
      if (dependency.startsWith("@")) {
        const slashIndex = dependency.indexOf("/");

        if (slashIndex === -1) {
          return null;
        }

        return extractVersionedPackage(
          dependency.slice(slashIndex + 1),
          dependency.slice(0, slashIndex),
        );
      }

      return extractVersionedPackage(dependency);
    });
};

const collectPackageOccurrences = (entries) => {
  const warnings = [];
  const occurrences = [];

  for (const entry of entries) {
    const parsed = parseSupportedPackageFromUrl(entry.value);

    if (!parsed) {
      continue;
    }

    if (!parsed?.packageName || !parsed.currentVersion) {
      warnings.push({
        type: "unparseable-entry",
        message: `Could not parse package identity and version from ${JSON.stringify(entry.value)} for key ${JSON.stringify(entry.key)}.`,
      });
      continue;
    }

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
    });

    for (const dependencyPin of parseDependencyPins(entry.value)) {
      if (!dependencyPin?.packageName || !dependencyPin.currentVersion) {
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
        importMapIndex: entry.importMapIndex,
        integrity: entry.integrity,
        key: `${entry.key}?deps`,
        keyKind: entry.keyKind,
        packageName: dependencyPin.packageName,
        sourcePath: entry.sourcePath,
      });
    }
  }

  return { occurrences, warnings };
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

const parseLatestVersionOverrides = () => {
  const raw = process.env.ECU_TEST_LATEST_VERSIONS;

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);

    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const defaultResolveLatestVersion = async (packageName) => {
  const overrides = parseLatestVersionOverrides();

  if (overrides && typeof overrides[packageName] === "string") {
    return overrides[packageName];
  }

  const encodedPackage = packageName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const response = await fetch(`https://registry.npmjs.org/${encodedPackage}`);

  if (!response.ok) {
    throw new Error(`npm registry request failed with ${response.status}`);
  }

  const body = await response.json();
  const latestVersion = body?.["dist-tags"]?.latest;

  if (typeof latestVersion !== "string" || latestVersion.length === 0) {
    throw new Error("npm registry response did not include dist-tags.latest");
  }

  return latestVersion;
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

export const analyzeTarget = async (targetPath, options = {}) => {
  const resolveLatestVersion =
    options.resolveLatestVersion ?? defaultResolveLatestVersion;
  const importMaps = await loadImportMaps(targetPath);
  const { normalizedEntries, warnings: normalizationWarnings } =
    normalizeImportMaps(targetPath, importMaps);
  const { occurrences, warnings: parseWarnings } =
    collectPackageOccurrences(normalizedEntries);

  const groupedPackages = groupByPackage(occurrences);
  const lookupFailures = [];
  const notes = [];
  const packageResults = [];

  for (const packageGroup of groupedPackages.values()) {
    const currentVersions = [
      ...new Set(packageGroup.occurrences.map((item) => item.currentVersion)),
    ].sort(compareVersions);

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

    packageResults.push({
      currentVersions,
      hasUpdate,
      latestVersion,
      packageName: packageGroup.packageName,
      severity: hasUpdate
        ? determineSeverity(currentVersions[0], latestVersion)
        : null,
    });
  }

  packageResults.sort((left, right) =>
    left.packageName.localeCompare(right.packageName),
  );

  return {
    lookupFailures,
    notes,
    packageResults,
    targetPath,
    warnings: [...normalizationWarnings, ...parseWarnings],
  };
};
