import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Box, Text, useInput, useWindowSize } from "ink";
import TextInput from "ink-text-input";
import { useTheme } from "./theme";
import { getSubagents, runSubagent, getAgentById } from "../agents/index";
import type { ToolResult } from "../tools/schema";
import { onWheel } from "./mouse";

type ChatViewProps = {
  query: string;
  onBack: () => void;
  requestTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  activeAgentId: string;
  isAgentRunning: boolean;
  agentLogs: LogEntry[];
  onFreeformInput: (text: string) => void;
  queuedCount: number;
};

type LogEntry =
  | { kind: "query"; text: string }
  | { kind: "tool_call"; toolName: string; args: Record<string, unknown>; agent?: boolean }
  | { kind: "tool_result"; result: ToolResult }
  | { kind: "message"; text: string; color?: string }
  | { kind: "status"; agentName: string; modelName: string; duration: number }
  | { kind: "reasoning"; text: string };

type CommandHandler = {
  validate: (args: string[]) => boolean;
  toolName: string;
  mapArgs: (args: string[]) => Record<string, unknown>;
};

const COMMAND_HANDLERS: Record<string, CommandHandler> = {
  "/read": {
    validate: (args) => args.length >= 1,
    toolName: "read_file",
    mapArgs: ([path, offset, limit]) => ({
      path,
      offset: offset ? Number(offset) : undefined,
      limit: limit ? Number(limit) : undefined,
    }),
  },
  "/write": {
    validate: (args) => args.length >= 2,
    toolName: "write_file",
    mapArgs: ([path, ...rest]) => ({
      path,
      content: rest.join(" "),
    }),
  },
  "/edit": {
    validate: (args) => args.length >= 2,
    toolName: "edit_file",
    mapArgs: ([path, target, ...rest]) => ({
      path,
      targetString: target,
      replacement: rest.join(" "),
    }),
  },
  "/bash": {
    validate: (args) => args.length >= 1,
    toolName: "run_bash",
    mapArgs: (args) => ({ command: args.join(" ") }),
  },
  "/glob": {
    validate: (args) => args.length >= 1,
    toolName: "glob_files",
    mapArgs: ([pattern, path]) => ({
      pattern,
      path: path || undefined,
    }),
  },
  "/call": {
    validate: (args) => args.length >= 1,
    toolName: "", // dynamic
    mapArgs: () => ({}), // handled inline
  },
};

const USAGE_TEXT =
  "Usage: /read path [offset] [limit] | /write path content | /edit path target replacement | /bash cmd | /glob pattern | /call toolName {jsonArgs} | /subagent name /read ...";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const HEADER_HEIGHT = 3; // query header + border top + padding
const FOOTER_HEIGHT = 4; // status bar + input + padding + help line
const VISIBLE_LOG_LINES = 20;

function clip(text: string, maxLen = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > maxLen ? t.slice(0, maxLen) + "\u2026" : t;
}

function toolCallSummary(name: string, args: Record<string, unknown>): string {
  if (name === "read_file" || name === "write_file" || name === "edit_file") {
    return args.path ? `${name} ${clip(String(args.path), 60)}` : name;
  }
  if (name === "run_bash") return `${name} ${clip(String(args.command ?? ""), 60)}`;
  if (name === "glob_files") return `${name} ${clip(String(args.pattern ?? ""), 60)}`;
  return name;
}

function resultSummary(result: ToolResult): string {
  if (!result.success) return `\u2717 ${clip(result.error ?? "Failed", 160)}`;
  const d = result.data;
  if (d && typeof d === "object") {
    const o = d as Record<string, unknown>;
    if (typeof o.totalLines === "number") return `\u2713 ${o.totalLines} lines`;
    if (typeof o.count === "number") return `\u2713 ${o.count} files`;
    if (typeof o.bytesWritten === "number") return `\u2713 ${o.bytesWritten} bytes`;
    if (typeof o.replacedCount === "number") return `\u2713 ${o.replacedCount} replaced`;
    if ("exitCode" in o) {
      const first = typeof o.stdout === "string" && o.stdout ? ` \u00b7 ${clip(o.stdout.split("\n")[0], 60)}` : "";
      return `\u2713 exit ${String(o.exitCode)}${first}`;
    }
  }
  if (typeof d === "string") return `\u2713 ${clip(d, 120)}`;
  if (d === null || d === undefined) return "\u2713 done";
  return `\u2713 ${clip(String(d), 120)}`;
}

type FlatLine = {
  key: string;
  text: string;
  arrow?: "user" | "system";
  color?: string;
  error?: boolean;
  muted?: boolean;
  indent?: boolean;
};

function flattenEntries(entries: LogEntry[]): FlatLine[] {
  const lines: FlatLine[] = [];
  let seq = 0;
  let msgSeq = 0;
  let prevKind = "";
  const push = (text: string, extra: Partial<FlatLine> = {}) => {
    lines.push({ key: `${seq++}`, text, ...extra });
  };
  const spacer = () => {
    if (lines.length > 0 && lines[lines.length - 1].text !== "") push("");
  };
  for (const entry of entries) {
    if (entry.kind === "query") {
      if (prevKind) spacer();
      entry.text.split("\n").forEach((t, i) => push(t, { arrow: "user", indent: i > 0 }));
      prevKind = "query";
    } else if (entry.kind === "message") {
      if (prevKind) spacer();
      entry.text.split("\n").forEach((t, i) => push(t, {
        arrow: i === 0 ? "system" : undefined,
        color: entry.color,
        indent: i > 0,
      }));
      msgSeq++;
      prevKind = "message";
    } else if (entry.kind === "tool_call") {
      if (prevKind !== "tool") spacer();
      if (entry.toolName !== "input") {
        push(`\u2318 ${toolCallSummary(entry.toolName, entry.args)}`, { muted: true });
      }
      prevKind = "tool";
    } else if (entry.kind === "tool_result") {
      if (prevKind !== "tool") spacer();
      push(resultSummary(entry.result), {
        indent: true,
        ...(entry.result.success ? { muted: true } : { error: true }),
      });
      prevKind = "tool";
    } else if (entry.kind === "status") {
      if (prevKind) spacer();
      const secs = (entry.duration / 1000).toFixed(1);
      push(`\u25a3  ${entry.agentName} \u00b7 ${entry.modelName} \u00b7 ${secs}s`, { muted: true });
      prevKind = "status";
    } else if (entry.kind === "reasoning") {
      if (prevKind) spacer();
      push(`\u29d9 ${entry.text}`, { muted: true });
      prevKind = "reasoning";
    }
  }
  return lines;
}

export default function ChatView({
  query,
  onBack,
  requestTool,
  activeAgentId,
  isAgentRunning,
  agentLogs,
  onFreeformInput,
  queuedCount,
}: ChatViewProps) {
  const theme = useTheme();
  const { rows } = useWindowSize();
  const [logs, setLogs] = useState<LogEntry[]>([
    { kind: "query", text: query },
    {
      kind: "message",
      text: isAgentRunning ? "Agent is thinking..." : "Commands: /read /write /edit /bash /glob /call /subagent",
      color: theme.colors.muted,
    },
  ]);
  const [toolInput, setToolInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const showingAgent = isAgentRunning || agentLogs.length > 0;

  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  const savedInputRef = useRef("");

  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);

  useEffect(() => {
    if (!isAgentRunning && !busy) return;
    const id = setInterval(() => {
      setSpinnerFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(id);
  }, [isAgentRunning, busy]);

  const spinner = SPINNER_FRAMES[spinnerFrame];

  const maxVisibleLogLines = useMemo(() => {
    const available = rows - HEADER_HEIGHT - FOOTER_HEIGHT;
    return Math.max(available, VISIBLE_LOG_LINES);
  }, [rows]);

  const allEntries = showingAgent ? agentLogs : logs;

  const flatLines = useMemo(
    () => flattenEntries(allEntries),
    [allEntries],
  );
  const maxScrollTop = Math.max(0, flatLines.length - maxVisibleLogLines);

  useEffect(() => {
    if (stickToBottom) {
      setScrollTop(maxScrollTop);
    } else {
      setScrollTop((s) => Math.min(s, maxScrollTop));
    }
  }, [flatLines.length, maxScrollTop, stickToBottom]);

  useInput((_input, key) => {
    if (key.escape && !busy) onBack();
    if (key.upArrow) {
      const currentInput = toolInput;
      const hist = historyRef.current;
      if (hist.length === 0) return;
      const matches = currentInput ? hist.filter((h) => h.startsWith(currentInput)) : [...hist];
      if (matches.length === 0) return;
      const currentIdx = historyIndexRef.current;
      const isSynced = currentIdx >= 0 && currentIdx < hist.length && hist[currentIdx] === currentInput;
      if (!isSynced || currentIdx < 0) {
        savedInputRef.current = currentInput;
        const newestMatch = matches[matches.length - 1];
        const newIndex = hist.lastIndexOf(newestMatch);
        setHistoryIndex(newIndex);
        setToolInput(newestMatch);
      } else {
        const currentMatchIdx = matches.indexOf(currentInput);
        if (currentMatchIdx > 0) {
          const olderMatch = matches[currentMatchIdx - 1];
          const newIndex = hist.lastIndexOf(olderMatch);
          setHistoryIndex(newIndex);
          setToolInput(olderMatch);
        }
      }
    }
    if (key.downArrow) {
      const currentInput = toolInput;
      const hist = historyRef.current;
      const currentIdx = historyIndexRef.current;
      if (currentIdx < 0) return;
      const matches = currentInput ? hist.filter((h) => h.startsWith(currentInput)) : [...hist];
      if (matches.length === 0) {
        setHistoryIndex(-1);
        setToolInput(savedInputRef.current);
        return;
      }
      const currentHistItem = hist[currentIdx];
      if (currentHistItem !== currentInput) {
        const newestMatch = matches[matches.length - 1];
        const newIndex = hist.lastIndexOf(newestMatch);
        setHistoryIndex(newIndex);
        setToolInput(newestMatch);
        return;
      }
      const currentMatchIdx = matches.indexOf(currentInput);
      if (currentMatchIdx < matches.length - 1) {
        const newerMatch = matches[currentMatchIdx + 1];
        const newIndex = hist.lastIndexOf(newerMatch);
        setHistoryIndex(newIndex);
        setToolInput(newerMatch);
      } else {
        setHistoryIndex(-1);
        setToolInput(savedInputRef.current);
      }
    }
    if (key.pageUp) {
      setStickToBottom(false);
      setScrollTop((s) => Math.max(0, s - maxVisibleLogLines));
    }
    if (key.pageDown) {
      const next = Math.min(maxScrollTop, scrollTop + maxVisibleLogLines);
      setScrollTop(next);
      setStickToBottom(next === maxScrollTop);
    }
    if (key.home) {
      setStickToBottom(false);
      setScrollTop(0);
    }
    if (key.end) {
      setScrollTop(maxScrollTop);
      setStickToBottom(true);
    }
  });

  const scrollTopRef = useRef(scrollTop);
  scrollTopRef.current = scrollTop;
  const maxScrollTopRef = useRef(maxScrollTop);
  maxScrollTopRef.current = maxScrollTop;

  useEffect(() => {
    const off = onWheel((event) => {
      const step = event.direction === "up" ? -3 : 3;
      const next = Math.max(0, Math.min(maxScrollTopRef.current, scrollTopRef.current + step));
      setScrollTop(next);
      setStickToBottom(next >= maxScrollTopRef.current);
    });
    return off;
  }, []);

  const visibleLines = flatLines.slice(scrollTop, scrollTop + maxVisibleLogLines);

  const handleToolSubmit = useCallback(
    async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || busy || isAgentRunning) return;

      if (!trimmed.startsWith("/")) {
        setHistory((prev) => {
          const next = [...prev, trimmed];
          historyRef.current = next;
          return next;
        });
        setHistoryIndex(-1);
        setToolInput("");
        onFreeformInput(trimmed);
        return;
      }

      setHistory((prev) => {
        const next = [...prev, trimmed];
        historyRef.current = next;
        return next;
      });
      setHistoryIndex(-1);
      setLogs((prev) => [
        ...prev,
        { kind: "tool_call", toolName: "input", args: { line: trimmed } },
      ]);
      setToolInput("");

      const parts = trimmed.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const rest = parts.slice(1);

      let result: ToolResult;

      if (cmd === "/subagent" && rest[0]) {
        const subagentId = rest[0];
        const subQuery = rest.slice(1).join(" ");
        const agent = getAgentById(subagentId);
        if (!agent || agent.mode !== "subagent") {
          result = {
            success: false,
            error: `Unknown subagent: ${subagentId}. Available: ${getSubagents().map((a) => a.id).join(", ") || "none"}`,
          };
        } else if (!subQuery) {
          result = {
            success: false,
            error: "Usage: /subagent <name> <commands...>",
          };
        } else {
          setBusy(true);
          try {
            const subResult = await runSubagent({ agent, query: subQuery });
            result = {
              success: true,
              data: `Subagent "${agent.name}" completed in ${subResult.duration}ms (${subResult.toolCalls} tool calls)\n\n${subResult.output}`,
            };
          } catch (err) {
            result = {
              success: false,
              error: `Subagent failed: ${err instanceof Error ? err.message : String(err)}`,
            };
          }
          setBusy(false);
        }
      } else if (cmd === "/call" && rest[0]) {
        const toolName = rest[0];
        let args: Record<string, unknown>;
        try {
          args = rest.slice(1).length ? JSON.parse(rest.slice(1).join(" ")) : {};
        } catch {
          args = { input: rest.slice(1).join(" ") };
        }
        setBusy(true);
        result = await requestTool(toolName, args);
        setBusy(false);
      } else {
        const handler = COMMAND_HANDLERS[cmd];
        if (handler && handler.validate(rest)) {
          setBusy(true);
          result = await requestTool(handler.toolName, handler.mapArgs(rest));
          setBusy(false);
        } else {
          result = { success: false, error: USAGE_TEXT };
        }
      }

      setLogs((prev) => [...prev, { kind: "tool_result", result }]);
    },
    [busy, isAgentRunning, requestTool, onFreeformInput],
  );

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
      <Box flexDirection="column" flexGrow={1}>
        {visibleLines.length === 0 ? (
          <Text color={theme.colors.muted}>{spinner} thinking...</Text>
        ) : (
          visibleLines.map((line) => {
            let text = line.text;
            const arrow = line.arrow === "user"
              ? <Text color={theme.colors.primary}>{"\u25b6"} </Text>
              : line.arrow === "system"
                ? <Text color={theme.colors.secondary}>{"\u25b6"} </Text>
                : null;
            const color = line.error
              ? theme.colors.error
              : line.muted
                ? theme.colors.muted
                : line.color ?? theme.colors.text;
            return (
              <Box key={line.key} paddingLeft={line.indent ? 2 : 0}>
                {arrow}
                <Text color={color}>{text}</Text>
              </Box>
            );
          })
        )}
      </Box>

      {scrollTop > 0 && (
        <Box marginTop={1}>
          <Text color={theme.colors.muted}>
            {"\u25b2"} {scrollTop} more lines above (home to top)
          </Text>
        </Box>
      )}

      {(busy || isAgentRunning) && (
        <Box marginTop={1}>
          <Text color={theme.colors.warning}>{spinner} {isAgentRunning ? "agent is thinking..." : "executing..."}</Text>
        </Box>
      )}

      <Box marginTop={1} backgroundColor="#222" paddingX={1} paddingY={0}>
        <Text color="blue">&gt; </Text>
        <TextInput
          value={toolInput}
          onChange={setToolInput}
          onSubmit={handleToolSubmit}
          placeholder={queuedCount > 0 ? `${queuedCount} queued...` : isAgentRunning ? "agent is thinking..." : busy ? "working..." : "type a message or /command"}
        />
      </Box>

      <Box marginTop={1}>
          <Text color={theme.colors.muted}>
            <Text bold>esc</Text> back  <Text bold>↑↓</Text> history  <Text bold>end</Text> bottom  mouse wheel to scroll
          </Text>
      </Box>
    </Box>
  );
}
