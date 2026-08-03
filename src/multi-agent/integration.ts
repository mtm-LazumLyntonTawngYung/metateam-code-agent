import type { AgentDefinition } from "../agents/types";
import type {
  EnhancedAgentDefinition,
  AgentCapability,
  ResourceProfile,
  TaskDefinition,
  TaskPriority,
  TaskResult,
  SchedulerConfig,
  WorkspaceConfig,
  CoordinatorConfig,
} from "./types";
import {
  createEnhancedAgent,
  getAgent,
  getAllAgents,
  resetOrchestrator,
  updateMetrics,
} from "./orchestrator";
import {
  createTask,
  routeTask,
  routeNextTask,
  completeTask,
  failTask,
  cancelTask,
  getTaskStats,
  resetTaskRouter,
} from "./task-router";
import {
  registerAgent,
  unregisterAgent,
  updateHeartbeat,
  checkAgentHealth,
  checkTimeouts,
  resetFaultDetection,
} from "./fault-detection";
import {
  readEntry,
  writeEntry,
  deleteEntry,
  getWorkspaceSnapshot,
  loadSnapshot,
  clearWorkspace,
} from "./workspace";
import {
  sendMessage,
  receiveMessages,
  startExecution,
  completeExecution,
  resetCoordinator,
} from "./coordinator";
import {
  collectMetrics,
  getLatestMetrics,
  generateRecommendations,
  resetMetrics,
} from "./metrics";

export type MultiAgentSystemConfig = {
  scheduler: Partial<SchedulerConfig>;
  workspace: Partial<WorkspaceConfig>;
  coordinator: Partial<CoordinatorConfig>;
};

const defaultSystemConfig: MultiAgentSystemConfig = {
  scheduler: {
    maxParallelTasks: 4,
    taskTimeout: 30000,
    heartbeatInterval: 5000,
    maxRetries: 3,
  },
  workspace: {
    maxVersions: 10,
    conflictDetectionEnabled: true,
    autoMergeEnabled: true,
    accessControlEnabled: true,
  },
  coordinator: {
    enableCollaborationProtocol: true,
    messageTimeout: 10000,
    enableExecutionMonitoring: true,
    enableDependencyResolution: true,
  },
};

let systemConfig = defaultSystemConfig;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export function initializeMultiAgentSystem(config?: Partial<MultiAgentSystemConfig>): void {
  if (config) {
    systemConfig = {
      scheduler: { ...defaultSystemConfig.scheduler, ...config.scheduler },
      workspace: { ...defaultSystemConfig.workspace, ...config.workspace },
      coordinator: { ...defaultSystemConfig.coordinator, ...config.coordinator },
    };
  }

  resetMultiAgentSystem();
}

export function resetMultiAgentSystem(): void {
  stopHeartbeatMonitoring();

  resetOrchestrator();
  resetTaskRouter();
  resetFaultDetection();
  clearWorkspace();
  resetCoordinator();
  resetMetrics();
}

export function registerAgentFromDefinition(
  agentDef: AgentDefinition,
  capabilities?: AgentCapability[],
  resourceProfile?: Partial<ResourceProfile>,
): EnhancedAgentDefinition {
  const enhanced = createEnhancedAgent(
    {
      id: agentDef.id,
      name: agentDef.name,
      mode: agentDef.mode,
      permissions: agentDef.permissions,
      systemPrompt: agentDef.systemPrompt,
    },
    capabilities,
    resourceProfile,
  );

  registerAgent(enhanced.id);

  return enhanced;
}

export function submitTask(
  name: string,
  description: string,
  requiredCapabilities: string[],
  options?: {
    priority?: TaskPriority;
    timeout?: number;
    retryCount?: number;
    dependencies?: string[];
    metadata?: Record<string, unknown>;
  },
): TaskDefinition {
  return createTask(name, description, requiredCapabilities, options);
}

export function executeNextTask(): TaskResult | null {
  const scheduledTask = routeNextTask();
  if (!scheduledTask) return null;

  const startTime = Date.now();
  startExecution(scheduledTask.assignedAgentId, scheduledTask.id);

  const result: TaskResult = {
    success: true,
    output: "Task executed successfully",
    toolCalls: 0,
    duration: Date.now() - startTime,
    agentId: scheduledTask.assignedAgentId,
    taskId: scheduledTask.id,
  };

  completeExecution(scheduledTask.assignedAgentId, scheduledTask.id, true);
  completeTask(scheduledTask.id, result);

  return result;
}

export function handleAgentFailure(agentId: string, taskId: string, error: string): void {
  failTask(taskId, error);

  const agent = getAgent(agentId);
  if (agent && agent.failureCount >= 3) {
    unregisterAgent(agentId);
  }
}

export function shareAgentOutput(agentId: string, key: string, value: unknown): boolean {
  return writeEntry(`agent:${agentId}:${key}`, value, agentId).success;
}

export function getAgentOutput(agentId: string, key: string): unknown | null {
  const result = readEntry(`agent:${agentId}:${key}`, "system");
  return result.success && result.entry ? result.entry.value : null;
}

export function broadcastMessage(
  fromAgentId: string,
  type: "status_change" | "error_report" | "workspace_update",
  payload: unknown,
): void {
  const agents = getAllAgents().filter((a) => a.id !== fromAgentId);
  for (const agent of agents) {
    sendMessage(fromAgentId, agent.id, type, payload);
  }
}

export function processAgentMessages(agentId: string): void {
  const messages = receiveMessages(agentId);
  for (const message of messages) {
    switch (message.type) {
      case "workspace_update":
        break;
      case "status_change":
        break;
      case "error_report":
        break;
    }
  }
}

export function startHeartbeatMonitoring(intervalMs?: number): void {
  stopHeartbeatMonitoring();

  const interval = intervalMs ?? systemConfig.scheduler?.heartbeatInterval ?? 5000;

  heartbeatInterval = setInterval(() => {
    const agents = getAllAgents();
    for (const agent of agents) {
      updateHeartbeat(agent.id);
    }

    checkTimeouts();
    updateMetrics();
  }, interval);
}

export function stopHeartbeatMonitoring(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

export function getSystemStatus(): {
  agents: number;
  tasks: ReturnType<typeof getTaskStats>;
  health: Record<string, boolean>;
  metrics: ReturnType<typeof getLatestMetrics>;
  recommendations: ReturnType<typeof generateRecommendations>;
} {
  const agents = getAllAgents();
  const health: Record<string, boolean> = {};

  for (const agent of agents) {
    const agentHealth = checkAgentHealth(agent.id);
    health[agent.id] = agentHealth.healthy;
  }

  return {
    agents: agents.length,
    tasks: getTaskStats(),
    health,
    metrics: getLatestMetrics(),
    recommendations: generateRecommendations(),
  };
}

export function exportSystemState(): {
  agents: EnhancedAgentDefinition[];
  workspace: Record<string, unknown>;
  taskStats: ReturnType<typeof getTaskStats>;
  metrics: ReturnType<typeof getLatestMetrics>;
} {
  return {
    agents: getAllAgents(),
    workspace: getWorkspaceSnapshot(),
    taskStats: getTaskStats(),
    metrics: getLatestMetrics(),
  };
}

export function importSystemState(state: {
  agents?: EnhancedAgentDefinition[];
  workspace?: Record<string, unknown>;
}): void {
  if (state.workspace) {
    loadSnapshot(state.workspace, "system");
  }
}

export function getSystemConfig(): MultiAgentSystemConfig {
  return { ...systemConfig };
}

export function updateSystemConfig(config: Partial<MultiAgentSystemConfig>): void {
  systemConfig = {
    scheduler: { ...systemConfig.scheduler, ...config.scheduler },
    workspace: { ...systemConfig.workspace, ...config.workspace },
    coordinator: { ...systemConfig.coordinator, ...config.coordinator },
  };
}
