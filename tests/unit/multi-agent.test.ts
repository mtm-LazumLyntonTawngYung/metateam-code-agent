import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { prop, randInt, randStr } from "./prop";
import {
  initializeMultiAgentSystem,
  resetMultiAgentSystem,
  registerAgentFromDefinition,
  submitTask,
  executeNextTask,
  handleAgentFailure,
  shareAgentOutput,
  getAgentOutput,
  getSystemStatus,
  exportSystemState,
  importSystemState,
} from "../../src/multi-agent/integration";
import {
  createEnhancedAgent,
  getAgent,
  getAllAgents,
  getAvailableAgents,
  updateAgentStatus,
  updateAgentLoad,
  calculateResourceUtilization,
  canScheduleTask,
  findBestAgent,
  resetOrchestrator,
} from "../../src/multi-agent/orchestrator";
import {
  createTask,
  getTask,
  routeTask,
  routeNextTask,
  completeTask,
  failTask,
  cancelTask,
  getTaskStats,
  resetTaskRouter,
} from "../../src/multi-agent/task-router";
import {
  registerAgent,
  unregisterAgent,
  updateHeartbeat,
  checkAgentHealth,
  detectFault,
  handleFault,
  getFaultStats,
  getAgentState,
  resetFaultDetection,
} from "../../src/multi-agent/fault-detection";
import {
  readEntry,
  writeEntry,
  deleteEntry,
  getLatestVersion,
  clearWorkspace,
} from "../../src/multi-agent/workspace";
import {
  acquireLock,
  releaseLock,
  isLocked,
  atomicWrite,
  detectConflict,
  resolveConflict,
  resetConcurrencyControl,
} from "../../src/multi-agent/concurrency";
import {
  sendMessage,
  receiveMessages,
  startExecution,
  completeExecution,
  getExecutionHistory,
  resetCoordinator,
} from "../../src/multi-agent/coordinator";
import {
  collectMetrics,
  getLatestMetrics,
  identifyBottlenecks,
  generateRecommendations,
  resetMetrics,
} from "../../src/multi-agent/metrics";

describe("Multi-Agent System", () => {
  beforeAll(() => {
    initializeMultiAgentSystem({
      scheduler: { maxParallelTasks: 4, taskTimeout: 5000 },
      workspace: { maxVersions: 5 },
      coordinator: { enableCollaborationProtocol: true },
    });
  });

  afterAll(() => {
    resetMultiAgentSystem();
  });

  describe("Orchestrator", () => {
    test("createEnhancedAgent creates an agent with default values", () => {
      const agent = createEnhancedAgent({
        id: "test-agent-1",
        name: "Test Agent",
        mode: "subagent",
        permissions: { edit: "allow", bash: "allow", read: "allow", execute: "allow" },
        systemPrompt: "Test prompt",
      });

      expect(agent).toBeTruthy();
      expect(agent.id).toBe("test-agent-1");
      expect(agent.name).toBe("Test Agent");
      expect(agent.status).toBe("idle");
      expect(agent.currentLoad).toBe(0);
      expect(agent.failureCount).toBe(0);
    });

    test("getAllAgents returns all registered agents", () => {
      resetOrchestrator();
      createEnhancedAgent({
        id: "agent-a",
        name: "Agent A",
        mode: "subagent",
        permissions: { edit: "allow", bash: "allow", read: "allow", execute: "allow" },
        systemPrompt: "Prompt A",
      });
      createEnhancedAgent({
        id: "agent-b",
        name: "Agent B",
        mode: "subagent",
        permissions: { edit: "allow", bash: "allow", read: "allow", execute: "allow" },
        systemPrompt: "Prompt B",
      });

      const agents = getAllAgents();
      expect(agents.length).toBe(2);
    });

    test("getAvailableAgents returns agents with capacity", () => {
      resetOrchestrator();
      const agent = createEnhancedAgent({
        id: "available-agent",
        name: "Available Agent",
        mode: "subagent",
        permissions: { edit: "allow", bash: "allow", read: "allow", execute: "allow" },
        systemPrompt: "Prompt",
      });

      const available = getAvailableAgents();
      expect(available.length).toBe(1);
      expect(available[0].id).toBe("available-agent");
    });

    test("updateAgentStatus updates agent status", () => {
      resetOrchestrator();
      createEnhancedAgent({
        id: "status-agent",
        name: "Status Agent",
        mode: "subagent",
        permissions: { edit: "allow", bash: "allow", read: "allow", execute: "allow" },
        systemPrompt: "Prompt",
      });

      const result = updateAgentStatus("status-agent", "busy");
      expect(result).toBe(true);

      const agent = getAgent("status-agent");
      expect(agent?.status).toBe("busy");
    });

    test("updateAgentLoad updates agent load", () => {
      resetOrchestrator();
      createEnhancedAgent({
        id: "load-agent",
        name: "Load Agent",
        mode: "subagent",
        permissions: { edit: "allow", bash: "allow", read: "allow", execute: "allow" },
        systemPrompt: "Prompt",
      });

      const result = updateAgentLoad("load-agent", 1);
      expect(result).toBe(true);

      const agent = getAgent("load-agent");
      expect(agent?.currentLoad).toBe(1);
    });

    test("canScheduleTask returns true when resources available", () => {
      resetOrchestrator();
      expect(canScheduleTask()).toBe(true);
    });

    test("findBestAgent returns agent with matching capabilities", () => {
      resetOrchestrator();
      createEnhancedAgent(
        {
          id: "capable-agent",
          name: "Capable Agent",
          mode: "subagent",
          permissions: { edit: "allow", bash: "allow", read: "allow", execute: "allow" },
          systemPrompt: "Prompt",
        },
        [{ id: "coding", name: "Coding", description: "Can code", requiredPermissions: [], proficiencyScore: 8, executionTimeEstimate: 1000, resourceRequirements: { cpuWeight: 1, memoryMB: 256, ioWeight: 1, networkWeight: 0 } }],
      );

      const agent = findBestAgent(["coding"]);
      expect(agent).toBeTruthy();
      expect(agent?.id).toBe("capable-agent");
    });
  });

  describe("Task Router", () => {
    test("createTask creates a task with default values", () => {
      resetTaskRouter();
      const task = createTask("Test Task", "A test task", ["coding"]);

      expect(task).toBeTruthy();
      expect(task.name).toBe("Test Task");
      expect(task.priority).toBe("normal");
    });

    test("routeNextTask routes task to available agent", () => {
      resetTaskRouter();
      resetOrchestrator();
      createEnhancedAgent(
        {
          id: "router-agent",
          name: "Router Agent",
          mode: "subagent",
          permissions: { edit: "allow", bash: "allow", read: "allow", execute: "allow" },
          systemPrompt: "Prompt",
        },
        [{ id: "coding", name: "Coding", description: "Can code", requiredPermissions: [], proficiencyScore: 8, executionTimeEstimate: 1000, resourceRequirements: { cpuWeight: 1, memoryMB: 256, ioWeight: 1, networkWeight: 0 } }],
      );

      createTask("Route Task", "A task to route", ["coding"]);
      const scheduled = routeNextTask();

      expect(scheduled).toBeTruthy();
      expect(scheduled?.assignedAgentId).toBe("router-agent");
      expect(scheduled?.status).toBe("running");
    });

    test("completeTask marks task as completed", () => {
      resetTaskRouter();
      resetOrchestrator();
      createEnhancedAgent(
        {
          id: "complete-agent",
          name: "Complete Agent",
          mode: "subagent",
          permissions: { edit: "allow", bash: "allow", read: "allow", execute: "allow" },
          systemPrompt: "Prompt",
        },
        [{ id: "coding", name: "Coding", description: "Can code", requiredPermissions: [], proficiencyScore: 8, executionTimeEstimate: 1000, resourceRequirements: { cpuWeight: 1, memoryMB: 256, ioWeight: 1, networkWeight: 0 } }],
      );

      const task = createTask("Complete Task", "A task to complete", ["coding"]);
      const scheduled = routeNextTask();

      const result = completeTask(scheduled!.id, {
        success: true,
        output: "Done",
        toolCalls: 1,
        duration: 100,
        agentId: "complete-agent",
        taskId: scheduled!.id,
      });

      expect(result).toBe(true);

      const stats = getTaskStats();
      expect(stats.completed).toBe(1);
    });

    test("failTask marks task as failed and retries", () => {
      resetTaskRouter();
      resetOrchestrator();
      createEnhancedAgent(
        {
          id: "fail-agent",
          name: "Fail Agent",
          mode: "subagent",
          permissions: { edit: "allow", bash: "allow", read: "allow", execute: "allow" },
          systemPrompt: "Prompt",
        },
        [{ id: "coding", name: "Coding", description: "Can code", requiredPermissions: [], proficiencyScore: 8, executionTimeEstimate: 1000, resourceRequirements: { cpuWeight: 1, memoryMB: 256, ioWeight: 1, networkWeight: 0 } }],
      );

      const task = createTask("Fail Task", "A task to fail", ["coding"], { retryCount: 2 });
      const scheduled = routeNextTask();

      const result = failTask(scheduled!.id, "Test error");
      expect(result).toBe(true);

      const stats = getTaskStats();
      expect(stats.pending).toBe(1);
    });

    test("cancelTask removes task from queue", () => {
      resetTaskRouter();
      const task = createTask("Cancel Task", "A task to cancel", ["coding"]);

      const result = cancelTask(task.id);
      expect(result).toBe(true);

      const stats = getTaskStats();
      expect(stats.pending).toBe(0);
    });
  });

  describe("Fault Detection", () => {
    test("registerAgent registers agent for monitoring", () => {
      resetFaultDetection();
      registerAgent("monitor-agent");

      const state = getAgentState("monitor-agent");
      expect(state).toBeTruthy();
      expect(state?.consecutiveFailures).toBe(0);
    });

    test("updateHeartbeat updates agent heartbeat", () => {
      resetFaultDetection();
      registerAgent("heartbeat-agent");

      const result = updateHeartbeat("heartbeat-agent");
      expect(result).toBe(true);
    });

    test("checkAgentHealth returns healthy for active agent", () => {
      resetFaultDetection();
      registerAgent("health-agent");

      const health = checkAgentHealth("health-agent");
      expect(health.healthy).toBe(true);
    });

    test("detectFault detects timeout fault", () => {
      resetFaultDetection();
      registerAgent("fault-agent");

      const fault = detectFault("fault-agent");
      expect(fault).toBeTruthy();
      expect(["timeout", "unknown"]).toContain(fault?.type);
    });

    test("handleFault returns recovery strategy", () => {
      resetFaultDetection();
      registerAgent("recovery-agent");

      const fault = detectFault("recovery-agent");
      const strategy = handleFault(fault!);
      expect(strategy).toBeTruthy();
      expect(strategy.type).toBe("restart");
    });

    test("getFaultStats returns fault statistics", () => {
      resetFaultDetection();
      registerAgent("stats-agent");
      detectFault("stats-agent");

      const stats = getFaultStats();
      expect(stats.totalFaults).toBe(1);
    });
  });

  describe("Workspace", () => {
    test("writeEntry creates a new entry", () => {
      clearWorkspace();
      const result = writeEntry("test-key", { value: 42 }, "agent-1");

      expect(result.success).toBe(true);
      expect(result.entry).toBeTruthy();
      expect(result.entry?.version).toBe(1);
    });

    test("readEntry reads an existing entry", () => {
      clearWorkspace();
      writeEntry("read-key", { value: 100 }, "agent-1");

      const result = readEntry("read-key", "agent-2");
      expect(result.success).toBe(true);
      expect(result.entry?.value).toEqual({ value: 100 });
    });

    test("deleteEntry removes an entry", () => {
      clearWorkspace();
      writeEntry("delete-key", { value: 200 }, "agent-1");

      const result = deleteEntry("delete-key", "agent-1");
      expect(result.success).toBe(true);

      const readResult = readEntry("delete-key", "agent-1");
      expect(readResult.success).toBe(false);
    });

    test("getLatestVersion returns entry version", () => {
      clearWorkspace();
      writeEntry("version-key", { value: 1 }, "agent-1");

      const version = getLatestVersion("version-key");
      expect(version).toBe(1);
    });
  });

  describe("Concurrency", () => {
    test("acquireLock acquires a lock", () => {
      resetConcurrencyControl();
      const result = acquireLock("lock-key", "agent-1");
      expect(result).toBe(true);
    });

    test("isLocked returns true for locked key", () => {
      resetConcurrencyControl();
      acquireLock("locked-key", "agent-1");

      const locked = isLocked("locked-key");
      expect(locked).toBe(true);
    });

    test("releaseLock releases a lock", () => {
      resetConcurrencyControl();
      acquireLock("release-key", "agent-1");

      const result = releaseLock("release-key", "agent-1");
      expect(result).toBe(true);

      const locked = isLocked("release-key");
      expect(locked).toBe(false);
    });

    test("atomicWrite writes with version check", () => {
      resetConcurrencyControl();
      clearWorkspace();
      writeEntry("atomic-key", { value: 1 }, "agent-1");

      const result = atomicWrite("atomic-key", { value: 2 }, "agent-1", 1);
      expect(result.success).toBe(true);
    });

    test("detectConflict detects version mismatch", () => {
      clearWorkspace();
      writeEntry("conflict-key", { value: 1 }, "agent-1");

      const conflict = detectConflict("conflict-key", 0);
      expect(conflict).toBeTruthy();
      expect(conflict?.currentVersion).toBe(1);
    });
  });

  describe("Coordinator", () => {
    test("sendMessage sends a message to agent", () => {
      resetCoordinator();
      const message = sendMessage("agent-1", "agent-2", "status_change", { status: "busy" });

      expect(message).toBeTruthy();
      expect(message.fromAgentId).toBe("agent-1");
      expect(message.toAgentId).toBe("agent-2");
    });

    test("receiveMessages retrieves messages for agent", () => {
      resetCoordinator();
      sendMessage("agent-1", "agent-2", "status_change", { status: "busy" });

      const messages = receiveMessages("agent-2");
      expect(messages.length).toBe(1);
      expect(messages[0].fromAgentId).toBe("agent-1");
    });

    test("startExecution starts tracking execution", () => {
      resetCoordinator();
      const metrics = startExecution("agent-1", "task-1");

      expect(metrics).toBeTruthy();
      expect(metrics.agentId).toBe("agent-1");
      expect(metrics.taskId).toBe("task-1");
    });

    test("completeExecution completes tracking", () => {
      resetCoordinator();
      startExecution("agent-1", "task-2");

      const result = completeExecution("agent-1", "task-2", true);
      expect(result).toBeTruthy();
      expect(result?.success).toBe(true);
    });

    test("getExecutionHistory returns execution history", () => {
      resetCoordinator();
      startExecution("agent-1", "task-3");
      completeExecution("agent-1", "task-3", true);

      const history = getExecutionHistory("agent-1");
      expect(history.length).toBe(1);
    });
  });

  describe("Metrics", () => {
    test("collectMetrics collects system metrics", () => {
      resetMetrics();
      const metrics = collectMetrics();

      expect(metrics).toBeTruthy();
      expect(metrics.timestamp).toBeTruthy();
    });

    test("getLatestMetrics returns latest metrics", () => {
      resetMetrics();
      collectMetrics();

      const latest = getLatestMetrics();
      expect(latest).toBeTruthy();
    });

    test("identifyBottlenecks identifies bottlenecks", () => {
      const bottlenecks = identifyBottlenecks();
      expect(bottlenecks).toBeTruthy();
      expect(Array.isArray(bottlenecks)).toBe(true);
    });

    test("generateRecommendations generates recommendations", () => {
      const recommendations = generateRecommendations();
      expect(recommendations).toBeTruthy();
      expect(recommendations.length).toBeGreaterThan(0);
    });
  });

  describe("Integration", () => {
    test("initializeMultiAgentSystem initializes all components", () => {
      resetMultiAgentSystem();
      initializeMultiAgentSystem();

      const status = getSystemStatus();
      expect(status.agents).toBe(0);
    });

    test("registerAgentFromDefinition registers enhanced agent", () => {
      resetMultiAgentSystem();
      const agent = registerAgentFromDefinition(
        {
          id: "integration-agent",
          name: "Integration Agent",
          mode: "subagent",
          permissions: { edit: "allow", bash: "allow", read: "allow", execute: "allow" },
          systemPrompt: "Prompt",
        },
        [{ id: "coding", name: "Coding", description: "Can code", requiredPermissions: [], proficiencyScore: 8, executionTimeEstimate: 1000, resourceRequirements: { cpuWeight: 1, memoryMB: 256, ioWeight: 1, networkWeight: 0 } }],
      );

      expect(agent).toBeTruthy();
      expect(agent.id).toBe("integration-agent");
    });

    test("submitTask and executeNextTask workflow", () => {
      resetMultiAgentSystem();
      registerAgentFromDefinition(
        {
          id: "workflow-agent",
          name: "Workflow Agent",
          mode: "subagent",
          permissions: { edit: "allow", bash: "allow", read: "allow", execute: "allow" },
          systemPrompt: "Prompt",
        },
        [{ id: "coding", name: "Coding", description: "Can code", requiredPermissions: [], proficiencyScore: 8, executionTimeEstimate: 1000, resourceRequirements: { cpuWeight: 1, memoryMB: 256, ioWeight: 1, networkWeight: 0 } }],
      );

      submitTask("Workflow Task", "A workflow task", ["coding"]);
      const result = executeNextTask();

      expect(result).toBeTruthy();
      expect(result?.success).toBe(true);
    });

    test("shareAgentOutput and getAgentOutput workflow", () => {
      resetMultiAgentSystem();

      const shared = shareAgentOutput("agent-1", "output", { result: "success" });
      expect(shared).toBe(true);

      const output = getAgentOutput("agent-1", "output");
      expect(output).toEqual({ result: "success" });
    });

    test("exportSystemState exports system state", () => {
      resetMultiAgentSystem();
      registerAgentFromDefinition({
        id: "export-agent",
        name: "Export Agent",
        mode: "subagent",
        permissions: { edit: "allow", bash: "allow", read: "allow", execute: "allow" },
        systemPrompt: "Prompt",
      });

      const state = exportSystemState();
      expect(state).toBeTruthy();
      expect(state.agents.length).toBe(1);
    });

    test("importSystemState imports system state", () => {
      resetMultiAgentSystem();
      importSystemState({
        workspace: { "imported-key": { value: 42 } },
      });

      const readResult = readEntry("imported-key", "system");
      expect(readResult.success).toBe(true);
      expect(readResult.entry?.value).toEqual({ value: 42 });
    });
  });

  describe("Property Tests", () => {
    test("Property 1: Resource-Aware Parallel Scheduling", () => {
      prop(20, (rand) => {
        resetOrchestrator();

        const agentCount = 1 + randInt(rand, 3);
        for (let i = 0; i < agentCount; i++) {
          createEnhancedAgent({
            id: `agent-${i}`,
            name: `Agent ${i}`,
            mode: "subagent",
            permissions: { edit: "allow", bash: "allow", read: "allow", execute: "allow" },
            systemPrompt: "Prompt",
          });
        }

        const utilization = calculateResourceUtilization();
        expect(utilization.cpu).toBeGreaterThanOrEqual(0);
        expect(utilization.cpu).toBeLessThanOrEqual(100);
      });
    });

    test("Property 2: Shared Workspace Data Consistency", () => {
      prop(20, (rand) => {
        clearWorkspace();

        const key = randStr(rand, 8, "abcdefghijklmnopqrstuvwxyz");
        const value = { data: randStr(rand, 10, "0123456789") };

        const writeResult = writeEntry(key, value, "agent-1");
        expect(writeResult.success).toBe(true);

        const readResult = readEntry(key, "agent-2");
        expect(readResult.success).toBe(true);
        expect(readResult.entry?.value).toEqual(value);
      });
    });

    test("Property 3: Optimistic Concurrency Control", () => {
      prop(20, (rand) => {
        clearWorkspace();

        const key = randStr(rand, 8, "abcdefghijklmnopqrstuvwxyz");
        writeEntry(key, { version: 1 }, "agent-1");

        const version = getLatestVersion(key);
        const result = atomicWrite(key, { version: 2 }, "agent-1", version);
        expect(result.success).toBe(true);
      });
    });

    test("Property 4: Comprehensive Conflict Resolution", () => {
      prop(20, (rand) => {
        clearWorkspace();

        const key = randStr(rand, 8, "abcdefghijklmnopqrstuvwxyz");
        writeEntry(key, { value: 1 }, "agent-1");

        const conflict = detectConflict(key, 0);
        expect(conflict).toBeTruthy();

        const resolution = resolveConflict(conflict!, { strategy: "last-write-wins" }, "agent-2");
        expect(resolution.success).toBe(true);
      });
    });

    test("Property 5: Dynamic Task Routing", () => {
      prop(20, (rand) => {
        resetTaskRouter();
        resetOrchestrator();

        const agentCount = 1 + randInt(rand, 3);
        for (let i = 0; i < agentCount; i++) {
          createEnhancedAgent(
            {
              id: `agent-${i}`,
              name: `Agent ${i}`,
              mode: "subagent",
              permissions: { edit: "allow", bash: "allow", read: "allow", execute: "allow" },
              systemPrompt: "Prompt",
            },
            [{ id: "coding", name: "Coding", description: "Can code", requiredPermissions: [], proficiencyScore: 8, executionTimeEstimate: 1000, resourceRequirements: { cpuWeight: 1, memoryMB: 256, ioWeight: 1, networkWeight: 0 } }],
          );
        }

        const taskCount = 1 + randInt(rand, 3);
        for (let i = 0; i < taskCount; i++) {
          createTask(`Task ${i}`, `Task ${i} description`, ["coding"]);
        }

        const agent = findBestAgent(["coding"]);
        expect(agent).toBeTruthy();
      });
    });

    test("Property 6: Agent Collaboration Protocol", () => {
      prop(20, (rand) => {
        resetCoordinator();

        const agentCount = 2;
        for (let i = 0; i < agentCount; i++) {
          sendMessage(`agent-${i}`, `agent-${(i + 1) % agentCount}`, "status_change", { status: "idle" });
        }

        for (let i = 0; i < agentCount; i++) {
          const messages = receiveMessages(`agent-${i}`);
          expect(messages.length).toBe(1);
        }
      });
    });

    test("Property 7: Performance Monitoring and Optimization", () => {
      prop(20, (rand) => {
        resetMetrics();

        const metrics = collectMetrics();
        expect(metrics.totalAgents).toBeGreaterThanOrEqual(0);
        expect(metrics.completedTasks).toBeGreaterThanOrEqual(0);

        const recommendations = generateRecommendations();
        expect(recommendations.length).toBeGreaterThan(0);
      });
    });

    test("Property 8: Fault Tolerance and Recovery", () => {
      prop(20, (rand) => {
        resetFaultDetection();

        registerAgent("fault-agent");
        const fault = detectFault("fault-agent");
        expect(fault).toBeTruthy();

        const strategy = handleFault(fault!);
        expect(strategy).toBeTruthy();
        expect(["reroute", "restart", "disable", "ignore"]).toContain(strategy.type);
      });
    });
  });
});
