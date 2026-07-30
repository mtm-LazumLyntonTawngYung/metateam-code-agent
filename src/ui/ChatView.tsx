import { useState, useCallback, useEffect, useMemo } from "react";
import { Box, Text, useInput, useWindowSize } from "ink";
import TextInput from "ink-text-input";
import { useTheme } from "./theme";
import { getSubagents, runSubagent, getAgentById } from "../agents/index";
import type { ToolResult } from "../tools/schema";

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
  | { kind: "status"; agentName: string; modelName: string; duration: number };

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

function truncateText(text: string, maxLines: number): string[] {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return lines;
  const truncated = lines.slice(0, maxLines - 1);
  truncated.push(`... (${lines.length - maxLines + 1} more lines)`);
  return truncated;
}

function formatData(data: unknown, maxLines: number): string[] {
  if (typeof data === "string") return truncateText(data, maxLines);
  if (data === null || data === undefined) return [];
  const formatted = typeof data === "object"
    ? JSON.stringify(data, null, 2)
    : String(data);
  return truncateText(formatted, maxLines);
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
      text: isAgentRunning ? "Agent is thinking..." : "Commands: /read /write /edit /bash /glob /call /subagent /agent",
      color: theme.colors.muted,
    },
  ]);
  const [toolInput, setToolInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const showingAgent = isAgentRunning || agentLogs.length > 0;

  useEffect(() => {
    if (!isAgentRunning && !busy) return;
    const id = setInterval(() => {
      setSpinnerFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(id);
  }, [isAgentRunning, busy]);

  const spinner = SPINNER_FRAMES[spinnerFrame];

  useInput((_input, key) => {
    if (key.escape && !busy) onBack();
  });

  const maxVisibleLogLines = useMemo(() => {
    const available = rows - HEADER_HEIGHT - FOOTER_HEIGHT;
    return Math.max(available, VISIBLE_LOG_LINES);
  }, [rows]);

  const handleToolSubmit = useCallback(
    async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || busy || isAgentRunning) return;

      if (!trimmed.startsWith("/")) {
        setToolInput("");
        onFreeformInput(trimmed);
        return;
      }

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
      } else if (cmd === "/agent" && rest[0]) {
        result = {
          success: false,
          error: "Switch agents from the home screen with Tab or /agent",
        };
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

  const allEntries = showingAgent ? agentLogs : logs;
  const displayEntries = allEntries.filter(
    (l) => l.kind === "tool_result" || l.kind === "query" || l.kind === "message" || l.kind === "tool_call" || l.kind === "status",
  );

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
      <Box flexDirection="column" flexGrow={1}>
        {displayEntries.length === 0 ? (
          <Text color={theme.colors.muted}>{spinner} thinking...</Text>
        ) : (
          displayEntries.map((entry, i) => {
            if (entry.kind === "query") {
              return (
                <Box key={i}>
                  <Text color={theme.colors.text}>{entry.text}</Text>
                </Box>
              );
            }
            if (entry.kind === "message") {
              return (
                <Box key={i}>
                  <Text color={theme.colors.text}>{entry.text}</Text>
                </Box>
              );
            }
            if (entry.kind === "tool_call") {
              return (
                <Box key={i}>
                  <Text color={theme.colors.muted}>+ Thought</Text>
                </Box>
              );
            }
            if (entry.kind === "tool_result") {
              const dataLines = entry.result.data ? formatData(entry.result.data, maxVisibleLogLines) : [];
              return (
                <Box key={i} flexDirection="column">
                  {entry.result.success ? (
                    dataLines.length > 0 ? (
                      <Box paddingLeft={2} flexDirection="column">
                        {dataLines.map((line, j) => (
                          <Text key={j} color={theme.colors.text}>{line}</Text>
                        ))}
                      </Box>
                    ) : null
                  ) : (
                    <Text color={theme.colors.error}>
                      {"\u2717"} {entry.result.error ?? "Failed"}
                    </Text>
                  )}
                </Box>
              );
            }
            if (entry.kind === "status") {
              const secs = (entry.duration / 1000).toFixed(1);
              return (
                <Box key={i}>
                  <Text color={theme.colors.muted}>{"\u25a3"}  {entry.agentName} · {entry.modelName} · {secs}s</Text>
                </Box>
              );
            }
            return null;
          })
        )}
      </Box>

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
          <Text bold>esc</Text> back
        </Text>
      </Box>
    </Box>
  );
}
