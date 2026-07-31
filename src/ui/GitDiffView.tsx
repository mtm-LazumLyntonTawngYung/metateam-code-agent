import { useEffect, useState } from "react";
import { Box, Text, useInput, useWindowSize, useStdin } from "ink";
import { execSync } from "child_process";
import { useTheme } from "./theme";

type Side = "old" | "new" | "both";

type SplitLine = {
  oldText: string;
  newText: string;
  side: Side;
  oldLineNum?: number;
  newLineNum?: number;
};

type DiffFile = {
  fileName: string;
  hunks: SplitLine[][];
};

function parseUnifiedDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  let currentFile: DiffFile | null = null;
  let currentHunk: SplitLine[] | null = null;
  let oldLines: { text: string; num: number }[] = [];
  let newLines: { text: string; num: number }[] = [];
  let oldStart = 0, newStart = 0;
  let inStaged = false, inUnstaged = false;

  for (const line of raw.split("\n")) {
    if (line.startsWith("STAGED CHANGES:")) { inStaged = true; inUnstaged = false; continue; }
    if (line.startsWith("UNSTAGED CHANGES:")) { inUnstaged = true; inStaged = false; continue; }
    if (!line.trim()) continue;

    if (line.startsWith("diff --git ")) {
      if (currentHunk && currentFile) {
        currentFile.hunks.push(alignHunk(oldLines, newLines, oldStart, newStart));
      }
      if (currentFile && currentFile.fileName) files.push(currentFile);
      const m = line.match(/diff --git a\/(.+?) b\//);
      currentFile = { fileName: m ? m[1] : "unknown", hunks: [] };
      currentHunk = null;
      oldLines = []; newLines = [];
      continue;
    }
    if (line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) continue;

    const hunkMatch = line.match(/^@@ -(\d+),?\d* \+(\d+),?\d* @@/);
    if (hunkMatch) {
      if (currentHunk && currentFile) {
        currentFile.hunks.push(alignHunk(oldLines, newLines, oldStart, newStart));
      }
      currentHunk = [];
      oldLines = []; newLines = [];
      oldStart = parseInt(hunkMatch[1], 10);
      newStart = parseInt(hunkMatch[2], 10);
      continue;
    }

    if (!currentFile) continue;

    if (line.startsWith("+")) {
      newLines.push({ text: line.slice(1), num: newStart + newLines.length });
    } else if (line.startsWith("-")) {
      oldLines.push({ text: line.slice(1), num: oldStart + oldLines.length });
    } else {
      oldLines.push({ text: line, num: oldStart + oldLines.length });
      newLines.push({ text: line, num: newStart + newLines.length });
    }
  }

  if (currentHunk && currentFile) {
    currentFile.hunks.push(alignHunk(oldLines, newLines, oldStart, newStart));
  }
  if (currentFile && currentFile.fileName) files.push(currentFile);

  return files;
}

function alignHunk(
  oldLines: { text: string; num: number }[],
  newLines: { text: string; num: number }[],
  oldStart: number,
  newStart: number,
): SplitLine[] {
  const result: SplitLine[] = [];
  let oi = 0, ni = 0;
  let oldNum = oldStart, newNum = newStart;

  while (oi < oldLines.length || ni < newLines.length) {
    const o = oldLines[oi];
    const n = newLines[ni];

    if (o && n && o.text === n.text) {
      result.push({ oldText: o.text, newText: n.text, side: "both", oldLineNum: o.num, newLineNum: n.num });
      oi++; ni++;
    } else if (o && (!n || o.text !== n.text) && (ni >= newLines.length || newLines.slice(ni).every(x => x.text !== o.text))) {
      result.push({ oldText: o.text, newText: "", side: "old", oldLineNum: o.num });
      oi++;
    } else if (n && (!o || n.text !== o.text) && (oi >= oldLines.length || oldLines.slice(oi).every(x => x.text !== n.text))) {
      result.push({ oldText: "", newText: n.text, side: "new", newLineNum: n.num });
      ni++;
    } else if (o && n) {
      result.push({ oldText: o.text, newText: "", side: "old", oldLineNum: o.num });
      result.push({ oldText: "", newText: n.text, side: "new", newLineNum: n.num });
      oi++; ni++;
    } else if (o) {
      result.push({ oldText: o.text, newText: "", side: "old", oldLineNum: o.num });
      oi++;
    } else if (n) {
      result.push({ oldText: "", newText: n.text, side: "new", newLineNum: n.num });
      ni++;
    }
  }

  return result;
}

export default function GitDiffView({ onBack }: { onBack: () => void }) {
  const theme = useTheme();
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fileIndex, setFileIndex] = useState(0);
  const [scroll, setScroll] = useState(0);
  const { columns } = useWindowSize();
  const { stdin, setRawMode } = useStdin();

  useInput((_input, key) => {
    if (key.escape) { onBack(); return; }
    if (key.upArrow) setScroll((s) => Math.max(0, s - 1));
    if (key.downArrow) setScroll((s) => s + 1);
    if (key.leftArrow) setFileIndex((i) => Math.max(0, i - 1));
    if (key.rightArrow) setFileIndex((i) => Math.min(files.length - 1, i + 1));
  });

  useEffect(() => {
    try {
      const staged = execSync("git diff --cached --no-color", { encoding: "utf-8", maxBuffer: 200 * 200 }).trim();
      const unstaged = execSync("git diff --no-color", { encoding: "utf-8", maxBuffer: 200 * 200 }).trim();
      let combined = "";
      if (staged) combined += "STAGED CHANGES:\n" + staged + "\n";
      if (unstaged) combined += "UNSTAGED CHANGES:\n" + unstaged;
      if (!combined) {
        setError("No changes — working tree clean");
      } else {
        setFiles(parseUnifiedDiff(combined));
      }
    } catch (e: any) {
      setError(e.stderr ?? e.message ?? "Failed to run git diff");
    }
  }, []);

  useEffect(() => {
    if (!stdin || !setRawMode) return;
    process.stdout.write("\x1b[?1000h\x1b[?1002h\x1b[?1006h");
    const handler = (data: Buffer) => {
      const s = data.toString();
      const m = s.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
      if (m) {
        const btn = parseInt(m[1], 10);
        if (btn === 64) setScroll((s) => Math.max(0, s - 3));
        if (btn === 65) setScroll((s) => s + 3);
      }
    };
    stdin.on("data", handler);
    return () => {
      stdin.off("data", handler);
      process.stdout.write("\x1b[?1006l\x1b[?1002l\x1b[?1000l");
    };
  }, [stdin, setRawMode]);

  if (error) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box justifyContent="center"><Text color={theme.colors.muted}>{error}</Text></Box>
        <Box marginTop={1}>
          <Text color={theme.colors.muted}><Text bold>esc</Text> back</Text>
        </Box>
      </Box>
    );
  }

  if (files.length === 0) return null;

  const file = files[fileIndex];
  const allLines = file.hunks.flat();
  const visible = allLines.slice(scroll, scroll + 30);
  const halfWidth = Math.floor((columns - 4) / 2);
  const lineNumWidth = 4;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box>
        <Text bold color={theme.colors.text}>
          {file.fileName}
        </Text>
        <Text color={theme.colors.muted}>
          {"  "}{fileIndex + 1}/{files.length}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Box width={halfWidth + 1}>
            <Text bold color={theme.colors.muted}>{"\u2502"} old</Text>
          </Box>
          <Box width={halfWidth}>
            <Text bold color={theme.colors.muted}>{"\u2502"} new</Text>
          </Box>
        </Box>

        <Box flexDirection="column">
          {visible.map((line, i) => {
            const padLeft = (s: string, w: number) => s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);

            const oldNum = line.oldLineNum != null ? String(line.oldLineNum) : "";
            const newNum = line.newLineNum != null ? String(line.newLineNum) : "";

            const oldColor = line.side === "old" ? theme.colors.error : line.side === "both" ? theme.colors.text : theme.colors.muted;
            const newColor = line.side === "new" ? theme.colors.success : line.side === "both" ? theme.colors.text : theme.colors.muted;

            const oldContent = padLeft(oldNum, lineNumWidth) + " " + line.oldText;
            const newContent = padLeft(newNum, lineNumWidth) + " " + line.newText;

            return (
              <Box key={scroll + i} height={1}>
                <Box width={halfWidth + 1}>
                  <Text color={oldColor}>{oldContent}</Text>
                </Box>
                <Box width={halfWidth}>
                  <Text color={newColor}>{newContent}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color={theme.colors.muted}>
          {"\u2190\u2192"} file  {"\u2191\u2193"} scroll  <Text bold>esc</Text> back
        </Text>
      </Box>
    </Box>
  );
}
