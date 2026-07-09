import { chmod, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { createAnalysisError } from "./load-target.js";
import { rewriteSpecifier } from "./rewrite-specifier.js";

const escapeRegex = (text) => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const replaceUrlSpecifier = (url, newSpecifier) => {
  // Scope the version-`@` search to the PATH portion (before any `?` query
  // string). esm.sh URLs can carry `?deps=<pkg>@<version>` pins whose `@` sits
  // after the outer package's `@`; a plain `url.lastIndexOf("@")` would land
  // on the dep pin and rewrite the wrong slot. Within the path portion, the
  // last `@` is still the outer version separator, since scoped packages
  // carry a leading `@scope/` earlier in the path.
  const questionMarkIndex = url.indexOf("?");
  const pathEnd = questionMarkIndex === -1 ? url.length : questionMarkIndex;
  const versionSeparatorIndex = url.lastIndexOf("@", pathEnd - 1);

  if (versionSeparatorIndex === -1) {
    return url;
  }

  let specifierEnd = pathEnd;
  const slashIndex = url.indexOf("/", versionSeparatorIndex + 1);

  if (slashIndex !== -1 && slashIndex < specifierEnd) {
    specifierEnd = slashIndex;
  }

  const encodedSpec = url.slice(versionSeparatorIndex + 1, specifierEnd);
  // Preserve the original encoding style: if the specifier in the URL was
  // percent-encoded, percent-encode the new specifier the same way; otherwise
  // emit the raw form (caret/tilde selectors typically appear decoded in
  // import maps even though strict URL parsing would require encoding).
  const hasPercentEncoding = encodedSpec.includes("%");
  const newEncodedSpec = hasPercentEncoding
    ? encodeURIComponent(newSpecifier)
    : newSpecifier;

  return (
    url.slice(0, versionSeparatorIndex + 1) +
    newEncodedSpec +
    url.slice(specifierEnd)
  );
};

const rewriteDestinationUrls = (content, replacements) => {
  // Sort longer URLs first so a shorter URL substring never accidentally
  // rewrites a longer URL's prefix. The surrounding-double-quote match
  // ensures we only substitute whole import-map value boundaries.
  const sorted = [...replacements]
    .filter(({ newUrl, oldUrl }) => newUrl !== oldUrl)
    .sort((left, right) => right.oldUrl.length - left.oldUrl.length);

  let updated = content;

  for (const { newUrl, oldUrl } of sorted) {
    const needle = `"${oldUrl}"`;
    const replacement = `"${newUrl}"`;
    updated = updated.split(needle).join(replacement);
  }

  return updated;
};

const stripIntegrityEntry = (content, url) => {
  // Match a single import map `integrity` property: `"url": "<hash>"`, with
  // any surrounding whitespace, optional leading comma (interior property),
  // and optional trailing comma. Removing the trailing comma when the
  // property precedes another leaves the surrounding object JSON-valid.
  const escaped = escapeRegex(`"${url}"`);
  const re = new RegExp(`[,\\s]*${escaped}\\s*:\\s*"[^"]*"\\s*,?`, "g");

  return content.replace(re, "");
};

const collectRewritesFromReport = (report) => {
  // For each package result with hasUpdate=true, walk the matching occurrences
  // from report.allOccurrences and compute the {oldUrl, newUrl} rewrite pair
  // for each occurrence. Dist-tag entries are never rewritten.
  const rewrites = [];

  for (const result of report.packageResults) {
    if (!result.hasUpdate) {
      continue;
    }

    // Skip `?deps=` query-pin occurrences: `?deps=` rewriting is deferred to
    // a follow-up change (see readme-draft / update-mode spec). Including
    // them here would target the OUTER URL's `@` slot with the dep pin's
    // rewrite value and corrupt the outer package's version.
    const occurrences = report.allOccurrences.filter(
      (occurrence) =>
        occurrence.packageName === result.packageName &&
        !occurrence.fromDepsQuery,
    );

    for (const occurrence of occurrences) {
      const newSpecifier = rewriteSpecifier(
        occurrence.specifier,
        result.latestVersion,
      );

      // Dist-tag entries and any other non-rewritable specifiers return null.
      if (newSpecifier === null) {
        continue;
      }

      const newUrl = replaceUrlSpecifier(
        occurrence.destinationUrl,
        newSpecifier,
      );

      if (newUrl === occurrence.destinationUrl) {
        // Defensive: nothing to do for no-op rewrites.
        continue;
      }

      rewrites.push({
        currentVersion: occurrence.currentVersion,
        latestVersion: result.latestVersion,
        newSpecifier,
        newUrl,
        oldSpecifier: occurrence.specifier,
        oldUrl: occurrence.destinationUrl,
        packageName: result.packageName,
      });
    }
  }

  return rewrites;
};

const collectStrippedIntegrityEntries = (report, rewrites) => {
  // For each rewrite, check whether the occurrence had an `integrity` map
  // attached (i.e. the import map contained an integrity section). If the
  // original or rewritten URL appears as a key in that map, we strip it and
  // record a hard warning.
  const stripped = [];
  const seen = new Set();

  for (const rewrite of rewrites) {
    const occurrence = report.allOccurrences.find(
      (occurrence) => occurrence.destinationUrl === rewrite.oldUrl,
    );

    if (!occurrence || !occurrence.integrity) {
      continue;
    }

    for (const url of [rewrite.oldUrl, rewrite.newUrl]) {
      if (occurrence.integrity[url] && !seen.has(url)) {
        seen.add(url);
        stripped.push({
          message: `Stripped integrity entry for ${url} (triggered by ${rewrite.packageName}).`,
          packageName: rewrite.packageName,
          url,
        });
      }
    }
  }

  return stripped;
};

export const rewriteTargetInPlace = async (targetPath, report) => {
  const rewrites = collectRewritesFromReport(report);

  if (rewrites.length === 0) {
    return {
      lookupFailures: report.lookupFailures,
      notes: report.notes,
      noChanges: true,
      rewrites: [],
      strippedIntegrityEntries: [],
      targetPath,
      warnings: report.warnings,
    };
  }

  const originalContent = await readFile(targetPath, "utf8");
  const strippedIntegrityEntries = collectStrippedIntegrityEntries(
    report,
    rewrites,
  );
  const strippedUrls = new Set(
    strippedIntegrityEntries.map((entry) => entry.url),
  );

  // Strip integrity entries FIRST (keyed by the OLD URL), then apply URL
  // rewrites. If we rewrite first, the integrity block's keys would already
  // be re-keyed to the new URL by the time the stripper runs, which would
  // leave stale hashes silently migrated to new URLs.
  let strippedContent = originalContent;

  for (const url of strippedUrls) {
    strippedContent = stripIntegrityEntry(strippedContent, url);
  }

  const updatedContent = rewriteDestinationUrls(
    strippedContent,
    rewrites.map(({ newUrl, oldUrl }) => ({ newUrl, oldUrl })),
  );

  const originalStat = await stat(targetPath);
  const tempPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.ecu-${process.pid}-${Math.random().toString(36).slice(2)}.tmp`,
  );

  try {
    await writeFile(tempPath, updatedContent);
    await chmod(tempPath, originalStat.mode & 0o777);
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    const wrapped = createAnalysisError(
      `Failed to write update to ${targetPath}: ${error.message}`,
    );
    wrapped.cause = error;
    throw wrapped;
  }

  return {
    lookupFailures: report.lookupFailures,
    notes: report.notes,
    noChanges: false,
    rewrites,
    strippedIntegrityEntries,
    targetPath,
    warnings: [...report.warnings, ...strippedIntegrityEntries],
  };
};
