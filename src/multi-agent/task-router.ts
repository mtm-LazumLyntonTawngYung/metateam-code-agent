import { randomUUID } from "crypto";
import type {
  TaskDefinition,
  TaskPriority,
  TaskStatus,
  ScheduledTask,
  TaskResult,
  EnhancedAgentDefinition,
} from "./types";
import {
  findBestAgent,
  canScheduleTask,
  updateAgentStatus,
  updateAgentLoad,
  getOrchestratorState,
  updateMetrics,
} from "./orchestrator";

const taskQueue: TaskDefinition[] = [];
const scheduledTasks = new Map<string, ScheduledTask>();
const completedTasks = new Map<string, TaskResult>();

const priorityOrder: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function createTask(
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
  const task: TaskDefinition = {
    id: randomUUID(),
    name,
    description,
    requiredCapabilities,
    priority: options?.priority ?? "normal",
    timeout: options?.timeout ?? 30000,
    retryCount: options?.retryCount ?? 3,
    dependencies: options?.dependencies ?? [],
    metadata: options?.metadata ?? {},
    createdAt: new Date().toISOString(),
  };

  taskQueue.push(task);
  sortTaskQueue();

  return task;
}

function sortTaskQueue(): void {
  taskQueue.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function getTask(taskId: string): TaskDefinition | null {
  return taskQueue.find((t) => t.id === taskId) ?? scheduledTasks.get(taskId) ?? null;
}

export function getScheduledTask(taskId: string): ScheduledTask | null {
  return scheduledTasks.get(taskId) ?? null;
}

export function getPendingTasks(): TaskDefinition[] {
  return [...taskQueue];
}

export function getRunningTasks(): ScheduledTask[] {
  return Array.from(scheduledTasks.values());
}

export function getCompletedTasks(): TaskResult[] {
  return Array.from(completedTasks.values());
}

export function routeTask(taskId: string, preferredAgentId?: string): ScheduledTask | null {
  const taskIndex = taskQueue.findIndex((t) => t.id === taskId);
  if (taskIndex === -1) return null;

  const task = taskQueue[taskIndex];

  if (task.dependencies.length > 0) {
    const allDependenciesMet = task.dependencies.every((depId) => {
      const depResult = completedTasks.get(depId);
      return depResult && depResult.success;
    });

    if (!allDependenciesMet) return null;
  }

  if (!canScheduleTask()) return null;

  const agent = findBestAgent(task.requiredCapabilities, preferredAgentId);
  if (!agent) return null;

  taskQueue.splice(taskIndex, 1);

  const scheduledTask: ScheduledTask = {
    ...task,
    assignedAgentId: agent.id,
    status: "scheduled",
    attempts: 0,
  };

  scheduledTasks.set(task.id, scheduledTask);

  updateAgentStatus(agent.id, "busy");
  updateAgentLoad(agent.id, agent.currentLoad + 1);

  scheduledTask.status = "running";
  scheduledTask.startedAt = new Date().toISOString();

  updateMetrics();

  return scheduledTask;
}

export function routeNextTask(preferredAgentId?: string): ScheduledTask | null {
  if (taskQueue.length === 0) return null;

  const nextTask = taskQueue[0];
  return routeTask(nextTask.id, preferredAgentId);
}

export function completeTask(taskId: string, result: TaskResult): boolean {
  const scheduledTask = scheduledTasks.get(taskId);
  if (!scheduledTask) return false;

  scheduledTask.status = result.success ? "completed" : "failed";
  scheduledTask.completedAt = new Date().toISOString();
  scheduledTask.result = result;

  completedTasks.set(taskId, result);

  const agent = getOrchestratorState().agents.get(scheduledTask.assignedAgentId);
  if (agent) {
    updateAgentLoad(agent.id, agent.currentLoad - 1);
    updateAgentStatus(agent.id, "idle");
  }

  scheduledTasks.delete(taskId);

  updateMetrics();

  return true;
}

export function failTask(taskId: string, error: string): boolean {
  const scheduledTask = scheduledTasks.get(taskId);
  if (!scheduledTask) return false;

  scheduledTask.attempts++;
  scheduledTask.lastError = error;

  if (scheduledTask.attempts < scheduledTask.retryCount) {
    scheduledTask.status = "retrying";

    const agent = getOrchestratorState().agents.get(scheduledTask.assignedAgentId);
    if (agent) {
      updateAgentLoad(agent.id, agent.currentLoad - 1);
      updateAgentStatus(agent.id, "idle");
    }

    scheduledTask.status = "pending";
    taskQueue.push({
      id: scheduledTask.id,
      name: scheduledTask.name,
      description: scheduledTask.description,
      requiredCapabilities: scheduledTask.requiredCapabilities,
      priority: scheduledTask.priority,
      timeout: scheduledTask.timeout,
      retryCount: scheduledTask.retryCount,
      dependencies: scheduledTask.dependencies,
      metadata: scheduledTask.metadata,
      createdAt: scheduledTask.createdAt,
    });
    sortTaskQueue();

    scheduledTasks.delete(taskId);
  } else {
    scheduledTask.status = "failed";
    scheduledTask.completedAt = new Date().toISOString();

    const result: TaskResult = {
      success: false,
      output: "",
      error,
      toolCalls: 0,
      duration: 0,
      agentId: scheduledTask.assignedAgentId,
      taskId,
    };

    completedTasks.set(taskId, result);

    const agent = getOrchestratorState().agents.get(scheduledTask.assignedAgentId);
    if (agent) {
      updateAgentLoad(agent.id, agent.currentLoad - 1);
      updateAgentStatus(agent.id, "idle");
    }

    scheduledTasks.delete(taskId);
  }

  updateMetrics();

  return true;
}

export function cancelTask(taskId: string): boolean {
  const taskIndex = taskQueue.findIndex((t) => t.id === taskId);
  if (taskIndex !== -1) {
    taskQueue.splice(taskIndex, 1);
    return true;
  }

  const scheduledTask = scheduledTasks.get(taskId);
  if (scheduledTask) {
    scheduledTask.status = "cancelled";
    scheduledTasks.delete(taskId);

    const agent = getOrchestratorState().agents.get(scheduledTask.assignedAgentId);
    if (agent) {
      updateAgentLoad(agent.id, agent.currentLoad - 1);
      updateAgentStatus(agent.id, "idle");
    }

    return true;
  }

  return false;
}

export function rerouteTask(taskId: string, newAgentId: string): ScheduledTask | null {
  const scheduledTask = scheduledTasks.get(taskId);
  if (!scheduledTask) return null;

  const oldAgent = getOrchestratorState().agents.get(scheduledTask.assignedAgentId);
  if (oldAgent) {
    updateAgentLoad(oldAgent.id, oldAgent.currentLoad - 1);
    updateAgentStatus(oldAgent.id, "idle");
  }

  scheduledTasks.delete(taskId);

  const task: TaskDefinition = {
    id: scheduledTask.id,
    name: scheduledTask.name,
    description: scheduledTask.description,
    requiredCapabilities: scheduledTask.requiredCapabilities,
    priority: scheduledTask.priority,
    timeout: scheduledTask.timeout,
    retryCount: scheduledTask.retryCount,
    dependencies: scheduledTask.dependencies,
    metadata: scheduledTask.metadata,
    createdAt: scheduledTask.createdAt,
  };

  taskQueue.unshift(task);

  return routeTask(taskId, newAgentId);
}

export function getTaskQueueLength(): number {
  return taskQueue.length;
}

export function getRunningTaskCount(): number {
  return scheduledTasks.size;
}

export function getCompletedTaskCount(): number {
  return completedTasks.size;
}

export function findTasksByAgent(agentId: string): ScheduledTask[] {
  return Array.from(scheduledTasks.values()).filter((t) => t.assignedAgentId === agentId);
}

export function findTasksByCapability(capabilityId: string): TaskDefinition[] {
  return taskQueue.filter((t) => t.requiredCapabilities.includes(capabilityId));
}

export function findCriticalTasks(): TaskDefinition[] {
  return taskQueue.filter((t) => t.priority === "critical");
}

export function getTaskStats(): {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  byPriority: Record<TaskPriority, number>;
} {
  const byPriority: Record<TaskPriority, number> = {
    critical: 0,
    high: 0,
    normal: 0,
    low: 0,
  };

  for (const task of taskQueue) {
    byPriority[task.priority]++;
  }

  return {
    pending: taskQueue.length,
    running: scheduledTasks.size,
    completed: Array.from(completedTasks.values()).filter((t) => t.success).length,
    failed: Array.from(completedTasks.values()).filter((t) => !t.success).length,
    byPriority,
  };
}

export function resetTaskRouter(): void {
  taskQueue.length = 0;
  scheduledTasks.clear();
  completedTasks.clear();
}
