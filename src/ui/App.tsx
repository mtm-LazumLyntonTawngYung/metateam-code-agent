import { useState, useCallback, useRef, useEffect } from "react";
import { Box, useInput, useWindowSize } from "ink";
import HomeScreen from "./Home";
import ChatView from "./ChatView";
import AgentSelector from "./AgentSelector";
import CommandPalette from "./CommandPalette";
import ConnectForm from "./ConnectForm";
import PermissionPrompt from "./PermissionPrompt";
import Statusbar from "./components/Statusbar";
import { executeTool } from "../tools/index";
import { isSensitiveTool } from "../tools/permissions";
import { startAll, stopAll, getConnectedCount } from "../mcp/index";
import {
  initAgents,
  setActiveAgent,
  getActiveAgent,
  getAllAgents,
  isToolDenied,
  runAgentLoop,
} from "../agents/index";
import { checkForUpdates } from "../utils/updater";
import { ensureTelemetryConfig } from "../config";
import {
  trackSessionStart,
  trackSessionEnd,
  trackModelUsage,
  setSessionId,
} from "../telemetry/tracker";
import { createSession } from "../session/history";
import { theme } from "./theme";
import type { ToolResult } from "../tools/schema";
import type { PendingPermission } from "../tools/permissions";
import type { AgentDefinition } from "../agents/types";
import type { UpdateInfo } from "../utils/updater";
import type { AgentUpdate } from "../agents/agent-loop";

type LogEntry =
  | { kind: "query"; text: string }
  | { kind: "tool_call"; toolName: string; args: Record<string, unknown>; agent?: boolean }
  | { kind: "tool_result"; result: ToolResult }
  | { kind: "message"; text: string; color?: string };

type View = "home" | "chat" | "connect";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [showAgents, setShowAgents] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [pendingPerm, setPendingPerm] = useState<PendingPermission | null>(
    null,
  );
  const alwaysAllow = useRef(new Set<string>());
  const { columns, rows } = useWindowSize();
  const [mcpCount, setMcpCount] = useState(0);
  const [activeAgentId, setActiveAgentId] = useState<string>("build");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentLogs, setAgentLogs] = useState<LogEntry[]>([]);
  const activeAgentRef = useRef<AgentDefinition | null>(null);

  useEffect(() => {
    const agentId = initAgents();
    setActiveAgentId(agentId);
    activeAgentRef.current = getActiveAgent();

    const telem = ensureTelemetryConfig();
    if (telem.enabled) {
      const sid = createSession("mtc-session");
      setSessionId(sid);
      trackSessionStart();
      trackModelUsage("deepseek-v4-flash-free", 0);
    }

    startAll().then(() => setMcpCount(getConnectedCount()));
    checkForUpdates().then(setUpdateInfo);
    return () => {
      trackSessionEnd();
      stopAll();
    };
  }, []);

  const switchAgent = useCallback((id: string) => {
    const agent = setActiveAgent(id);
    if (agent) {
      setActiveAgentId(agent.id);
      activeAgentRef.current = agent;
    }
  }, []);

  useInput((_input, key) => {
    if (pendingPerm) return;
    if (key.escape) {
      if (showAgents) {
        setShowAgents(false);
        return;
      }
      if (showCommands) {
        setShowCommands(false);
        setQuery("");
        return;
      }
      if (view !== "home") {
        setView("home");
        return;
      }
      return;
    }
    if (key.tab && view === "home" && !showAgents && !showCommands) {
      setShowAgents(true);
      return;
    }
    if (
      key.ctrl &&
      _input === "p" &&
      view === "home" &&
      !showAgents &&
      !showCommands
    ) {
      setShowCommands(true);
      return;
    }
  });

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (value.startsWith("/") && !showCommands) {
      setShowCommands(true);
    }
  }, [showCommands]);

  const requestToolExecution = useCallback(
    async (
      name: string,
      args: Record<string, unknown>,
    ): Promise<ToolResult> => {
      const agent = activeAgentRef.current;
      if (agent && isToolDenied(name, agent)) {
        return {
          success: false,
          error: `Tool "${name}" is denied by the current agent (${agent.name})`,
        };
      }
      if (!isSensitiveTool(name) || alwaysAllow.current.has(name)) {
        return executeTool(name, args);
      }
      return new Promise<ToolResult>((resolve) => {
        setPendingPerm({ toolName: name, args, resolve });
      });
    },
    [],
  );

  const handlePermissionResponse = useCallback(
    async (response: "accept" | "reject" | "always") => {
      const p = pendingPerm;
      if (!p) return;
      setPendingPerm(null);
      if (response === "always") alwaysAllow.current.add(p.toolName);
      if (response === "reject") {
        p.resolve({ success: false, error: "Permission rejected by user" });
        return;
      }
      const result = await executeTool(p.toolName, p.args);
      p.resolve(result);
    },
    [pendingPerm],
  );

  const startAgentLoop = useCallback(
    async (text: string, agent: AgentDefinition) => {
      setAgentBusy(true);
      setAgentLogs([{ kind: "query", text }]);

      const onUpdate = (update: AgentUpdate) => {
        switch (update.kind) {
          case "text":
            setAgentLogs((prev) => [
              ...prev,
              { kind: "message", text: update.content, color: theme.colors.text },
            ]);
            break;
          case "tool_call":
            setAgentLogs((prev) => [
              ...prev,
              {
                kind: "tool_call",
                toolName: update.toolCall.name,
                args: update.toolCall.args,
                agent: true,
              },
            ]);
            break;
          case "tool_result":
            setAgentLogs((prev) => [
              ...prev,
              { kind: "tool_result", result: update.result },
            ]);
            break;
          case "done":
            setAgentLogs((prev) => [
              ...prev,
              {
                kind: "message",
                text: `Completed in ${update.duration}ms (${update.toolCalls} tool calls)`,
                color: theme.colors.muted,
              },
            ]);
            setAgentBusy(false);
            break;
          case "error":
            setAgentLogs((prev) => [
              ...prev,
              {
                kind: "message",
                text: `Error: ${update.error}`,
                color: theme.colors.error,
              },
            ]);
            setAgentBusy(false);
            break;
        }
      };

      await runAgentLoop(text, agent, [], onUpdate, requestToolExecution);
    },
    [requestToolExecution],
  );

  const handleSubmit = (value: string) => {
    if (value.startsWith("/")) {
      if (value === "/connect" || value.startsWith("/connect ")) {
        setView("connect");
        setQuery("");
        return;
      }
      if (value === "/agent" || value.startsWith("/agent ")) {
        const parts = value.split(/\s+/);
        if (parts.length > 1) {
          switchAgent(parts[1]);
          return;
        }
        setShowAgents(true);
        return;
      }
      setShowCommands(true);
      return;
    }
    const trimmed = value.trim();
    if (trimmed) {
      setQuery(trimmed);
      setView("chat");
      const agent = activeAgentRef.current ?? getActiveAgent();
      if (agent) {
        startAgentLoop(trimmed, agent);
      }
    }
  };

  const handleFreeformInput = useCallback(
    (text: string) => {
      const agent = activeAgentRef.current ?? getActiveAgent();
      if (agent) {
        setAgentLogs((prev) => [
          ...prev,
          { kind: "query", text },
        ]);
        startAgentLoop(text, agent);
      }
    },
    [startAgentLoop],
  );

  const handleSelectAgent = (id: string) => {
    switchAgent(id);
    setShowAgents(false);
  };

  const handleSelectCommand = (id: string) => {
    setShowCommands(false);
    setQuery("");
    if (id === "connect") setView("connect");
    if (id === "exit") process.exit(0);
    if (id.startsWith("agent-")) {
      switchAgent(id.slice(6));
    }
  };

  const handleConnectSave = () => setView("home");

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {pendingPerm ? (
        <PermissionPrompt
          pending={{
            toolName: pendingPerm.toolName,
            args: pendingPerm.args,
            onResponse: handlePermissionResponse,
          }}
        />
      ) : view === "home" && !showAgents && !showCommands ? (
        <HomeScreen
          query={query}
          onQueryChange={handleQueryChange}
          onSubmit={handleSubmit}
          updateInfo={updateInfo}
        />
      ) : null}

      {!pendingPerm && showAgents && (
        <AgentSelector
          agents={getAllAgents()}
          currentId={activeAgentId}
          onSelect={handleSelectAgent}
        />
      )}
      {!pendingPerm && showCommands && (
        <CommandPalette
          onSelect={handleSelectCommand}
          initialFilter={query.startsWith("/") ? query.slice(1) : undefined}
        />
      )}
      {!pendingPerm && view === "chat" && (
        <ChatView
          query={query}
          onBack={() => setView("home")}
          requestTool={requestToolExecution}
          activeAgentId={activeAgentId}
          isAgentRunning={agentBusy}
          agentLogs={agentLogs}
          onFreeformInput={handleFreeformInput}
        />
      )}
      {!pendingPerm && view === "connect" && (
        <ConnectForm onSave={handleConnectSave} />
      )}

      {!pendingPerm && (
        <Statusbar
          mcpCount={mcpCount}
          agentName={
            activeAgentRef.current?.name ?? getActiveAgent()?.name ?? "Build"
          }
          agentId={activeAgentId}
          latestVersion={updateInfo?.hasUpdate ? updateInfo.latestVersion : null}
        />
      )}
    </Box>
  );
}
