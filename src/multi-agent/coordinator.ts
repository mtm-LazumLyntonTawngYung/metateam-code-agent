import { randomUUID } from "crypto";
import type {
  AgentMessage,
  MessageType,
  CoordinatorConfig,
  ExecutionMetrics,
  TaskResult,
} from "./types";
import {
  getAgent,
  updateAgentStatus,
  updateMetrics,
} from "./orchestrator";
import {
  readEntry,
  writeEntry,
} from "./workspace";

const defaultCoordinatorConfig: CoordinatorConfig = {
  enableCollaborationProtocol: true,
  messageTimeout: 10000,
  maxMessageQueueSize: 100,
  enableExecutionMonitoring: true,
  enableDependencyResolution: true,
};

const messageQueues = new Map<string, AgentMessage[]>();
const executionHistory = new Map<string, ExecutionMetrics[]>();
const coordinatorConfig = defaultCoordinatorConfig;

export function sendMessage(
  fromAgentId: string,
  toAgentId: string | undefined,
  type: MessageType,
  payload: unknown,
  requiresResponse: boolean = false,
): AgentMessage {
  const message: AgentMessage = {
    id: randomUUID(),
    fromAgentId,
    toAgentId,
    type,
    payload,
    timestamp: new Date().toISOString(),
    requiresResponse,
  };

  if (toAgentId) {
    const queue = messageQueues.get(toAgentId) ?? [];
    if (queue.length >= coordinatorConfig.maxMessageQueueSize) {
      queue.shift();
    }
    queue.push(message);
    messageQueues.set(toAgentId, queue);
  }

  return message;
}

export function receiveMessages(agentId: string): AgentMessage[] {
  const queue = messageQueues.get(agentId) ?? [];
  messageQueues.set(agentId, []);
  return queue;
}

export function peekMessages(agentId: string): AgentMessage[] {
  return messageQueues.get(agentId) ?? [];
}

export function sendMessageToWorkspace(
  fromAgentId: string,
  key: string,
  value: unknown,
): boolean {
  if (!coordinatorConfig.enableCollaborationProtocol) {
    return false;
  }

  const workspaceKey = `agent:${fromAgentId}:${key}`;
  const result = writeEntry(workspaceKey, value, fromAgentId);
  return result.success;
}

export function readFromWorkspace(
  agentId: string,
  key: string,
  sourceAgentId: string,
): unknown | null {
  if (!coordinatorConfig.enableCollaborationProtocol) {
    return null;
  }

  const workspaceKey = `agent:${sourceAgentId}:${key}`;
  const result = readEntry(workspaceKey, agentId);
  if (!result.success || !result.entry) {
    return null;
  }

  return result.entry.value;
}

export function shareTaskOutput(
  agentId: string,
  taskId: string,
  output: unknown,
): boolean {
  const key = `task:${taskId}:output`;
  return sendMessageToWorkspace(agentId, key, {
    output,
    timestamp: new Date().toISOString(),
    status: "completed",
  });
}

export function getSharedTaskOutput(
  agentId: string,
  taskId: string,
  sourceAgentId: string,
): unknown | null {
  const key = `task:${taskId}:output`;
  return readFromWorkspace(agentId, key, sourceAgentId);
}

export function startExecution(
  agentId: string,
  taskId: string,
): ExecutionMetrics {
  const metrics: ExecutionMetrics = {
    agentId,
    taskId,
    startTime: new Date().toISOString(),
    cpuUsage: 0,
    memoryUsage: 0,
    ioOperations: 0,
    networkBytes: 0,
    toolCalls: 0,
    success: false,
  };

  const history = executionHistory.get(agentId) ?? [];
  history.push(metrics);
  executionHistory.set(agentId, history);

  return metrics;
}

export function updateExecutionMetrics(
  agentId: string,
  taskId: string,
  updates: Partial<ExecutionMetrics>,
): boolean {
  const history = executionHistory.get(agentId) ?? [];
  const metrics = history.find((m) => m.taskId === taskId);
  if (!metrics) return false;

  Object.assign(metrics, updates);
  return true;
}

export function completeExecution(
  agentId: string,
  taskId: string,
  success: boolean,
  error?: string,
): ExecutionMetrics | null {
  const history = executionHistory.get(agentId) ?? [];
  const metrics = history.find((m) => m.taskId === taskId);
  if (!metrics) return null;

  metrics.endTime = new Date().toISOString();
  metrics.duration = new Date(metrics.endTime).getTime() - new Date(metrics.startTime).getTime();
  metrics.success = success;
  metrics.error = error;

  return metrics;
}

export function getExecutionHistory(agentId: string): ExecutionMetrics[] {
  return executionHistory.get(agentId) ?? [];
}

export function getTaskExecutionHistory(taskId: string): ExecutionMetrics[] {
  const results: ExecutionMetrics[] = [];

  for (const history of executionHistory.values()) {
    const found = history.find((m) => m.taskId === taskId);
    if (found) {
      results.push(found);
    }
  }

  return results;
}

export function checkDependencies(
  taskId: string,
  dependencies: string[],
): { met: boolean; missing: string[] } {
  if (!coordinatorConfig.enableDependencyResolution) {
    return { met: true, missing: [] };
  }

  const missing: string[] = [];

  for (const depId of dependencies) {
    const output = readEntry(`task:${depId}:output`, "system");
    if (!output.success) {
      missing.push(depId);
    }
  }

  return {
    met: missing.length === 0,
    missing,
  };
}

export function resolveDependencies(
  taskId: string,
  dependencies: string[],
  agentId: string,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const depId of dependencies) {
    const output = readEntry(`task:${depId}:output`, agentId);
    if (output.success && output.entry) {
      resolved[depId] = output.entry.value;
    }
  }

  return resolved;
}

export function getCoordinatorConfig(): CoordinatorConfig {
  return { ...coordinatorConfig };
}

export function updateCoordinatorConfig(config: Partial<CoordinatorConfig>): void {
  Object.assign(coordinatorConfig, config);
}

export function getMessageQueueSize(agentId: string): number {
  return messageQueues.get(agentId)?.length ?? 0;
}

export function getTotalMessageQueueSize(): number {
  let total = 0;
  for (const queue of messageQueues.values()) {
    total += queue.length;
  }
  return total;
}

export function clearMessageQueues(): void {
  messageQueues.clear();
}

export function resetCoordinator(): void {
  messageQueues.clear();
  executionHistory.clear();
}
