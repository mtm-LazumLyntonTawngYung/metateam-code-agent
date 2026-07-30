import { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
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
};

type LogEntry =
  | { kind: "query"; text: string }
  | { kind: "tool_call"; toolName: string; args: Record<string, unknown>; agent?: boolean }
  | { kind: "tool_result"; result: ToolResult }
  | { kind: "message"; text: string; color?: string };

export default function ChatView({
  query,
  onBack,
  requestTool,
  activeAgentId,
  isAgentRunning,
  agentLogs,
  onFreeformInput,
}: ChatViewProps) {
  const theme = useTheme();
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
  const showingAgent = isAgentRunning || agentLogs.length > 0;

  useInput((_input, key) => {
    if (key.escape && !busy) onBack();
  });

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

      if (cmd === "/read" && rest[0]) {
        setBusy(true);
        result = await requestTool("read_file", {
          path: rest[0],
          offset: rest[1] ? Number(rest[1]) : undefined,
          limit: rest[2] ? Number(rest[2]) : undefined,
        });
        setBusy(false);
      } else if (cmd === "/write" && rest[0] && rest.slice(1).length > 0) {
        setBusy(true);
        result = await requestTool("write_file", {
          path: rest[0],
          content: rest.slice(1).join(" "),
        });
        setBusy(false);
      } else if (cmd === "/edit" && rest[0] && rest[1]) {
        setBusy(true);
        result = await requestTool("edit_file", {
          path: rest[0],
          targetString: rest[1],
          replacement: rest.slice(2).join(" "),
        });
        setBusy(false);
      } else if (cmd === "/bash" && rest.length > 0) {
        setBusy(true);
        result = await requestTool("run_bash", { command: rest.join(" ") });
        setBusy(false);
      } else if (cmd === "/glob" && rest[0]) {
        setBusy(true);
        result = await requestTool("glob_files", {
          pattern: rest[0],
          path: rest[1] || undefined,
        });
        setBusy(false);
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
      } else if (cmd === "/subagent" && rest[0]) {
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
      } else {
        result = {
          success: false,
          error:
            "Usage: /read path [offset] [limit] | /write path content | /edit path target replacement | /bash cmd | /glob pattern | /call toolName {jsonArgs} | /subagent name /read ...",
        };
      }

      setLogs((prev) => [...prev, { kind: "tool_result", result }]);
    },
    [busy, isAgentRunning, requestTool, onFreeformInput],
  );

  const allEntries = showingAgent ? agentLogs : logs;
  const displayEntries = allEntries.filter(
    (l) => l.kind === "tool_result" || l.kind === "query" || l.kind === "message",
  );

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color={theme.colors.primary}>
          {"\u25b6"} {query}
        </Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.colors.muted}
        paddingX={1}
        paddingY={1}
        flexGrow={1}
      >
        {displayEntries.length === 0 || (displayEntries.length === 1 && isAgentRunning) ? (
          <Text color={theme.colors.muted}>{"\u25b0"} thinking...</Text>
        ) : (
          displayEntries.slice(1).map((entry, i) => {
            if (entry.kind === "message") {
              return (
                <Box key={i}>
                  <Text color={entry.color ?? theme.colors.muted}>
                    {entry.text}
                  </Text>
                </Box>
              );
            }
            if (entry.kind === "tool_result") {
              return (
                <Box key={i} flexDirection="column">
                  {entry.result.success ? (
                    <>
                      <Text color={theme.colors.success}>
                        {"\u2713"} OK
                      </Text>
                      {entry.result.data && (
                        <Box paddingLeft={2}>
                          <Text color={theme.colors.text}>
                            {JSON.stringify(entry.result.data, null, 2).slice(
                              0,
                              600,
                            )}
                          </Text>
                        </Box>
                      )}
                    </>
                  ) : (
                    <Text color={theme.colors.error}>
                      {"\u2717"} {entry.result.error ?? "Failed"}
                    </Text>
                  )}
                </Box>
              );
            }
            return null;
          })
        )}
      </Box>

      {(busy || isAgentRunning) && (
        <Box marginTop={1}>
          <Text color={theme.colors.warning}>{"\u25b0"} {isAgentRunning ? "agent is thinking..." : "executing..."}</Text>
        </Box>
      )}

      <Box marginTop={1} backgroundColor="#222" paddingX={1} paddingY={0}>
        <Text color="blue">&gt; </Text>
        <TextInput
          value={toolInput}
          onChange={setToolInput}
          onSubmit={handleToolSubmit}
          placeholder={isAgentRunning ? "agent is thinking..." : busy ? "working..." : "type a message or /command"}
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
