import type {
  ExecutionMetrics,
  SystemMetrics,
  ResourceUtilization,
} from "./types";
import {
  getAllAgents,
  getOrchestratorState,
  calculateResourceUtilization,
} from "./orchestrator";
import {
  getTaskStats,
} from "./task-router";
import {
  getFaultStats,
} from "./fault-detection";

type MetricSnapshot = {
  timestamp: string;
  metrics: SystemMetrics;
};

const metricHistory: MetricSnapshot[] = [];
const MAX_HISTORY_SIZE = 1000;

export function collectMetrics(): SystemMetrics {
  const agents = getAllAgents();
  const taskStats = getTaskStats();
  const faultStats = getFaultStats();
  const resourceUtilization = calculateResourceUtilization();

  const allExecutionMetrics: ExecutionMetrics[] = [];
  for (const agent of agents) {
    const history = getAgentExecutionHistory(agent.id);
    allExecutionMetrics.push(...history);
  }

  const completedMetrics = allExecutionMetrics.filter((m) => m.endTime);
  const averageExecutionTime = completedMetrics.length > 0
    ? completedMetrics.reduce((sum, m) => sum + (m.duration ?? 0), 0) / completedMetrics.length
    : 0;

  const parallelSpeedup = calculateParallelSpeedup(completedMetrics);

  const conflictRate = faultStats.totalFaults > 0
    ? faultStats.totalFaults / Math.max(1, taskStats.completed + taskStats.failed)
    : 0;

  const metrics: SystemMetrics = {
    totalAgents: agents.length,
    activeAgents: agents.filter((a) => a.status !== "terminated").length,
    totalTasks: taskStats.pending + taskStats.running + taskStats.completed + taskStats.failed,
    completedTasks: taskStats.completed,
    failedTasks: taskStats.failed,
    averageExecutionTime,
    parallelSpeedup,
    resourceUtilization,
    conflictRate,
    timestamp: new Date().toISOString(),
  };

  metricHistory.push({ timestamp: metrics.timestamp, metrics });
  if (metricHistory.length > MAX_HISTORY_SIZE) {
    metricHistory.shift();
  }

  return metrics;
}

function getAgentExecutionHistory(agentId: string): ExecutionMetrics[] {
  const history: ExecutionMetrics[] = [];
  const state = getOrchestratorState();

  for (const task of state.completedTasks.values()) {
    if (task.agentId === agentId) {
      history.push({
        agentId,
        taskId: task.taskId,
        startTime: "",
        endTime: "",
        duration: task.duration,
        cpuUsage: 0,
        memoryUsage: 0,
        ioOperations: 0,
        networkBytes: 0,
        toolCalls: task.toolCalls,
        success: task.success,
      });
    }
  }

  return history;
}

function calculateParallelSpeedup(metrics: ExecutionMetrics[]): number {
  if (metrics.length <= 1) return 1;

  const sequentialTime = metrics.reduce((sum, m) => sum + (m.duration ?? 0), 0);
  const parallelTime = Math.max(...metrics.map((m) => m.duration ?? 0), 1);

  return Math.min(metrics.length, sequentialTime / parallelTime);
}

export function getMetricHistory(limit?: number): MetricSnapshot[] {
  if (limit) {
    return metricHistory.slice(-limit);
  }
  return [...metricHistory];
}

export function getLatestMetrics(): SystemMetrics | null {
  return metricHistory.length > 0
    ? metricHistory[metricHistory.length - 1].metrics
    : null;
}

export function getAverageMetrics(windowSize: number = 10): SystemMetrics | null {
  if (metricHistory.length === 0) return null;

  const window = metricHistory.slice(-windowSize);
  if (window.length === 0) return null;

  const avgMetrics: SystemMetrics = {
    totalAgents: Math.round(window.reduce((sum, m) => sum + m.metrics.totalAgents, 0) / window.length),
    activeAgents: Math.round(window.reduce((sum, m) => sum + m.metrics.activeAgents, 0) / window.length),
    totalTasks: Math.round(window.reduce((sum, m) => sum + m.metrics.totalTasks, 0) / window.length),
    completedTasks: Math.round(window.reduce((sum, m) => sum + m.metrics.completedTasks, 0) / window.length),
    failedTasks: Math.round(window.reduce((sum, m) => sum + m.metrics.failedTasks, 0) / window.length),
    averageExecutionTime: window.reduce((sum, m) => sum + m.metrics.averageExecutionTime, 0) / window.length,
    parallelSpeedup: window.reduce((sum, m) => sum + m.metrics.parallelSpeedup, 0) / window.length,
    resourceUtilization: {
      cpu: window.reduce((sum, m) => sum + m.metrics.resourceUtilization.cpu, 0) / window.length,
      memory: window.reduce((sum, m) => sum + m.metrics.resourceUtilization.memory, 0) / window.length,
      io: window.reduce((sum, m) => sum + m.metrics.resourceUtilization.io, 0) / window.length,
      network: window.reduce((sum, m) => sum + m.metrics.resourceUtilization.network, 0) / window.length,
    },
    conflictRate: window.reduce((sum, m) => sum + m.metrics.conflictRate, 0) / window.length,
    timestamp: new Date().toISOString(),
  };

  return avgMetrics;
}

export function identifyBottlenecks(): Bottleneck[] {
  const bottlenecks: Bottleneck[] = [];
  const metrics = getLatestMetrics();

  if (!metrics) return bottlenecks;

  if (metrics.resourceUtilization.cpu > 80) {
    bottlenecks.push({
      type: "resource",
      severity: "high",
      description: "CPU utilization is high",
      metric: "cpu",
      value: metrics.resourceUtilization.cpu,
      threshold: 80,
    });
  }

  if (metrics.resourceUtilization.memory > 80) {
    bottlenecks.push({
      type: "resource",
      severity: "high",
      description: "Memory utilization is high",
      metric: "memory",
      value: metrics.resourceUtilization.memory,
      threshold: 80,
    });
  }

  if (metrics.failedTasks > metrics.completedTasks * 0.2) {
    bottlenecks.push({
      type: "reliability",
      severity: "medium",
      description: "High failure rate detected",
      metric: "failure_rate",
      value: metrics.failedTasks / Math.max(1, metrics.completedTasks + metrics.failedTasks),
      threshold: 0.2,
    });
  }

  if (metrics.parallelSpeedup < 1.5 && metrics.activeAgents > 1) {
    bottlenecks.push({
      type: "parallelism",
      severity: "medium",
      description: "Parallel speedup is lower than expected",
      metric: "parallel_speedup",
      value: metrics.parallelSpeedup,
      threshold: 1.5,
    });
  }

  return bottlenecks;
}

export type Bottleneck = {
  type: "resource" | "reliability" | "parallelism" | "conflict";
  severity: "low" | "medium" | "high";
  description: string;
  metric: string;
  value: number;
  threshold: number;
};

export type OptimizationRecommendation = {
  type: string;
  priority: "low" | "medium" | "high";
  description: string;
  expectedImpact: string;
  implementationEffort: "low" | "medium" | "high";
};

export function generateRecommendations(): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];
  const bottlenecks = identifyBottlenecks();

  for (const bottleneck of bottlenecks) {
    switch (bottleneck.type) {
      case "resource":
        if (bottleneck.metric === "cpu") {
          recommendations.push({
            type: "resource_optimization",
            priority: "high",
            description: "Consider reducing max parallel tasks or adding more agents to distribute CPU load",
            expectedImpact: "Reduce CPU utilization by 20-30%",
            implementationEffort: "low",
          });
        }
        if (bottleneck.metric === "memory") {
          recommendations.push({
            type: "resource_optimization",
            priority: "high",
            description: "Consider optimizing agent memory usage or increasing available memory",
            expectedImpact: "Reduce memory utilization by 15-25%",
            implementationEffort: "medium",
          });
        }
        break;

      case "reliability":
        recommendations.push({
          type: "fault_tolerance",
          priority: "medium",
          description: "Investigate root causes of task failures and implement additional error handling",
          expectedImpact: "Reduce failure rate by 50-70%",
          implementationEffort: "high",
        });
        break;

      case "parallelism":
        recommendations.push({
          type: "parallel_optimization",
          priority: "medium",
          description: "Review task dependencies and consider splitting tasks for better parallelization",
          expectedImpact: "Improve parallel speedup by 30-50%",
          implementationEffort: "medium",
        });
        break;

      case "conflict":
        recommendations.push({
          type: "conflict_reduction",
          priority: "low",
          description: "Analyze conflict patterns and adjust workspace access patterns",
          expectedImpact: "Reduce conflicts by 40-60%",
          implementationEffort: "low",
        });
        break;
    }
  }

  if (recommendations.length === 0) {
    recommendations.push({
      type: "general",
      priority: "low",
      description: "System is performing well. No immediate optimizations needed.",
      expectedImpact: "Maintain current performance",
      implementationEffort: "low",
    });
  }

  return recommendations;
}

export function analyzeConflictPatterns(): ConflictPatternAnalysis {
  const faultStats = getFaultStats();

  return {
    totalConflicts: faultStats.totalFaults,
    conflictsByType: faultStats.byType,
    resolutionRate: faultStats.totalFaults > 0
      ? faultStats.recovered / faultStats.totalFaults
      : 1,
    averageResolutionTime: 0,
    commonConflictKeys: [],
  };
}

export type ConflictPatternAnalysis = {
  totalConflicts: number;
  conflictsByType: Record<string, number>;
  resolutionRate: number;
  averageResolutionTime: number;
  commonConflictKeys: string[];
};

export function getResourceUtilizationTrend(
  metric: keyof ResourceUtilization,
  windowSize: number = 10,
): number[] {
  const history = getMetricHistory(windowSize);
  return history.map((h) => h.metrics.resourceUtilization[metric]);
}

export function clearMetricHistory(): void {
  metricHistory.length = 0;
}

export function resetMetrics(): void {
  clearMetricHistory();
}
