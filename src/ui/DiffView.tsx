import { readFileSync } from "fs";
import { Box, Text } from "ink";
import { theme } from "./theme";

type DiffLine = { kind: "same" | "add" | "remove"; text: string };

function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ kind: "same", text: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ kind: "add", text: newLines[j - 1] });
      j--;
    } else {
      result.push({ kind: "remove", text: oldLines[i - 1] });
      i--;
    }
  }
  result.reverse();
  return result;
}

type DiffViewProps = {
  filePath: string;
  targetString: string;
  replacement: string;
  contextLines?: number;
};

export default function DiffView({
  filePath,
  targetString,
  replacement,
  contextLines = 3,
}: DiffViewProps) {
  let oldContent: string;
  try {
    oldContent = readFileSync(filePath, "utf-8");
  } catch {
    oldContent = "";
  }
  const newContent = oldContent.includes(targetString)
    ? oldContent.replaceAll(targetString, replacement)
    : oldContent + replacement;

  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  const fullDiff = computeDiff(oldLines, newLines);

  const changeIndices = fullDiff.reduce<number[]>((acc, line, i) => {
    if (line.kind !== "same") acc.push(i);
    return acc;
  }, []);

  if (changeIndices.length === 0) {
    return (
      <Box>
        <Text color={theme.colors.muted}>No changes detected</Text>
      </Box>
    );
  }

  const firstChange = Math.max(0, changeIndices[0] - contextLines);
  const lastChange = Math.min(
    fullDiff.length - 1,
    changeIndices[changeIndices.length - 1] + contextLines,
  );

  const windowed = fullDiff
    .slice(firstChange, lastChange + 1)
    .filter((line, i, arr) => {
      if (line.kind !== "same") return true;
      const prev = arr[i - 1];
      const next = arr[i + 1];
      if (prev && prev.kind !== "same") return true;
      if (next && next.kind !== "same") return true;
      return false;
    });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={theme.colors.text}>
        {"\u2501"} {filePath}
      </Text>
      {windowed.map((line, i) => {
        const prefix = line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " ";
        const color =
          line.kind === "add"
            ? theme.colors.success
            : line.kind === "remove"
              ? theme.colors.error
              : theme.colors.muted;
        return (
          <Box key={i}>
            <Text color={color}>
              {prefix} {line.text}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

export { computeDiff };
