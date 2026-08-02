import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Box, Text, useInput, useWindowSize } from "ink";
import HomeScreen from "./Home";
import ChatView from "./ChatView";
import AgentSelector from "./AgentSelector";
import CommandPalette from "./CommandPalette";
import ConnectForm from "./ConnectForm";
import GitDiffView from "./GitDiffView";
import ModelPicker from "./ModelPicker";
import HelpOverlay from "./HelpOverlay";
import SkillsView from "./SkillsView";
import { getInstalledSkills, getAllSkills } from "../skills";
import PermissionPrompt from "./PermissionPrompt";
import Statusbar from "./components/Statusbar";
import { AppLayout } from "./AppLayout";
import { Sidebar } from "./components/Sidebar";
import { executeTool } from "../tools/index";
import { isSensitiveTool } from "../tools/permissions";
import McpsView from "./McpsView";
import VariantsView from "./VariantsView";
import { startAll, stopAll, getConnectedCount, getConnectedServers } from "../mcp";
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
  setSessionId,
  getSessionId,
} from "../telemetry/tracker";
import { reviewProject } from "../review/index";
import { getSystemStatus } from "../enterprise/index";
import { exec } from "child_process";
import { join, resolve } from "path";
import { existsSync } from "fs";
import { createSession, getMessages } from "../session/history";
import type { MessageRow } from "../session/history";
import { countTokens, DEFAULT_BUDGET } from "../session/tokens";
import { getCurrentBranch } from "./git";
import LoginScreen from "./LoginScreen";
import { isAuthenticated, getAuth, clearAuth } from "../auth/index";
import { ThemeProvider, useTheme, getTheme } from "./theme";
import { cleanExit } from "./clean-exit";
import { disableMouseMode } from "./mouse";
import ThemePicker from "./ThemePicker";
import SessionsView from "./SessionsView";
import { loadLlmConfig, findModel } from "../llm/config";
import type { ToolResult } from "../tools/schema";
import type { PendingPermission } from "../tools/permissions";
import type { AgentDefinition } from "../agents/types";
import type { UpdateInfo } from "../utils/updater";
import type { AgentUpdate } from "../agents/agent-loop";

type LogEntry =
  | { kind: "query"; text: string }
  | { kind: "tool_call"; toolName: string; args: Record<string, unknown>; agent?: boolean }
  | { kind: "tool_result"; result: ToolResult }
  | { kind: "message"; text: string; color?: string }
  | { kind: "status"; agentName: string; modelName: string; duration: number };

type View = "home" | "chat" | "connect" | "diff";

function messagesToLogs(messages: MessageRow[]): LogEntry[] {
  const logs: LogEntry[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      logs.push({ kind: "query", text: m.content });
    } else if (m.role === "assistant") {
      logs.push({ kind: "message", text: m.content });
    } else if (m.role === "tool" && m.tool_name) {
      let args: Record<string, unknown> = {};
      try {
        args = m.tool_args ? JSON.parse(m.tool_args) : {};
      } catch {}
      logs.push({ kind: "tool_call", toolName: m.tool_name, args });
      logs.push({
        kind: "tool_result",
        result: { success: true, data: m.tool_result ?? m.content },
      });
    }
  }
  return logs;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export default function App() {
  const [booted, setBooted] = useState(false);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [view, setView] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [showAgents, setShowAgents] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showMcps, setShowMcps] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);
  const [modelId, setModelId] = useState(() => {
    try { return loadLlmConfig().routing.defaultModel; }
    catch { return "deepseek-chat"; }
  });
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
const promptQueueRef = useRef<string[]>([]);
const activeAgentRef = useRef<AgentDefinition | null>(null);
const abortControllerRef = useRef<AbortController | null>(null);
  const [gitBranch, setGitBranch] = useState<string | undefined>(undefined);
  const [authenticated, setAuthenticated] = useState(isAuthenticated);
  const [authEmail, setAuthEmail] = useState(() => getAuth()?.userEmail ?? "");
  const [authName, setAuthName] = useState(() => getAuth()?.userName ?? "");
  const [notification, setNotification] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => getSessionId());
  const theme = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 3000);
    return () => clearTimeout(t);
  }, [notification]);

  useEffect(() => {
    const t = setInterval(() => {
      setSpinnerFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const agentId = initAgents();
    setActiveAgentId(agentId);
    activeAgentRef.current = getActiveAgent();

    const sid = createSession("mtc-session");
    setSessionId(sid);
    setCurrentSessionId(sid);

    const telem = ensureTelemetryConfig();
    if (telem.enabled) {
      trackSessionStart();
    }

    Promise.all([
      startAll().then(() => setMcpCount(getConnectedCount())),
      checkForUpdates().then(setUpdateInfo),
    ]).then(() => {
      setBooted(true);
    });
    setGitBranch(getCurrentBranch() ?? undefined);
    const onExit = () => {
      try { disableMouseMode(); } catch {}
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
      if (showAgents) { setShowAgents(false); return; }
      if (showCommands) { setShowCommands(false); setQuery(""); return; }
      if (showModelPicker) { setShowModelPicker(false); return; }
      if (showHelp) { setShowHelp(false); return; }
      if (showSkills) { setShowSkills(false); return; }
      if (showMcps) { setShowMcps(false); return; }
      if (showVariants) { setShowVariants(false); return; }
      if (showThemePicker) { setShowThemePicker(false); return; }
      if (showSessions) { setShowSessions(false); return; }
      if (view !== "home") { setView("home"); return; }
      return;
    }
    if (key.tab && !showAgents && !showCommands && !showModelPicker && !showHelp && !showSkills && !showMcps && !showVariants && !showThemePicker && !showSessions) {
      setShowAgents(true);
      return;
    }
    if (key.ctrl && _input === "p" && !showAgents && !showCommands && !showModelPicker && !showHelp && !showSkills && !showMcps && !showVariants && !showThemePicker && !showSessions) {
      setShowCommands(true);
      return;
    }
    if (_input === "/" && !showAgents && !showCommands && !showModelPicker && !showHelp && !showSkills && !showMcps && !showVariants && !showThemePicker && !showSessions) {
      setShowCommands(true);
      return;
    }
    if (key.ctrl && _input === "c" && agentBusy && abortControllerRef.current) {
      abortControllerRef.current.abort();
      setNotification("Aborting agent...");
      return;
    }
  });

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (value.startsWith("/") && !showCommands && !showModelPicker && !showHelp && !showSkills && !showMcps && !showVariants && !showThemePicker && !showSessions) {
      setShowCommands(true);
    }
  }, [showCommands, showModelPicker, showHelp, showSkills, showMcps, showVariants, showThemePicker, showSessions]);

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
      const t = themeRef.current;
      const modelDisplayName = findModel(modelId)?.displayName ?? modelId;
      setAgentBusy(true);
      setAgentLogs((prev) => [...prev, { kind: "query", text }]);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const skill = activeSkillId ? (getAllSkills().find((s) => s.id === activeSkillId)?.body ?? undefined) : undefined;

      const onUpdate = (update: AgentUpdate) => {
        switch (update.kind) {
          case "text":
            setAgentLogs((prev) => [
              ...prev,
              { kind: "message", text: update.content, color: t.colors.text },
            ]);
            break;
          case "stream":
            setAgentLogs((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.kind === "message") {
                next[next.length - 1] = { kind: "message", text: update.content, color: t.colors.text };
              } else {
                next.push({ kind: "message", text: update.content, color: t.colors.text });
              }
              return next;
            });
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
                kind: "status",
                agentName: update.agentName,
                modelName: modelDisplayName,
                duration: update.duration,
              },
            ]);
            setAgentBusy(false);
            abortControllerRef.current = null;
            break;
          case "error":
            setAgentLogs((prev) => [
              ...prev,
              {
                kind: "message",
                text: `Error: ${update.error}`,
                color: t.colors.error,
              },
            ]);
            setAgentBusy(false);
            abortControllerRef.current = null;
            break;
        }
      };

      await runAgentLoop(text, agent, [], onUpdate, {
        executeToolFn: requestToolExecution,
        modelId,
        sessionId: currentSessionId ?? undefined,
        skillBody: skill,
        signal: controller.signal,
        stream: true,
      });
    },
    [requestToolExecution, themeRef, modelId, currentSessionId, activeSkillId],
  );

  useEffect(() => {
    if (agentBusy || promptQueueRef.current.length === 0) return;
    const next = promptQueueRef.current.shift()!;
    const agent = activeAgentRef.current ?? getActiveAgent();
    if (agent) {
      startAgentLoop(next, agent);
    }
  }, [agentBusy, startAgentLoop]);

  const handleSubmit = (value: string) => {
    if (value.startsWith("/")) {
      if (value === "/connect" || value.startsWith("/connect ")) {
        setView("connect");
        setQuery("");
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
      if (value === "/agents" || value.startsWith("/agents ")) { setShowAgents(true); return; }
      if (value === "/diff") { setView("diff"); return; }
      if (value === "/editor") {
        const editor = process.env.EDITOR || "code";
        exec(`${editor} "${process.cwd()}"`, (err) => {
          if (err) setNotification(`Failed to open editor: ${err.message}`);
        });
        setNotification("Opening editor...");
        return;
      }
      if (value === "/help") { setShowHelp(true); return; }
      if (value === "/init") {
        setQuery(value);
        setView("chat");
        const agent = activeAgentRef.current ?? getActiveAgent();
        if (agent) {
          setAgentLogs([{ kind: "query", text: value }]);
          startAgentLoop(
            `Initialize project configuration at ${process.cwd()}. Inspect the project structure (package.json, README, source files if present), detect language/framework/package manager, then create or overwrite AGENTS.md at the project root with comprehensive rules and guidelines tailored to this stack. Also create .mtc/ with rules/ and agents/ subdirectories and appropriate config files. Use read_file, glob_files, run_bash, and write_file as needed.`,
            agent,
          );
        }
        return;
      }
      if (value === "/mcps") { setShowMcps(true); setQuery(""); return; }
      if (value === "/model" || value === "/models") { setShowModelPicker(true); return; }
      if (value === "/move" || value.startsWith("/move ")) {
        const target = value.slice(6).trim();
        if (!target) { setNotification("Usage: /move <path>"); return; }
        try {
          const resolved = resolve(target);
          const exists = existsSync(resolved);
          if (!exists) { setNotification(`Path not found: ${resolved}`); return; }
          process.chdir(resolved);
          setNotification(`Moved to ${resolved}`);
        } catch (e) {
          setNotification(`Failed: ${(e as Error).message}`);
        }
        return;
      }
      if (value === "/new") {
        const newSessionId = createSession("mtc-session");
        setSessionId(newSessionId);
        setCurrentSessionId(newSessionId);
        setAgentLogs([]);
        setQuery("");
        setView("home");
        setNotification(`New session: ${newSessionId.slice(0, 8)}`);
        return;
      }
      if (value === "/review") {
        setQuery(value);
        setView("chat");
        const agent = activeAgentRef.current ?? getActiveAgent();
        if (agent) {
          setAgentLogs([{ kind: "query", text: value }]);
          const result = reviewProject({ dir: process.cwd() });
          const text = [
            `MTC Review: ${result.passed ? "PASSED" : "FAILED"}`,
            `${result.summary.total} findings (${result.summary.critical} critical, ${result.summary.major} major, ${result.summary.minor} minor, ${result.summary.suggestion} suggestion)`,
            "",
            ...result.findings.map(f => `[${f.severity.toUpperCase()}] ${f.file}${f.line ? `:${f.line}` : ""} — ${f.message}`),
          ].join("\n");
          setAgentLogs((prev) => [...prev, {
            kind: "message",
            text,
            color: result.passed ? theme.colors.success : theme.colors.error,
          }]);
          setAgentBusy(false);
        }
        return;
      }
      if (value === "/sessions" || value === "/session") { setShowSessions(true); setQuery(""); return; }
      if (value === "/skills") { setShowSkills(true); return; }
      const skillCmd = value.slice(1);
      const matchedSkill = getInstalledSkills().find((s) => s.id === skillCmd);
      if (matchedSkill) {
        setNotification(`Running skill: ${matchedSkill.name}`);
        return;
      }
      if (value === "/status") {
        setQuery(value);
        setView("chat");
        const agent = activeAgentRef.current ?? getActiveAgent();
        if (agent) {
          setAgentLogs([{ kind: "query", text: value }]);
          const status = getSystemStatus();
          const text = [
            `MTC System Status`,
            `Tier:           ${status.tier}`,
            `License:        ${status.licenseStatus}`,
            `Enterprise:     ${status.enterprise}`,
            `MCP Servers:    ${status.connectedMcpServers} connected`,
            `Features:`,
            ...status.features.map(f => `  ${f.available ? "✅" : "❌"} ${f.feature.replace(/_/g, " ")} (${f.tier})`),
          ].join("\n");
          setAgentLogs((prev) => [...prev, { kind: "message", text }]);
          setAgentBusy(false);
        }
        return;
      }
      if (value === "/themes") { setShowThemePicker(true); return; }
      if (value === "/variants") { setShowVariants(true); setQuery(""); return; }
      setShowCommands(true);
      return;
    }
    const trimmed = value.trim();
    if (trimmed) {
      if (agentBusy) {
        promptQueueRef.current.push(trimmed);
        setNotification(`Queued (${promptQueueRef.current.length})`);
        return;
      }
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
      if (agentBusy) {
        promptQueueRef.current.push(text);
        setNotification(`Queued (${promptQueueRef.current.length})`);
        return;
      }
      const agent = activeAgentRef.current ?? getActiveAgent();
      if (agent) {
        startAgentLoop(text, agent);
      }
    },
    [startAgentLoop, agentBusy],
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

  const handleSelectModel = (id: string) => {
    setModelId(id);
    setShowModelPicker(false);
    setView("home");
    setNotification(`Model switched to ${findModel(id)?.displayName ?? id}`);
  };

  const handleSelectTheme = (themeId: string) => {
    const t = getTheme(themeId);
    setShowThemePicker(false);
    setView("home");
    setNotification(`Theme switched to ${t.name}`);
  };

  const handleSelectVariant = (variantId: string) => {
    setShowVariants(false);
    setView("home");
    setNotification(`Variant selected: ${variantId}`);
  };

  const handleSelectSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    setSessionId(sessionId);
    setShowSessions(false);
    const rows = getMessages(sessionId, true);
    setAgentLogs(messagesToLogs(rows));
    setQuery("");
    setView("chat");
    setNotification(`Switched to session ${sessionId.slice(0, 8)}`);
  }, []);

  const handleNewSession = useCallback(() => {
    const newSessionId = createSession("mtc-session");
    setSessionId(newSessionId);
    setCurrentSessionId(newSessionId);
    setAgentLogs([]);
    setShowSessions(false);
    setQuery("");
    setView("home");
    setNotification(`New session: ${newSessionId.slice(0, 8)}`);
  }, []);

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      if (sessionId === currentSessionId) {
        handleNewSession();
      } else {
        setNotification(`Deleted session ${sessionId.slice(0, 8)}`);
      }
    },
    [currentSessionId, handleNewSession],
  );

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
    if (id === "agents") setShowAgents(true);
    if (id === "diff") setView("diff");
    if (id === "editor") {
      const editor = process.env.EDITOR || "code";
      exec(`${editor} "${process.cwd()}"`, (err) => {
        if (err) setNotification(`Failed to open editor: ${err.message}`);
      });
      setNotification("Opening editor...");
    }
    if (id === "help") setShowHelp(true);
    if (id === "mcps") setShowMcps(true);
    if (id === "models" || id === "model") setShowModelPicker(true);
    if (id === "init") {
      setShowCommands(false);
      setQuery("/init");
      handleSubmit("/init");
    }
    if (id === "move") {
      setShowCommands(false);
      setQuery("/move ");
    }
    if (id === "new") {
      setShowCommands(false);
      handleSubmit("/new");
    }
    if (id === "review") {
      setShowCommands(false);
      setQuery("/review");
      handleSubmit("/review");
    }
    if (id === "sessions" || id === "session") setShowSessions(true);
    if (id === "skills") setShowSkills(true);
    const skillCmd = getInstalledSkills().find((s) => s.id === id);
    if (skillCmd) { setNotification(`Running skill: ${skillCmd.name}`); }
    if (id === "status") {
      setShowCommands(false);
      setQuery("/status");
      handleSubmit("/status");
    }
    if (id === "themes") setShowThemePicker(true);
    if (id === "variants") setShowVariants(true);
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

  const activeSkillName = useMemo(
    () => activeSkillId ? (getAllSkills().find((s) => s.id === activeSkillId)?.name ?? activeSkillId) : null,
    [activeSkillId],
  );

  const Notification = () => {
    const theme = useTheme();
    if (!notification) return null;
    return (
      <Box justifyContent="center" marginTop={1}>
        <Text color={theme.colors.warning}>{notification}</Text>
      </Box>
    );
  };

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
      mcpServers,
      currentPath: process.cwd(),
      gitBranch,
      authEmail: authEmail || undefined,
      authName: authName || undefined,
      activeSkillName,
    };
  }, [agentLogs, query, gitBranch, authEmail, authName, activeSkillName]);

  const footerRight = `${sidebarData.tokenCount.toLocaleString()} (${Math.round((sidebarData.tokenCount / sidebarData.maxContextTokens) * 100)}%)  ctrl+p commands`;

  const sidebar = <Sidebar {...sidebarData} />;

  return (
    <ThemeProvider>
    <Box flexDirection="column" width={columns} height={rows}>
      {!booted ? (
        <Box flexGrow={1} alignItems="center" justifyContent="center" flexDirection="column">
          <Text color={theme.colors.primary}>
            {SPINNER_FRAMES[spinnerFrame]} Starting MTC...
          </Text>
        </Box>
      ) : !authenticated ? (
        <LoginScreen onLogin={handleLogin} onSkip={handleSkip} onExit={cleanExit} />
      ) : pendingPerm ? (
        <PermissionPrompt
          pending={{
            toolName: pendingPerm.toolName,
            args: pendingPerm.args,
            onResponse: handlePermissionResponse,
          }}
        />
      ) : view === "home" && !showAgents && !showCommands && !showModelPicker && !showHelp && !showSkills && !showMcps && !showVariants && !showThemePicker && !showSessions ? (
        <>
          <HomeScreen
            query={query}
            onQueryChange={handleQueryChange}
            onSubmit={handleSubmit}
            updateInfo={updateInfo}
            agentName={activeAgentRef.current?.name ?? getActiveAgent()?.name ?? "Build"}
            modelName={findModel(modelId)?.displayName ?? modelId}
          />
          {notification && <Notification />}
          <Statusbar
            mcpCount={mcpCount}
            agentName={activeAgentRef.current?.name ?? getActiveAgent()?.name ?? "Build"}
            agentId={activeAgentId}
            latestVersion={updateInfo?.hasUpdate ? updateInfo.latestVersion : null}
            activeSkillName={activeSkillName}
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
          {!showAgents && showCommands && !showModelPicker && !showHelp && !showSkills && !showVariants && !showThemePicker && (
            <CommandPalette
              onSelect={handleSelectCommand}
              initialFilter={query.startsWith("/") ? query.slice(1) : undefined}
            />
          )}
          {!showAgents && !showCommands && showModelPicker && !showHelp && !showSkills && !showVariants && !showThemePicker && (
            <ModelPicker
              currentModelId={modelId}
              onSelect={handleSelectModel}
            />
          )}
          {!showAgents && !showCommands && !showModelPicker && showHelp && !showSkills && !showVariants && !showThemePicker && (
            <HelpOverlay onClose={() => setShowHelp(false)} />
          )}
          {!showAgents && !showCommands && !showModelPicker && !showHelp && showSkills && !showVariants && !showThemePicker && (
            <SkillsView
              onClose={() => setShowSkills(false)}
              activeSkillId={activeSkillId}
              onActivate={(id) => {
                setActiveSkillId(id);
                const skill = getAllSkills().find((s) => s.id === id);
                setNotification(skill ? `Activated skill: ${skill.name}` : "Skill deactivated");
              }}
            />
          )}
          {!showAgents && !showCommands && !showModelPicker && !showHelp && !showSkills && showMcps && !showVariants && !showThemePicker && (
            <McpsView onClose={() => setShowMcps(false)} />
          )}
          {!showAgents && !showCommands && !showModelPicker && !showHelp && !showSkills && !showMcps && showVariants && !showThemePicker && (
            <VariantsView onClose={() => setShowVariants(false)} onSelect={handleSelectVariant} />
          )}
          {!showAgents && !showCommands && !showModelPicker && !showHelp && !showSkills && !showMcps && !showVariants && showThemePicker && (
            <ThemePicker onSelect={handleSelectTheme} />
          )}
          {!showAgents && !showCommands && !showModelPicker && !showHelp && !showSkills && !showMcps && !showVariants && !showThemePicker && showSessions && (
            <SessionsView
              onClose={() => setShowSessions(false)}
              currentSessionId={currentSessionId}
              onSelect={handleSelectSession}
              onNewSession={handleNewSession}
              onDelete={handleDeleteSession}
            />
          )}
          {!showAgents && !showCommands && !showModelPicker && !showHelp && !showSkills && !showVariants && !showThemePicker && !showMcps && !showSessions && view === "chat" && (
            <ChatView
              query={query}
              onBack={() => setView("home")}
              requestTool={requestToolExecution}
              activeAgentId={activeAgentId}
              isAgentRunning={agentBusy}
              agentLogs={agentLogs}
              onFreeformInput={handleFreeformInput}
              queuedCount={promptQueueRef.current.length}
            />
          )}
          {!showAgents && !showCommands && !showModelPicker && !showHelp && !showSkills && !showVariants && !showThemePicker && !showMcps && !showSessions && view === "diff" && (
            <GitDiffView onBack={() => setView("home")} />
          )}
          {!showAgents && !showCommands && !showModelPicker && !showHelp && !showSkills && !showVariants && !showThemePicker && !showMcps && !showSessions && view === "connect" && (
            <ConnectForm onSave={handleConnectSave} />
          )}
        </AppLayout>
      )}
    </Box>
    </ThemeProvider>
  );
}
