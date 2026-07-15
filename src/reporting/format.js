import { renderUnifiedDiff } from "./unified-diff.js";

const colorize = (text, color, enabled) => {
  if (!enabled) {
    return text;
  }

  const colors = {
    cyan: "\u001b[36m",
    gray: "\u001b[90m",
    lightGray: "\u001b[37m",
    green: "\u001b[32m",
    red: "\u001b[31m",
    yellow: "\u001b[33m",
  };

  return `${colors[color]}${text}\u001b[0m`;
};

const stripAnsi = (text) => {
  let result = "";
  let inEscape = false;

  for (const character of text) {
    if (!inEscape && character === "\u001b") {
      inEscape = true;
      continue;
    }

    if (inEscape) {
      if (character === "m") {
        inEscape = false;
      }
      continue;
    }

    result += character;
  }

  return result;
};

const pad = (text, width) => {
  return `${text}${" ".repeat(Math.max(width - stripAnsi(text).length, 0))}`;
};

const formatVersionSegment = (version, index, colorEnabled) => {
  const parts = version.split(".");

  return parts
    .map((part, partIndex) => {
      if (partIndex < index) {
        return part;
      }

      if (partIndex === 0) {
        return colorize(part, "red", colorEnabled);
      }

      if (partIndex === 1) {
        return colorize(part, "yellow", colorEnabled);
      }

      return colorize(part, "green", colorEnabled);
    })
    .join(".");
};

const formatLatestVersion = (resolvedVersions, latestVersion, colorEnabled) => {
  if (resolvedVersions.length !== 1) {
    return latestVersion;
  }

  const resolvedParts = resolvedVersions[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const latestParts = latestVersion
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const changedIndex = latestParts.findIndex((part, index) => {
    return part !== (resolvedParts[index] ?? 0);
  });

  if (changedIndex === -1) {
    return latestVersion;
  }

  return formatVersionSegment(latestVersion, changedIndex, colorEnabled);
};

const appendSection = (lines, heading, bodyLines, colorEnabled) => {
  if (bodyLines.length === 0) {
    return;
  }

  if (lines.length > 0) {
    lines.push("");
  }

  lines.push(colorize(`## ${heading}`, "cyan", colorEnabled));
  lines.push(...bodyLines);
};

// Shared trailing sections for the update and dry-run summaries. Rendered in a
// fixed order: Warnings, Lookup Failures, Stripped integrity entries, Notes.
const appendAncillarySections = (
  lines,
  { lookupFailures, notes, strippedIntegrityEntries, warnings },
  colorEnabled,
) => {
  // Stripped-integrity warnings are appended to the aggregate warnings list but
  // render in their own subsection below. Filter them out of the top-level
  // Warnings section to avoid double-listing.
  const analyzerWarnings = warnings.filter((warning) => {
    return !(
      warning.type === "integrity-strip" ||
      (typeof warning.message === "string" &&
        warning.message.startsWith("Stripped integrity entry for"))
    );
  });

  if (analyzerWarnings.length > 0) {
    appendSection(
      lines,
      "Warnings",
      analyzerWarnings.map((warning) => `- ${warning.message}`),
      colorEnabled,
    );
  }

  if (lookupFailures.length > 0) {
    appendSection(
      lines,
      "Lookup Failures",
      lookupFailures.map((failure) => `- ${failure.message}`),
      colorEnabled,
    );
  }

  if (strippedIntegrityEntries && strippedIntegrityEntries.length > 0) {
    appendSection(
      lines,
      "Stripped integrity entries",
      strippedIntegrityEntries.map(
        (entry) => `- ${entry.url} (triggered by ${entry.packageName})`,
      ),
      colorEnabled,
    );
  }

  if (notes.length > 0) {
    appendSection(
      lines,
      "Notes",
      notes.map((note) => `- ${note.message}`),
      colorEnabled,
    );
  }
};

const createTableHeader = (columns, colorEnabled) => {
  const delimiter = colorize(" | ", "gray", colorEnabled);
  const header = columns.map(({ text, width }) => {
    return colorize(pad(text, width), "lightGray", colorEnabled);
  });
  const rule = columns.map(({ width }) => {
    return colorize("-".repeat(width), "gray", colorEnabled);
  });

  return [header.join(delimiter), rule.join(delimiter)];
};

const createTableRow = (columns, colorEnabled) => {
  const delimiter = colorize(" | ", "gray", colorEnabled);

  return columns
    .map(({ text, width }) => {
      return pad(text, width);
    })
    .join(delimiter);
};

const getSeverityColor = (severity) => {
  if (severity === "major") {
    return "red";
  }

  if (severity === "minor") {
    return "yellow";
  }

  return "green";
};

const FALLBACK_WIDTH = 120;
const MIN_SOURCE_WIDTH = 20;
const SOURCE_CONTINUATION_INDENT = 2;
const DELIMITER_VISIBLE_WIDTH = 3;

const resolveAvailableWidth = (options) => {
  if (typeof options.width === "number") {
    return options.width;
  }

  return FALLBACK_WIDTH;
};

const wrapSourceLabel = (label, sourceWidth) => {
  const indent = SOURCE_CONTINUATION_INDENT;
  const firstWidth = sourceWidth;
  const continuationWidth = sourceWidth - indent;
  const words = label.split(" ");
  const lines = [];
  let current = "";
  let currentIsFirst = true;

  const flush = () => {
    if (current.length > 0) {
      lines.push(current);
      current = "";
      currentIsFirst = false;
    }
  };

  const maxWidth = () => {
    return currentIsFirst ? firstWidth : continuationWidth;
  };

  for (const word of words) {
    const wordLen = stripAnsi(word).length;

    if (wordLen > maxWidth()) {
      flush();
      let remaining = word;

      while (remaining.length > 0) {
        const width = currentIsFirst ? firstWidth : continuationWidth;

        lines.push(remaining.slice(0, width));
        remaining = remaining.slice(width);
        currentIsFirst = false;
      }

      continue;
    }

    const proposed = current.length > 0 ? `${current} ${word}` : word;

    if (stripAnsi(proposed).length <= maxWidth()) {
      current = proposed;
    } else {
      flush();
      current = word;
    }
  }

  flush();

  return lines.map((line, index) => {
    const stripped = stripAnsi(line);

    if (index === 0 || stripped.startsWith(" ".repeat(indent))) {
      return line;
    }

    return `${" ".repeat(indent)}${line}`;
  });
};

const formatSourceDisplayLabel = (source, colorEnabled) => {
  return `${source.importMapKey} ${colorize(
    `(${source.cdnSpec})`,
    "gray",
    colorEnabled,
  )}`;
};

const renderSourceCell = (sources, sourceWidth, colorEnabled) => {
  const labels = sources.map((source) =>
    formatSourceDisplayLabel(source, colorEnabled),
  );
  const joined = labels.join(", ");

  if (stripAnsi(joined).length <= sourceWidth) {
    return [joined];
  }

  const lines = [];

  for (const label of labels) {
    lines.push(...wrapSourceLabel(label, sourceWidth));
  }

  return lines;
};

const createContinuationPrefix = (widths, colorEnabled) => {
  return widths
    .map((width) => " ".repeat(width))
    .join(colorize(" | ", "gray", colorEnabled));
};

const renderPackageRow = (result, widths, colorEnabled) => {
  const {
    latestWidth,
    packageWidth,
    resolvedWidth,
    sourceWidth,
    sourcesEnabled,
  } = widths;
  const specifierSuffix =
    result.specifiers && result.specifiers.length > 0
      ? ` (${result.specifiers.join(", ")})`
      : "";
  const packageText = result.severity
    ? `${colorize(
        result.packageName,
        getSeverityColor(result.severity),
        colorEnabled,
      )}${specifierSuffix}`
    : `${result.packageName}${specifierSuffix}`;
  const resolvedText = result.resolvedVersions.join(", ");
  const latestText = result.hasUpdate
    ? formatLatestVersion(
        result.resolvedVersions,
        result.latestVersion,
        colorEnabled,
      )
    : result.latestVersion;

  if (!sourcesEnabled) {
    return [
      createTableRow(
        [
          { text: packageText, width: packageWidth },
          { text: resolvedText, width: resolvedWidth },
          { text: latestText, width: latestWidth },
        ],
        colorEnabled,
      ),
    ];
  }

  const sourceLines =
    result.sources && result.sources.length > 0
      ? renderSourceCell(result.sources, sourceWidth, colorEnabled)
      : [""];

  const lines = [];

  for (let index = 0; index < sourceLines.length; index += 1) {
    const sourceLine = sourceLines[index];

    if (index === 0) {
      lines.push(
        createTableRow(
          [
            { text: packageText, width: packageWidth },
            { text: resolvedText, width: resolvedWidth },
            { text: latestText, width: latestWidth },
            { text: sourceLine, width: sourceWidth },
          ],
          colorEnabled,
        ),
      );
    } else {
      lines.push(
        `${createContinuationPrefix([packageWidth, resolvedWidth, latestWidth], colorEnabled)}${colorize(" | ", "gray", colorEnabled)}${sourceLine}`,
      );
    }
  }

  return lines;
};

const renderTableSection = (results, widths, colorEnabled) => {
  const columnNames = widths.sourcesEnabled
    ? [
        { text: "Package", width: widths.packageWidth },
        { text: "Resolved", width: widths.resolvedWidth },
        { text: "Latest", width: widths.latestWidth },
        { text: "Source", width: widths.sourceWidth },
      ]
    : [
        { text: "Package", width: widths.packageWidth },
        { text: "Resolved", width: widths.resolvedWidth },
        { text: "Latest", width: widths.latestWidth },
      ];

  const sectionLines = [...createTableHeader(columnNames, colorEnabled)];

  for (const result of results) {
    sectionLines.push(...renderPackageRow(result, widths, colorEnabled));
  }

  return sectionLines;
};

const packageDisplayLength = (result) => {
  const specifierSuffix =
    result.specifiers && result.specifiers.length > 0
      ? ` (${result.specifiers.join(", ")})`
      : "";

  return `${result.packageName}${specifierSuffix}`.length;
};

const computeSectionWidths = (results, sourcesEnabled, availableWidth) => {
  const packageWidth = Math.max(
    ...results.map((result) => packageDisplayLength(result)),
    "Package".length,
  );
  const resolvedWidth = Math.max(
    ...results.map((result) => result.resolvedVersions.join(", ").length),
    "Resolved".length,
  );
  const latestWidth = Math.max(
    ...results.map((result) => result.latestVersion.length),
    "Latest".length,
  );

  if (!sourcesEnabled || results.length === 0) {
    return { latestWidth, packageWidth, resolvedWidth, sourcesEnabled };
  }

  const usedWidth =
    packageWidth + resolvedWidth + latestWidth + DELIMITER_VISIBLE_WIDTH * 3;
  const sourceWidth = Math.max(MIN_SOURCE_WIDTH, availableWidth - usedWidth);

  return {
    latestWidth,
    packageWidth,
    resolvedWidth,
    sourceWidth,
    sourcesEnabled,
  };
};

export const formatReport = (report, options = {}) => {
  const colorEnabled = options.colorEnabled ?? false;
  const sourcesEnabled = options.sourcesEnabled ?? false;
  const availableWidth = sourcesEnabled
    ? resolveAvailableWidth(options)
    : undefined;
  const lines = ["importmap-check", `Target: ${report.targetPath}`];
  const updates = report.packageResults.filter((result) => result.hasUpdate);
  const updateLines = [];

  if (updates.length === 0) {
    updateLines.push("No updates are available.");
  } else {
    const widths = computeSectionWidths(
      updates,
      sourcesEnabled,
      availableWidth,
    );

    updateLines.push(...renderTableSection(updates, widths, colorEnabled));
  }

  appendSection(lines, "Updates", updateLines, colorEnabled);

  const currentPackages = report.packageResults.filter(
    (result) => !result.hasUpdate,
  );
  const currentLines = [];

  if (currentPackages.length > 0) {
    const widths = computeSectionWidths(
      currentPackages,
      sourcesEnabled,
      availableWidth,
    );

    currentLines.push(
      ...renderTableSection(currentPackages, widths, colorEnabled),
    );
  }

  appendSection(lines, "Current", currentLines, colorEnabled);

  if (report.warnings.length > 0) {
    appendSection(
      lines,
      "Warnings",
      report.warnings.map((warning) => `- ${warning.message}`),
      colorEnabled,
    );
  }

  if (report.lookupFailures.length > 0) {
    appendSection(
      lines,
      "Lookup Failures",
      report.lookupFailures.map((failure) => `- ${failure.message}`),
      colorEnabled,
    );
  }

  if (report.notes.length > 0) {
    appendSection(
      lines,
      "Notes",
      report.notes.map((note) => `- ${note.message}`),
      colorEnabled,
    );
  }

  return lines.join("\n");
};

const formatRewrittenRow = (rewrite, colorEnabled) => {
  const specSuffix = rewrite.oldSpecifier ? ` ${rewrite.oldSpecifier}` : "";
  const packageLabel = `${rewrite.packageName}${specSuffix}`;
  const before = rewrite.oldSpecifier || rewrite.currentVersion;
  const after = rewrite.newSpecifier;
  const arrow = colorEnabled ? "\u001b[36m\u2192\u001b[0m" : "\u2192";

  return `  ${packageLabel}  ${before} ${arrow} ${after}`;
};

const dedupeRewritesByNameAndSpecifier = (rewrites) => {
  // Multiple occurrences of the same package with the same specifier produce
  // identical before/after rows. The post-rewrite summary should list each
  // unique transformation once, sorted by package name.
  const seen = new Set();
  const deduped = [];

  for (const rewrite of rewrites) {
    const key = `${rewrite.packageName}\0${rewrite.oldSpecifier}\0${rewrite.newSpecifier}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(rewrite);
  }

  deduped.sort((left, right) =>
    left.packageName.localeCompare(right.packageName),
  );

  return deduped;
};

export const formatUpdateSummary = (rewrite, report, options = {}) => {
  const colorEnabled = options.colorEnabled ?? false;

  if (rewrite.noChanges) {
    // No entries were rewritten, but analyzer notes/warnings (e.g. dist-tag
    // floating notices, destination-skew, unparseable entries) still need to
    // surface so the user knows what the analyzer saw.
    const lines = ["No changes to write."];

    appendAncillarySections(
      lines,
      {
        lookupFailures: rewrite.lookupFailures,
        notes: rewrite.notes,
        strippedIntegrityEntries: rewrite.strippedIntegrityEntries,
        warnings: report.warnings,
      },
      colorEnabled,
    );

    return lines.join("\n");
  }

  const lines = [`Updated ${rewrite.targetPath}:`, ""];

  const deduped = dedupeRewritesByNameAndSpecifier(rewrite.rewrites);

  for (const entry of deduped) {
    lines.push(formatRewrittenRow(entry, colorEnabled));
  }

  appendAncillarySections(
    lines,
    {
      lookupFailures: rewrite.lookupFailures,
      notes: rewrite.notes,
      strippedIntegrityEntries: rewrite.strippedIntegrityEntries,
      warnings: report.warnings,
    },
    colorEnabled,
  );

  return lines.join("\n");
};

// Dry-run preview: the same plan `--update` would apply, rendered as a unified
// diff with no file write. The diff replaces the update summary's before/after
// rows; the ancillary sections are carried through unchanged.
export const formatDryRunSummary = (plan, report, options = {}) => {
  const colorEnabled = options.colorEnabled ?? false;

  if (plan.noChanges) {
    const lines = ["No changes would be written."];

    appendAncillarySections(
      lines,
      {
        lookupFailures: plan.lookupFailures,
        notes: plan.notes,
        strippedIntegrityEntries: plan.strippedIntegrityEntries,
        warnings: report.warnings,
      },
      colorEnabled,
    );

    return lines.join("\n");
  }

  const diff = renderUnifiedDiff(
    plan.originalContent,
    plan.updatedContent,
    plan.targetPath,
    { colorEnabled },
  );
  const lines = ["Dry run — no files written.", "", diff];

  appendAncillarySections(
    lines,
    {
      lookupFailures: plan.lookupFailures,
      notes: plan.notes,
      strippedIntegrityEntries: plan.strippedIntegrityEntries,
      warnings: report.warnings,
    },
    colorEnabled,
  );

  return lines.join("\n");
};
