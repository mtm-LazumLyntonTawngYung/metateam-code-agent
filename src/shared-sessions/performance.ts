import { randomBytes } from "crypto";

export type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
  maxBurst?: number;
  keyGenerator?: (clientId: string) => string;
};

export type RateLimitBucket = {
  count: number;
  resetAt: number;
  lastRequest: number;
};

export type Metrics = {
  totalConnections: number;
  activeConnections: number;
  totalOperations: number;
  operationsPerSecond: number;
  averageLatency: number;
  errorRate: number;
  memoryUsage: number;
  cpuUsage: number;
};

export type HealthStatus = {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  metrics: Metrics;
  issues: string[];
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();
const metrics: Metrics = {
  totalConnections: 0,
  activeConnections: 0,
  totalOperations: 0,
  operationsPerSecond: 0,
  averageLatency: 0,
  errorRate: 0,
  memoryUsage: 0,
  cpuUsage: 0,
};

const operationTimestamps: number[] = [];
const latencySum = { value: 0, count: 0 };
let errorCount = 0;
let totalRequests = 0;
let startTime = Date.now();

export function checkRateLimit(clientId: string, config: RateLimitConfig): boolean {
  const key = config.keyGenerator ? config.keyGenerator(clientId) : clientId;
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
      lastRequest: now,
    });
    return true;
  }

  bucket.count++;
  bucket.lastRequest = now;

  if (config.maxBurst && bucket.count > config.maxBurst) {
    return false;
  }

  return bucket.count <= config.maxRequests;
}

export function getRateLimitStatus(clientId: string, config: RateLimitConfig): {
  remaining: number;
  resetAt: number;
  limited: boolean;
} {
  const key = config.keyGenerator ? config.keyGenerator(clientId) : clientId;
  const bucket = rateLimitBuckets.get(key);
  const now = Date.now();

  if (!bucket || now > bucket.resetAt) {
    return { remaining: config.maxRequests, resetAt: now + config.windowMs, limited: false };
  }

  const remaining = Math.max(0, config.maxRequests - bucket.count);
  return { remaining, resetAt: bucket.resetAt, limited: remaining === 0 };
}

export function cleanupExpiredBuckets(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, bucket] of rateLimitBuckets) {
    if (now > bucket.resetAt) {
      rateLimitBuckets.delete(key);
      cleaned++;
    }
  }

  return cleaned;
}

export function trackConnection(): void {
  metrics.totalConnections++;
  metrics.activeConnections++;
}

export function trackDisconnection(): void {
  metrics.activeConnections = Math.max(0, metrics.activeConnections - 1);
}

export function trackOperation(latencyMs: number): void {
  metrics.totalOperations++;
  operationTimestamps.push(Date.now());
  latencySum.value += latencyMs;
  latencySum.count++;

  const now = Date.now();
  const oneSecondAgo = now - 1000;
  while (operationTimestamps.length > 0 && operationTimestamps[0] < oneSecondAgo) {
    operationTimestamps.shift();
  }
  metrics.operationsPerSecond = operationTimestamps.length;
  metrics.averageLatency = latencySum.count > 0 ? latencySum.value / latencySum.count : 0;
}

export function trackError(): void {
  errorCount++;
  totalRequests++;
  metrics.errorRate = totalRequests > 0 ? errorCount / totalRequests : 0;
}

export function trackRequest(): void {
  totalRequests++;
}

export function getMetrics(): Metrics {
  const memUsage = process.memoryUsage();
  metrics.memoryUsage = memUsage.heapUsed / 1024 / 1024;

  return { ...metrics };
}

export function getHealthStatus(): HealthStatus {
  const now = new Date();
  const uptime = (Date.now() - startTime) / 1000;
  const issues: string[] = [];

  if (metrics.errorRate > 0.1) {
    issues.push("High error rate detected");
  }

  if (metrics.averageLatency > 1000) {
    issues.push("High latency detected");
  }

  if (metrics.memoryUsage > 500) {
    issues.push("High memory usage detected");
  }

  let status: "healthy" | "degraded" | "unhealthy" = "healthy";
  if (issues.length > 2) {
    status = "unhealthy";
  } else if (issues.length > 0) {
    status = "degraded";
  }

  return {
    status,
    timestamp: now.toISOString(),
    uptime,
    metrics: getMetrics(),
    issues,
  };
}

export function resetMetrics(): void {
  metrics.totalConnections = 0;
  metrics.activeConnections = 0;
  metrics.totalOperations = 0;
  metrics.operationsPerSecond = 0;
  metrics.averageLatency = 0;
  metrics.errorRate = 0;
  operationTimestamps.length = 0;
  latencySum.value = 0;
  latencySum.count = 0;
  errorCount = 0;
  totalRequests = 0;
  startTime = Date.now();
}

export function createLoadBalancer(): {
  addServer: (serverId: string, weight?: number) => void;
  removeServer: (serverId: string) => void;
  getServer: () => string | null;
  getServerCount: () => number;
} {
  const servers = new Map<string, { weight: number; connections: number }>();

  return {
    addServer: (serverId: string, weight = 1) => {
      servers.set(serverId, { weight, connections: 0 });
    },
    removeServer: (serverId: string) => {
      servers.delete(serverId);
    },
    getServer: (): string | null => {
      let minConnections = Infinity;
      let selected: string | null = null;

      for (const [serverId, server] of servers) {
        const normalizedConnections = server.connections / server.weight;
        if (normalizedConnections < minConnections) {
          minConnections = normalizedConnections;
          selected = serverId;
        }
      }

      if (selected) {
        const server = servers.get(selected)!;
        server.connections++;
      }

      return selected;
    },
    getServerCount: () => servers.size,
  };
}

export function createConnectionPool(
  maxConnections: number,
): {
  acquire: () => string | null;
  release: (connectionId: string) => void;
  getAvailable: () => number;
  getTotal: () => number;
} {
  const activeConnections = new Set<string>();
  const waitingQueue: Array<(id: string) => void> = [];

  return {
    acquire: (): string | null => {
      if (activeConnections.size < maxConnections) {
        const id = randomBytes(8).toString("hex");
        activeConnections.add(id);
        return id;
      }
      return null;
    },
    release: (connectionId: string) => {
      activeConnections.delete(connectionId);
      if (waitingQueue.length > 0) {
        const resolve = waitingQueue.shift()!;
        const newId = randomBytes(8).toString("hex");
        activeConnections.add(newId);
        resolve(newId);
      }
    },
    getAvailable: () => maxConnections - activeConnections.size,
    getTotal: () => activeConnections.size,
  };
}

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number,
): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return ((...args: unknown[]) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  }) as T;
}

export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limitMs: number,
): T {
  let lastCall = 0;

  return ((...args: unknown[]) => {
    const now = Date.now();
    if (now - lastCall >= limitMs) {
      lastCall = now;
      fn(...args);
    }
  }) as T;
}
