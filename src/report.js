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

const formatLatestVersion = (currentVersions, latestVersion, colorEnabled) => {
  if (currentVersions.length !== 1) {
    return latestVersion;
  }

  const currentParts = currentVersions[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const latestParts = latestVersion
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const changedIndex = latestParts.findIndex((part, index) => {
    return part !== (currentParts[index] ?? 0);
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

export const formatReport = (report, options = {}) => {
  const colorEnabled =
    options.colorEnabled ??
    (Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined);
  const lines = ["esm-check-updates", `Target: ${report.targetPath}`];
  const updates = report.packageResults.filter((result) => result.hasUpdate);
  const updateLines = [];

  if (updates.length === 0) {
    updateLines.push("No updates are available.");
  } else {
    const packageWidth = Math.max(
      ...updates.map((update) => update.packageName.length),
      "Package".length,
    );
    const currentWidth = Math.max(
      ...updates.map((update) => update.currentVersions.join(", ").length),
      "Current".length,
    );
    const latestWidth = Math.max(
      ...updates.map((update) => update.latestVersion.length),
      "Latest".length,
    );

    updateLines.push(
      ...createTableHeader(
        [
          { text: "Package", width: packageWidth },
          { text: "Current", width: currentWidth },
          { text: "Latest", width: latestWidth },
        ],
        colorEnabled,
      ),
    );

    for (const update of updates) {
      const latestText = formatLatestVersion(
        update.currentVersions,
        update.latestVersion,
        colorEnabled,
      );

      updateLines.push(
        createTableRow(
          [
            {
              text: colorize(
                update.packageName,
                getSeverityColor(update.severity),
                colorEnabled,
              ),
              width: packageWidth,
            },
            { text: update.currentVersions.join(", "), width: currentWidth },
            { text: latestText, width: latestWidth },
          ],
          colorEnabled,
        ),
      );
    }
  }

  appendSection(lines, "Updates", updateLines, colorEnabled);

  const currentPackages = report.packageResults.filter(
    (result) => !result.hasUpdate,
  );
  const currentLines = [];

  if (currentPackages.length > 0) {
    const packageWidth = Math.max(
      ...currentPackages.map((current) => current.packageName.length),
      "Package".length,
    );
    const currentWidth = Math.max(
      ...currentPackages.map(
        (current) => current.currentVersions.join(", ").length,
      ),
      "Current".length,
    );
    const latestWidth = Math.max(
      ...currentPackages.map((current) => current.latestVersion.length),
      "Latest".length,
    );

    currentLines.push(
      ...createTableHeader(
        [
          { text: "Package", width: packageWidth },
          { text: "Current", width: currentWidth },
          { text: "Latest", width: latestWidth },
        ],
        colorEnabled,
      ),
    );

    for (const current of currentPackages) {
      currentLines.push(
        createTableRow(
          [
            { text: current.packageName, width: packageWidth },
            { text: current.currentVersions.join(", "), width: currentWidth },
            { text: current.latestVersion, width: latestWidth },
          ],
          colorEnabled,
        ),
      );
    }
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
