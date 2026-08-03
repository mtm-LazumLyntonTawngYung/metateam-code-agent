import type {
  EnhancedAgentDefinition,
  ScheduledTask,
  TaskResult,
} from "./types";
import {
  getAgent,
  getAllAgents,
  updateAgentStatus,
  getOrchestratorState,
} from "./orchestrator";
import {
  getScheduledTask,
  failTask,
  rerouteTask,
  findTasksByAgent,
} from "./task-router";

const DEFAULT_TIMEOUT_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 10000;
const MAX_FAILURES_BEFORE_DISABLE = 5;

const agentHeartbeats = new Map<string, string>();
const agentStates = new Map<string, AgentState>();
const faultLog: FaultEvent[] = [];

type AgentState = {
  lastHeartbeat: string;
  consecutiveFailures: number;
  isRecovering: boolean;
  recoveryAttempts: number;
  lastError?: string;
  taskId?: string;
  startTime?: string;
};

export type FaultEvent = {
  id: string;
  agentId: string;
  taskId?: string;
  type: FaultType;
  message: string;
  timestamp: string;
  recovered: boolean;
  recoveryAction?: string;
};

export type FaultType = "timeout" | "crash" | "memory_exceeded" | "cpu_exceeded" | "io_error" | "network_error" | "unknown";

export type RecoveryStrategy = {
  type: "reroute" | "restart" | "disable" | "ignore";
  description: string;
};

export function registerAgent(agentId: string): void {
  agentHeartbeats.set(agentId, new Date().toISOString());
  agentStates.set(agentId, {
    lastHeartbeat: new Date().toISOString(),
    consecutiveFailures: 0,
    isRecovering: false,
    recoveryAttempts: 0,
  });
}

export function unregisterAgent(agentId: string): void {
  agentHeartbeats.delete(agentId);
  agentStates.delete(agentId);
}

export function updateHeartbeat(agentId: string): boolean {
  const lastHeartbeat = agentHeartbeats.get(agentId);
  if (!lastHeartbeat) return false;

  agentHeartbeats.set(agentId, new Date().toISOString());

  const state = agentStates.get(agentId);
  if (state) {
    state.lastHeartbeat = new Date().toISOString();
  }

  return true;
}

export function checkAgentHealth(agentId: string): {
  healthy: boolean;
  reason?: string;
} {
  const lastHeartbeat = agentHeartbeats.get(agentId);
  if (!lastHeartbeat) {
    return { healthy: false, reason: "No heartbeat recorded" };
  }

  const timeSinceHeartbeat = Date.now() - new Date(lastHeartbeat).getTime();
  if (timeSinceHeartbeat > HEARTBEAT_TIMEOUT_MS) {
    return { healthy: false, reason: "Heartbeat timeout" };
  }

  const state = agentStates.get(agentId);
  if (state && state.consecutiveFailures >= MAX_FAILURES_BEFORE_DISABLE) {
    return { healthy: false, reason: "Too many consecutive failures" };
  }

  return { healthy: true };
}

export function detectFault(agentId: string, taskId?: string): FaultEvent | null {
  const state = agentStates.get(agentId);
  if (!state) return null;

  let faultType: FaultType = "unknown";
  let message = "Unknown fault detected";

  if (taskId) {
    const scheduledTask = getScheduledTask(taskId);
    if (scheduledTask && scheduledTask.startedAt) {
      const executionTime = Date.now() - new Date(scheduledTask.startedAt).getTime();
      if (executionTime > DEFAULT_TIMEOUT_MS) {
        faultType = "timeout";
        message = `Task ${taskId} exceeded timeout of ${DEFAULT_TIMEOUT_MS}ms`;
      }
    }
  }

  const lastHeartbeat = agentHeartbeats.get(agentId);
  if (!lastHeartbeat) {
    faultType = "timeout";
    message = `Agent ${agentId} has no heartbeat recorded`;
  } else {
    const timeSinceHeartbeat = Date.now() - new Date(lastHeartbeat).getTime();
    if (timeSinceHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      faultType = "timeout";
      message = `Agent ${agentId} heartbeat timeout (${timeSinceHeartbeat}ms since last heartbeat)`;
    }
  }

  const faultEvent: FaultEvent = {
    id: `fault-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    agentId,
    taskId,
    type: faultType,
    message,
    timestamp: new Date().toISOString(),
    recovered: false,
  };

  faultLog.push(faultEvent);

  return faultEvent;
}

export function handleFault(faultEvent: FaultEvent): RecoveryStrategy {
  const state = agentStates.get(faultEvent.agentId);
  if (!state) {
    return { type: "disable", description: "Agent state not found" };
  }

  state.consecutiveFailures++;
  state.lastError = faultEvent.message;

  if (faultEvent.taskId) {
    state.taskId = faultEvent.taskId;
  }

  if (state.consecutiveFailures >= MAX_FAILURES_BEFORE_DISABLE) {
    try {
      updateAgentStatus(faultEvent.agentId, "failed");
    } catch {
      // Agent might not be in orchestrator
    }
    faultEvent.recoveryAction = "disable";

    return {
      type: "disable",
      description: `Agent disabled after ${state.consecutiveFailures} consecutive failures`,
    };
  }

  if (faultEvent.taskId) {
    try {
      const rerouted = rerouteTask(faultEvent.taskId, faultEvent.agentId);
      if (rerouted) {
        faultEvent.recoveryAction = "reroute";
        return {
          type: "reroute",
          description: `Task ${faultEvent.taskId} rerouted to another agent`,
        };
      }
    } catch {
      // Task might not be in router
    }
  }

  faultEvent.recoveryAction = "restart";
  return {
    type: "restart",
    description: `Agent ${faultEvent.agentId} will be restarted`,
  };
}

export function executeRecovery(agentId: string, strategy: RecoveryStrategy): boolean {
  const agent = getAgent(agentId);
  if (!agent) return false;

  const state = agentStates.get(agentId);
  if (!state) return false;

  switch (strategy.type) {
    case "reroute":
      state.isRecovering = true;
      state.recoveryAttempts++;

      const tasks = findTasksByAgent(agentId);
      for (const task of tasks) {
        failTask(task.id, `Rerouting due to: ${strategy.description}`);
      }

      updateAgentStatus(agentId, "idle");
      state.isRecovering = false;
      state.consecutiveFailures = Math.max(0, state.consecutiveFailures - 1);
      return true;

    case "restart":
      state.isRecovering = true;
      state.recoveryAttempts++;
      state.consecutiveFailures = Math.max(0, state.consecutiveFailures - 1);

      updateAgentStatus(agentId, "idle");
      state.isRecovering = false;
      return true;

    case "disable":
      updateAgentStatus(agentId, "failed");
      return true;

    case "ignore":
      return true;

    default:
      return false;
  }
}

export function checkTimeouts(): FaultEvent[] {
  const faults: FaultEvent[] = [];

  const scheduledTasks = getOrchestratorState().runningTasks;
  for (const [taskId, task] of scheduledTasks) {
    if (task.startedAt) {
      const executionTime = Date.now() - new Date(task.startedAt).getTime();
      if (executionTime > task.timeout) {
        const fault = detectFault(task.assignedAgentId, taskId);
        if (fault) {
          faults.push(fault);
          handleFault(fault);
        }
      }
    }
  }

  return faults;
}

export function getFaultLog(agentId?: string): FaultEvent[] {
  if (agentId) {
    return faultLog.filter((f) => f.agentId === agentId);
  }
  return [...faultLog];
}

export function getAgentState(agentId: string): AgentState | null {
  return agentStates.get(agentId) ?? null;
}

export function getFaultStats(): {
  totalFaults: number;
  byType: Record<FaultType, number>;
  recovered: number;
  unrecovered: number;
} {
  const byType: Record<FaultType, number> = {
    timeout: 0,
    crash: 0,
    memory_exceeded: 0,
    cpu_exceeded: 0,
    io_error: 0,
    network_error: 0,
    unknown: 0,
  };

  let recovered = 0;
  let unrecovered = 0;

  for (const fault of faultLog) {
    byType[fault.type]++;
    if (fault.recovered) {
      recovered++;
    } else {
      unrecovered++;
    }
  }

  return {
    totalFaults: faultLog.length,
    byType,
    recovered,
    unrecovered,
  };
}

export function clearFaultLog(): void {
  faultLog.length = 0;
}

export function resetFaultDetection(): void {
  agentHeartbeats.clear();
  agentStates.clear();
  faultLog.length = 0;
}
