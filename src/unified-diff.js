const COLORS = {
  cyan: "[36m",
  green: "[32m",
  red: "[31m",
};

const colorize = (text, color, enabled) => {
  if (!enabled) {
    return text;
  }

  return `${COLORS[color]}${text}[0m`;
};

const CONTEXT_LINES = 3;

// Split content into lines for diffing. A trailing newline should not produce a
// spurious empty final line, so we drop a single trailing "" produced by split.
const splitLines = (content) => {
  const lines = content.split("\n");

  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
};

// Classic LCS over two line arrays, returning an edit script of
// { type: "equal" | "delete" | "insert", line } entries in output order.
const diffLines = (oldLines, newLines) => {
  const rows = oldLines.length;
  const cols = newLines.length;
  const table = Array.from({ length: rows + 1 }, () =>
    new Array(cols + 1).fill(0),
  );

  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      if (oldLines[i] === newLines[j]) {
        table[i][j] = table[i + 1][j + 1] + 1;
      } else {
        table[i][j] = Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
  }

  const edits = [];
  let i = 0;
  let j = 0;

  while (i < rows && j < cols) {
    if (oldLines[i] === newLines[j]) {
      edits.push({ line: oldLines[i], type: "equal" });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      edits.push({ line: oldLines[i], type: "delete" });
      i += 1;
    } else {
      edits.push({ line: newLines[j], type: "insert" });
      j += 1;
    }
  }

  while (i < rows) {
    edits.push({ line: oldLines[i], type: "delete" });
    i += 1;
  }

  while (j < cols) {
    edits.push({ line: newLines[j], type: "insert" });
    j += 1;
  }

  return edits;
};

// Group the edit script into hunks: runs of changes plus up to CONTEXT_LINES of
// surrounding equal lines. Changes within 2*CONTEXT_LINES of each other coalesce
// into one hunk because their context windows overlap.
const buildHunks = (edits) => {
  const changeIndexes = edits
    .map((edit, index) => (edit.type === "equal" ? -1 : index))
    .filter((index) => index !== -1);

  if (changeIndexes.length === 0) {
    return [];
  }

  const ranges = [];

  for (const index of changeIndexes) {
    const start = Math.max(0, index - CONTEXT_LINES);
    const end = Math.min(edits.length - 1, index + CONTEXT_LINES);
    const last = ranges[ranges.length - 1];

    if (last && start <= last.end + 1) {
      last.end = Math.max(last.end, end);
    } else {
      ranges.push({ end, start });
    }
  }

  // Line numbers are 1-based and advance as we walk the edit script.
  let oldLine = 1;
  let newLine = 1;
  const lineNumbers = edits.map((edit) => {
    const marker = { newLine, oldLine };

    if (edit.type === "equal") {
      oldLine += 1;
      newLine += 1;
    } else if (edit.type === "delete") {
      oldLine += 1;
    } else {
      newLine += 1;
    }

    return marker;
  });

  return ranges.map((range) => {
    const slice = edits.slice(range.start, range.end + 1);
    const oldCount = slice.filter((edit) => edit.type !== "insert").length;
    const newCount = slice.filter((edit) => edit.type !== "delete").length;
    const first = lineNumbers[range.start];

    return {
      edits: slice,
      newCount,
      newStart: newCount === 0 ? first.newLine - 1 : first.newLine,
      oldCount,
      oldStart: oldCount === 0 ? first.oldLine - 1 : first.oldLine,
    };
  });
};

// Render a unified diff of `originalContent` vs `updatedContent`. Returns an
// empty string when the two are identical.
export const renderUnifiedDiff = (
  originalContent,
  updatedContent,
  filePath,
  options = {},
) => {
  const colorEnabled = options.colorEnabled ?? false;
  const oldLines = splitLines(originalContent);
  const newLines = splitLines(updatedContent);
  const edits = diffLines(oldLines, newLines);
  const hunks = buildHunks(edits);

  if (hunks.length === 0) {
    return "";
  }

  const lines = [
    colorize(`--- ${filePath}`, "red", colorEnabled),
    colorize(`+++ ${filePath}`, "green", colorEnabled),
  ];

  for (const hunk of hunks) {
    const header = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;
    lines.push(colorize(header, "cyan", colorEnabled));

    for (const edit of hunk.edits) {
      if (edit.type === "delete") {
        lines.push(colorize(`-${edit.line}`, "red", colorEnabled));
      } else if (edit.type === "insert") {
        lines.push(colorize(`+${edit.line}`, "green", colorEnabled));
      } else {
        lines.push(` ${edit.line}`);
      }
    }
  }

  return lines.join("\n");
};
