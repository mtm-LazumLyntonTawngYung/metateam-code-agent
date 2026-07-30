import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Box, useInput, useWindowSize } from "ink";
import HomeScreen from "./Home";
import ChatView from "./ChatView";
import AgentSelector from "./AgentSelector";
import CommandPalette from "./CommandPalette";
import ConnectForm from "./ConnectForm";
import PermissionPrompt from "./PermissionPrompt";
import Statusbar from "./components/Statusbar";
import { AppLayout } from "./AppLayout";
import { Sidebar } from "./components/Sidebar";
import { executeTool } from "../tools/index";
import { isSensitiveTool } from "../tools/permissions";
import { startAll, stopAll, getConnectedCount, getConnectedServers } from "../mcp/index";
import {
  initAgents,
  setActiveAgent,
  getActiveAgent,
  getAllAgents,
  getAgentById,
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
import { countTokens, DEFAULT_BUDGET } from "../session/tokens";
import { getCurrentBranch } from "./git";
import LoginScreen from "./LoginScreen";
import { isAuthenticated, getAuth, clearAuth } from "../auth/index";
import { theme } from "./theme";
import { cleanExit } from "./clean-exit";
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
  const [gitBranch, setGitBranch] = useState<string | undefined>(undefined);
  const [authenticated, setAuthenticated] = useState(isAuthenticated);
  const [authEmail, setAuthEmail] = useState(() => getAuth()?.userEmail ?? "");
  const [authName, setAuthName] = useState(() => getAuth()?.userName ?? "");

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
    setGitBranch(getCurrentBranch() ?? undefined);
    const onExit = () => {
      try { process.stdout.write('\x1b[2J\x1b[3J\x1b[H'); } catch {}
    };
    process.on('exit', onExit);
    return () => {
      process.off('exit', onExit);
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
    if (key.tab && !showAgents && !showCommands) {
      setShowAgents(true);
      return;
    }
    if (
      key.ctrl &&
      _input === "p" &&
      !showAgents &&
      !showCommands
    ) {
      setShowCommands(true);
      return;
    }
    if (_input === "/" && !showAgents && !showCommands) {
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
      if (value === "/logout") {
        clearAuth();
        setAuthenticated(false);
        setAuthEmail("");
        setAuthName("");
        setView("home");
        setQuery("");
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
    const agent = getAgentById(id);
    if (agent && agent.mode === "subagent") {
      setQuery(`/subagent ${id} `);
    } else {
      switchAgent(id);
    }
    setShowAgents(false);
  };

  const handleSelectCommand = (id: string) => {
    setShowCommands(false);
    setQuery("");
    if (id === "connect") setView("connect");
    if (id === "exit") cleanExit();
    if (id.startsWith("agent-")) {
      switchAgent(id.slice(6));
    }
    if (id === "logout") {
      clearAuth();
      setAuthenticated(false);
      setAuthEmail("");
      setAuthName("");
    }
  };

  const handleConnectSave = () => setView("home");

  const handleLogin = useCallback(() => {
    setAuthenticated(true);
    const auth = getAuth();
    if (auth) {
      setAuthEmail(auth.userEmail);
      setAuthName(auth.userName ?? "");
    }
  }, []);

  const handleSkip = useCallback(() => {
    setAuthenticated(true);
  }, []);

  const sidebarData = useMemo(() => {
    const tokenSum = agentLogs.reduce((acc, entry) => {
      if (entry.kind === "message" || entry.kind === "query") {
        return acc + countTokens(entry.text);
      }
      return acc;
    }, 0);
    const mcpServers = getConnectedServers().map((name) => ({
      name,
      status: "connected" as const,
    }));
    const contextPercent = Math.round((tokenSum / DEFAULT_BUDGET.maxTokens) * 100) || 0;
    return {
      sessionTitle: query || "New Session",
      tokenCount: tokenSum,
      maxContextTokens: DEFAULT_BUDGET.maxTokens,
      costSpent: 0,
      mcpServers,
      lspStatus: { enabled: false, activeCount: 0 },
      currentPath: process.cwd(),
      gitBranch,
      authEmail: authEmail || undefined,
      authName: authName || undefined,
    };
  }, [agentLogs, query, gitBranch, authEmail, authName]);

  const footerRight = `${sidebarData.tokenCount.toLocaleString()} (${Math.round((sidebarData.tokenCount / sidebarData.maxContextTokens) * 100)}%)  ctrl+p commands`;

  const sidebar = <Sidebar {...sidebarData} />;

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {!authenticated ? (
        <LoginScreen onLogin={handleLogin} onSkip={handleSkip} onExit={cleanExit} />
      ) : pendingPerm ? (
        <PermissionPrompt
          pending={{
            toolName: pendingPerm.toolName,
            args: pendingPerm.args,
            onResponse: handlePermissionResponse,
          }}
        />
      ) : view === "home" && !showAgents && !showCommands ? (
        <>
          <HomeScreen
            query={query}
            onQueryChange={handleQueryChange}
            onSubmit={handleSubmit}
            updateInfo={updateInfo}
            agentName={activeAgentRef.current?.name ?? getActiveAgent()?.name ?? "Build"}
          />
          <Statusbar
            mcpCount={mcpCount}
            agentName={activeAgentRef.current?.name ?? getActiveAgent()?.name ?? "Build"}
            agentId={activeAgentId}
            latestVersion={updateInfo?.hasUpdate ? updateInfo.latestVersion : null}
          />
        </>
      ) : (
        <AppLayout
          sidebarComponent={sidebar}
          footerLeft={process.cwd()}
          footerRight={footerRight}
        >
          {showAgents && (
            <AgentSelector
              agents={getAllAgents()}
              currentId={activeAgentId}
              onSelect={handleSelectAgent}
            />
          )}
          {!showAgents && showCommands && (
            <CommandPalette
              onSelect={handleSelectCommand}
              initialFilter={query.startsWith("/") ? query.slice(1) : undefined}
            />
          )}
          {!showAgents && !showCommands && view === "chat" && (
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
          {!showAgents && !showCommands && view === "connect" && (
            <ConnectForm onSave={handleConnectSave} />
          )}
        </AppLayout>
      )}
    </Box>
  );
}
