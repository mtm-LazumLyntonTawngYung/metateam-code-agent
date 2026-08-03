import { randomUUID } from "crypto";
import type {
  EnhancedAgentDefinition,
  AgentCapability,
  AgentStatus,
  ResourceProfile,
  ResourceRequirements,
  ResourceUtilization,
  SchedulerConfig,
  OrchestratorState,
} from "./types";
import type { AgentPermissions } from "../agents/types";

const defaultSchedulerConfig: SchedulerConfig = {
  maxParallelTasks: 4,
  resourceCheckInterval: 1000,
  taskTimeout: 30000,
  heartbeatInterval: 5000,
  maxRetries: 3,
  enableResourceMonitoring: true,
};

let orchestratorState: OrchestratorState = {
  agents: new Map(),
  taskQueue: [],
  runningTasks: new Map(),
  completedTasks: new Map(),
  metrics: createInitialMetrics(),
  config: defaultSchedulerConfig,
};

function createInitialMetrics() {
  return {
    totalAgents: 0,
    activeAgents: 0,
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    averageExecutionTime: 0,
    parallelSpeedup: 1,
    resourceUtilization: { cpu: 0, memory: 0, io: 0, network: 0 },
    conflictRate: 0,
    timestamp: new Date().toISOString(),
  };
}

export function createEnhancedAgent(
  baseAgent: { id: string; name: string; mode: "primary" | "subagent"; permissions: AgentPermissions; systemPrompt: string },
  capabilities: AgentCapability[] = [],
  resourceProfile?: Partial<ResourceProfile>,
): EnhancedAgentDefinition {
  const agent: EnhancedAgentDefinition = {
    ...baseAgent,
    capabilities,
    maxConcurrentTasks: 2,
    currentLoad: 0,
    failureCount: 0,
    lastActiveAt: new Date().toISOString(),
    status: "idle",
    resourceProfile: {
      maxCpuPercent: 25,
      maxMemoryMB: 512,
      maxIoOperations: 100,
      priority: 1,
      weight: 1,
      ...resourceProfile,
    },
  };

  orchestratorState.agents.set(agent.id, agent);
  updateMetrics();
  return agent;
}

export function getAgent(agentId: string): EnhancedAgentDefinition | null {
  return orchestratorState.agents.get(agentId) ?? null;
}

export function getAllAgents(): EnhancedAgentDefinition[] {
  return Array.from(orchestratorState.agents.values());
}

export function getAvailableAgents(): EnhancedAgentDefinition[] {
  return getAllAgents().filter(
    (a) => a.status === "idle" && a.currentLoad < a.maxConcurrentTasks,
  );
}

export function getAgentsWithCapability(capabilityId: string): EnhancedAgentDefinition[] {
  return getAllAgents().filter((a) =>
    a.capabilities.some((c) => c.id === capabilityId) &&
    a.status !== "failed" &&
    a.status !== "terminated",
  );
}

export function updateAgentStatus(agentId: string, status: AgentStatus): boolean {
  const agent = orchestratorState.agents.get(agentId);
  if (!agent) return false;

  agent.status = status;
  agent.lastActiveAt = new Date().toISOString();

  if (status === "failed") {
    agent.failureCount++;
  }

  return true;
}

export function updateAgentLoad(agentId: string, load: number): boolean {
  const agent = orchestratorState.agents.get(agentId);
  if (!agent) return false;

  agent.currentLoad = Math.max(0, Math.min(load, agent.maxConcurrentTasks));
  agent.lastActiveAt = new Date().toISOString();
  return true;
}

export function calculateResourceUtilization(): ResourceUtilization {
  const agents = getAllAgents();
  if (agents.length === 0) {
    return { cpu: 0, memory: 0, io: 0, network: 0 };
  }

  let totalCpu = 0;
  let totalMemory = 0;
  let totalIo = 0;
  let totalNetwork = 0;

  for (const agent of agents) {
    const loadFactor = agent.currentLoad / agent.maxConcurrentTasks;
    totalCpu += agent.resourceProfile.maxCpuPercent * loadFactor;
    totalMemory += agent.resourceProfile.maxMemoryMB * loadFactor;
    totalIo += agent.resourceProfile.maxIoOperations * loadFactor;
    totalNetwork += 50 * loadFactor;
  }

  const agentCount = agents.length;
  return {
    cpu: Math.min(100, (totalCpu / agentCount) * (orchestratorState.runningTasks.size / Math.max(1, orchestratorState.config.maxParallelTasks))),
    memory: Math.min(100, (totalMemory / (agentCount * 1024)) * 100),
    io: Math.min(100, (totalIo / (agentCount * 100)) * 100),
    network: Math.min(100, (totalNetwork / (agentCount * 100)) * 100),
  };
}

export function canScheduleTask(): boolean {
  const runningCount = orchestratorState.runningTasks.size;
  const maxParallel = orchestratorState.config.maxParallelTasks;

  if (runningCount >= maxParallel) return false;

  const utilization = calculateResourceUtilization();
  if (utilization.cpu > 90 || utilization.memory > 90) return false;

  return true;
}

export function findBestAgent(
  requiredCapabilities: string[],
  preferredAgentId?: string,
): EnhancedAgentDefinition | null {
  if (preferredAgentId) {
    const agent = getAgent(preferredAgentId);
    if (agent && agent.status !== "failed" && agent.status !== "terminated" && agent.currentLoad < agent.maxConcurrentTasks) {
      return agent;
    }
  }

  const candidates = getAvailableAgents();
  if (candidates.length === 0) return null;

  let bestAgent: EnhancedAgentDefinition | null = null;
  let bestScore = -1;

  for (const agent of candidates) {
    let score = 0;

    const matchingCapabilities = requiredCapabilities.filter((capId) =>
      agent.capabilities.some((c) => c.id === capId),
    );
    score += matchingCapabilities.length * 10;

    const avgProficiency = agent.capabilities
      .filter((c) => requiredCapabilities.includes(c.id))
      .reduce((sum, c) => sum + c.proficiencyScore, 0) / Math.max(1, matchingCapabilities.length);
    score += avgProficiency;

    score -= agent.failureCount * 5;

    score += agent.resourceProfile.priority * 2;

    score += (1 - agent.currentLoad / agent.maxConcurrentTasks) * 3;

    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }

  return bestAgent;
}

export function calculateProficiencyScore(
  agent: EnhancedAgentDefinition,
  capabilityId: string,
): number {
  const capability = agent.capabilities.find((c) => c.id === capabilityId);
  if (!capability) return 0;

  let score = capability.proficiencyScore;

  score -= agent.failureCount * 0.1;

  const loadFactor = 1 - (agent.currentLoad / agent.maxConcurrentTasks);
  score *= (0.5 + loadFactor * 0.5);

  return Math.max(0, Math.min(10, score));
}

export function estimateExecutionTime(
  agent: EnhancedAgentDefinition,
  capabilityId: string,
): number {
  const capability = agent.capabilities.find((c) => c.id === capabilityId);
  if (!capability) return Infinity;

  const baseTime = capability.executionTimeEstimate;
  const loadFactor = 1 + (agent.currentLoad / agent.maxConcurrentTasks) * 0.5;
  const failurePenalty = 1 + agent.failureCount * 0.1;

  return baseTime * loadFactor * failurePenalty;
}

export function getResourceRequirements(
  agent: EnhancedAgentDefinition,
  capabilityId: string,
): ResourceRequirements | null {
  const capability = agent.capabilities.find((c) => c.id === capabilityId);
  return capability?.resourceRequirements ?? null;
}

export function checkResourceAvailability(
  requirements: ResourceRequirements,
): boolean {
  const utilization = calculateResourceUtilization();

  const cpuHeadroom = 100 - utilization.cpu;
  const memoryHeadroom = 100 - utilization.memory;

  const requiredCpuPercent = requirements.cpuWeight * 25;
  const requiredMemoryPercent = (requirements.memoryMB / 1024) * 100;

  return cpuHeadroom >= requiredCpuPercent && memoryHeadroom >= requiredMemoryPercent;
}

export function resetOrchestrator(): void {
  orchestratorState = {
    agents: new Map(),
    taskQueue: [],
    runningTasks: new Map(),
    completedTasks: new Map(),
    metrics: createInitialMetrics(),
    config: defaultSchedulerConfig,
  };
}

export function getOrchestratorState(): OrchestratorState {
  return orchestratorState;
}

export function updateMetrics(): void {
  const agents = getAllAgents();
  const runningTasks = Array.from(orchestratorState.runningTasks.values());
  const completedTasks = Array.from(orchestratorState.completedTasks.values());

  orchestratorState.metrics = {
    totalAgents: agents.length,
    activeAgents: agents.filter((a) => a.status !== "terminated").length,
    totalTasks: orchestratorState.taskQueue.length + runningTasks.length + completedTasks.length,
    completedTasks: completedTasks.filter((t) => t.success).length,
    failedTasks: completedTasks.filter((t) => !t.success).length,
    averageExecutionTime: completedTasks.length > 0
      ? completedTasks.reduce((sum, t) => sum + t.duration, 0) / completedTasks.length
      : 0,
    parallelSpeedup: calculateParallelSpeedup(),
    resourceUtilization: calculateResourceUtilization(),
    conflictRate: 0,
    timestamp: new Date().toISOString(),
  };
}

function calculateParallelSpeedup(): number {
  const runningCount = orchestratorState.runningTasks.size;
  if (runningCount <= 1) return 1;

  const completedTasks = Array.from(orchestratorState.completedTasks.values());
  if (completedTasks.length === 0) return 1;

  const sequentialTime = completedTasks.reduce((sum, t) => sum + t.duration, 0);
  const parallelTime = Math.max(...completedTasks.map((t) => t.duration), 1);

  return Math.min(runningCount, sequentialTime / parallelTime);
}
