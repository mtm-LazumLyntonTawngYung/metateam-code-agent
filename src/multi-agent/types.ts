import type { AgentDefinition } from "../agents/types";

export type AgentCapability = {
  id: string;
  name: string;
  description: string;
  requiredPermissions: string[];
  proficiencyScore: number;
  executionTimeEstimate: number;
  resourceRequirements: ResourceRequirements;
};

export type ResourceRequirements = {
  cpuWeight: number;
  memoryMB: number;
  ioWeight: number;
  networkWeight: number;
};

export type EnhancedAgentDefinition = AgentDefinition & {
  capabilities: AgentCapability[];
  maxConcurrentTasks: number;
  currentLoad: number;
  failureCount: number;
  lastActiveAt: string;
  status: AgentStatus;
  resourceProfile: ResourceProfile;
};

export type AgentStatus = "idle" | "busy" | "failed" | "recovery" | "terminated";

export type ResourceProfile = {
  maxCpuPercent: number;
  maxMemoryMB: number;
  maxIoOperations: number;
  priority: number;
  weight: number;
};

export type TaskDefinition = {
  id: string;
  name: string;
  description: string;
  requiredCapabilities: string[];
  priority: TaskPriority;
  timeout: number;
  retryCount: number;
  dependencies: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
};

export type TaskPriority = "critical" | "high" | "normal" | "low";

export type TaskStatus = "pending" | "scheduled" | "running" | "completed" | "failed" | "cancelled" | "retrying";

export type ScheduledTask = TaskDefinition & {
  assignedAgentId: string;
  status: TaskStatus;
  attempts: number;
  lastError?: string;
  startedAt?: string;
  completedAt?: string;
  result?: TaskResult;
};

export type TaskResult = {
  success: boolean;
  output: string;
  error?: string;
  toolCalls: number;
  duration: number;
  agentId: string;
  taskId: string;
};

export type WorkspaceEntry = {
  key: string;
  value: unknown;
  version: number;
  lastModifiedBy: string;
  lastModifiedAt: string;
  checksum: string;
  metadata: Record<string, unknown>;
};

export type WorkspaceOperation = {
  type: "read" | "write" | "delete";
  key: string;
  value?: unknown;
  expectedVersion?: number;
  agentId: string;
  timestamp: string;
};

export type WorkspaceResult = {
  success: boolean;
  entry?: WorkspaceEntry;
  conflict?: ConflictInfo;
  error?: string;
};

export type ConflictInfo = {
  key: string;
  currentVersion: number;
  expectedVersion: number;
  lastModifiedBy: string;
  lastModifiedAt: string;
};

export type ConflictResolution = {
  strategy: "auto-merge" | "manual" | "last-write-wins" | "custom";
  resolver?: (local: unknown, remote: unknown) => unknown;
};

export type AgentMessage = {
  id: string;
  fromAgentId: string;
  toAgentId?: string;
  type: MessageType;
  payload: unknown;
  timestamp: string;
  requiresResponse: boolean;
};

export type MessageType = "task_request" | "task_result" | "workspace_update" | "heartbeat" | "status_change" | "error_report";

export type ExecutionMetrics = {
  agentId: string;
  taskId: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  cpuUsage: number;
  memoryUsage: number;
  ioOperations: number;
  networkBytes: number;
  toolCalls: number;
  success: boolean;
  error?: string;
};

export type SystemMetrics = {
  totalAgents: number;
  activeAgents: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageExecutionTime: number;
  parallelSpeedup: number;
  resourceUtilization: ResourceUtilization;
  conflictRate: number;
  timestamp: string;
};

export type ResourceUtilization = {
  cpu: number;
  memory: number;
  io: number;
  network: number;
};

export type SchedulerConfig = {
  maxParallelTasks: number;
  resourceCheckInterval: number;
  taskTimeout: number;
  heartbeatInterval: number;
  maxRetries: number;
  enableResourceMonitoring: boolean;
};

export type OrchestratorState = {
  agents: Map<string, EnhancedAgentDefinition>;
  taskQueue: ScheduledTask[];
  runningTasks: Map<string, ScheduledTask>;
  completedTasks: Map<string, TaskResult>;
  metrics: SystemMetrics;
  config: SchedulerConfig;
};

export type WorkspaceConfig = {
  maxVersions: number;
  conflictDetectionEnabled: boolean;
  autoMergeEnabled: boolean;
  accessControlEnabled: boolean;
  snapshotInterval: number;
};

export type CoordinatorConfig = {
  enableCollaborationProtocol: boolean;
  messageTimeout: number;
  maxMessageQueueSize: number;
  enableExecutionMonitoring: boolean;
  enableDependencyResolution: boolean;
};
