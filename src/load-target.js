import { readFile } from "node:fs/promises";
import path from "node:path";

const IMPORTMAP_SCRIPT_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const ATTRIBUTE_PATTERN =
  /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

export const isObjectRecord = (value) => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const createAnalysisError = (message) => {
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

export const loadImportMaps = async (targetPath) => {
  const extension = path.extname(targetPath).toLowerCase();
  const content = await readFile(targetPath, "utf8");

  if (extension === ".json") {
    const importMap = parseJsonDocument(content, targetPath);
    validateImportMapShape(importMap, targetPath);

    return [{ importMap, importMapIndex: null }];
  }

  return extractHtmlImportMaps(content, targetPath);
};

export const normalizeImportMaps = (targetPath, importMaps) => {
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
