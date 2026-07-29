/**
 * DevOps MCP Bridge
 *
 * Connects mtc to infrastructure monitoring and orchestration tools:
 * - Datadog log/event querying
 * - CloudWatch log insight queries
 * - Kubernetes API status checks
 * - Terraform plan analysis
 *
 * Usage:
 *   1. Set required env vars (see each tool's requirements)
 *   2. Register in .mtc/mcp.json:
 *      {
 *        "mcpServers": {
 *          "devops": {
 *            "command": "bun",
 *            "args": ["run", "src/mcp-plugins/devops-bridge.ts"]
 *          }
 *        }
 *      }
 *   3. Restart mtc
 */

type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

const tools = new Map<string, { def: ToolDef; handler: Handler }>();

function register(def: ToolDef, handler: Handler): void {
  tools.set(def.name, { def, handler });
}

register({
  name: "datadog_query_logs",
  description: "Query Datadog logs with a search filter and time range",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Datadog log search query (e.g. 'service:api status:error')" },
      hoursAgo: { type: "number", description: "How far back to search in hours (default: 1)" },
      limit: { type: "number", description: "Max log entries to return (default: 20)" },
    },
    required: ["query"],
  },
}, async (args) => {
  const apiKey = process.env.DATADOG_API_KEY ?? "";
  const appKey = process.env.DATADOG_APP_KEY ?? "";
  if (!apiKey || !appKey) throw new Error("DATADOG_API_KEY and DATADOG_APP_KEY are required");

  const now = Math.floor(Date.now() / 1000);
  const hoursAgo = (args.hoursAgo as number) ?? 1;
  const from = now - hoursAgo * 3600;

  const res = await fetch("https://api.datadoghq.com/api/v2/logs/events/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "DD-API-KEY": apiKey,
      "DD-APPLICATION-KEY": appKey,
    },
    body: JSON.stringify({
      filter: {
        query: args.query as string,
        from: new Date(from * 1000).toISOString(),
        to: new Date(now * 1000).toISOString(),
      },
      page: { limit: (args.limit as number) ?? 20 },
      sort: "-timestamp",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Datadog API ${res.status}: ${text}`);
  }

  const data = await res.json() as {
    data?: Array<{
      attributes: {
        timestamp: string;
        message: string;
        status: string;
        service: string;
        tags?: string[];
      };
    }>;
    meta?: { page?: { total?: number } };
  };

  const logs = (data.data ?? []).map((entry) => ({
    timestamp: entry.attributes.timestamp,
    message: entry.attributes.message?.slice(0, 500),
    status: entry.attributes.status,
    service: entry.attributes.service,
    tags: entry.attributes.tags,
  }));

  return {
    total: data.meta?.page?.total ?? logs.length,
    returned: logs.length,
    query: args.query,
    timeRange: `${hoursAgo}h ago to now`,
    logs,
  };
});

register({
  name: "datadog_query_metrics",
  description: "Query Datadog metric timeseries data",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Datadog metric query (e.g. 'avg:system.cpu.user{*}')" },
      hoursAgo: { type: "number", description: "Time range in hours (default: 1)" },
    },
    required: ["query"],
  },
}, async (args) => {
  const apiKey = process.env.DATADOG_API_KEY ?? "";
  const appKey = process.env.DATADOG_APP_KEY ?? "";
  if (!apiKey || !appKey) throw new Error("DATADOG_API_KEY and DATADOG_APP_KEY are required");

  const now = Math.floor(Date.now() / 1000);
  const hoursAgo = (args.hoursAgo as number) ?? 1;
  const from = now - hoursAgo * 3600;

  const res = await fetch(`https://api.datadoghq.com/api/v1/query?from=${from}&to=${now}&query=${encodeURIComponent(args.query as string)}`, {
    headers: {
      "DD-API-KEY": apiKey,
      "DD-APPLICATION-KEY": appKey,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Datadog API ${res.status}: ${text}`);
  }

  const data = await res.json() as {
    series?: Array<{
      metric: string;
      display_name?: string;
      pointlist?: Array<[number, number]>;
      tag_set?: string[];
      unit?: Array<{ family: string; name: string }>;
    }>;
  };

  const series = (data.series ?? []).map((s) => ({
    metric: s.metric,
    displayName: s.display_name,
    points: (s.pointlist ?? []).slice(-60).map(([ts, val]) => ({
      timestamp: new Date((ts as number) * 1000).toISOString(),
      value: val,
    })),
    tags: s.tag_set,
    unit: s.unit?.[0],
  }));

  return {
    seriesCount: series.length,
    series,
  };
});

register({
  name: "cloudwatch_query_logs",
  description: "Query AWS CloudWatch Logs Insights",
  parameters: {
    type: "object",
    properties: {
      logGroupName: { type: "string", description: "CloudWatch log group name" },
      queryString: { type: "string", description: "CloudWatch Logs Insights query" },
      hoursAgo: { type: "number", description: "Time range in hours (default: 1)" },
      limit: { type: "number", description: "Max results (default: 20)" },
      region: { type: "string", description: "AWS region (default: us-east-1)" },
    },
    required: ["logGroupName", "queryString"],
  },
}, async (args) => {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? "";
  const region = (args.region as string) ?? "us-east-1";

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required");
  }

  const now = Date.now();
  const hoursAgo = (args.hoursAgo as number) ?? 1;
  const startTime = now - hoursAgo * 3600 * 1000;

  const queryBody = {
    logGroupNames: [args.logGroupName as string],
    queryString: (args.queryString as string) + ` | limit ${(args.limit as number) ?? 20}`,
    startTime,
    endTime: now,
    limit: (args.limit as number) ?? 20,
  };

  const res = await fetch(`https://logs.${region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "Logs_20140328.StartQuery",
    },
    body: JSON.stringify(queryBody),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CloudWatch API ${res.status}: ${text}`);
  }

  const queryResult = await res.json() as { queryId: string };

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const resultsRes = await fetch(`https://logs.${region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "Logs_20140328.GetQueryResults",
    },
    body: JSON.stringify({ queryId: queryResult.queryId }),
  });

  if (!resultsRes.ok) {
    const text = await resultsRes.text().catch(() => "");
    throw new Error(`CloudWatch API ${resultsRes.status}: ${text}`);
  }

  const resultsData = await resultsRes.json() as {
    results?: Array<Array<{ field: string; value: string }>>;
    status?: string;
    statistics?: { recordsScanned?: number; bytesScanned?: number };
  };

  const results = (resultsData.results ?? []).map((row) => {
    const entry: Record<string, string> = {};
    for (const field of row) entry[field.field] = field.value;
    return entry;
  });

  return {
    queryId: queryResult.queryId,
    status: resultsData.status,
    resultsCount: results.length,
    statistics: resultsData.statistics ?? {},
    results,
  };
});

register({
  name: "k8s_analyze_manifest",
  description: "Analyze a Kubernetes manifest for common issues and best practices",
  parameters: {
    type: "object",
    properties: {
      yaml: { type: "string", description: "Kubernetes manifest YAML content" },
      checkSecurity: { type: "boolean", description: "Run security checks (default: true)" },
      checkResources: { type: "boolean", description: "Check resource limits (default: true)" },
    },
    required: ["yaml"],
  },
}, async (args) => {
  const yaml = args.yaml as string;
  const findings: Array<{ severity: "error" | "warning" | "info"; message: string; line?: number }> = [];

  const lines = yaml.split("\n");

  if (args.checkSecurity !== false) {
    const privEscalation = yaml.match(/allowPrivilegeEscalation:\s*true/i);
    if (privEscalation) {
      findings.push({ severity: "error", message: "allowPrivilegeEscalation: true is a security risk" });
    }

    const runAsRoot = yaml.match(/runAsNonRoot:\s*false/i);
    if (runAsRoot) {
      findings.push({ severity: "warning", message: "Container allowed to run as root" });
    }

    const noReadOnlyFS = !yaml.match(/readOnlyRootFilesystem:\s*true/i);
    if (noReadOnlyFS && (yaml.includes("containers:") || yaml.includes("spec:"))) {
      findings.push({ severity: "info", message: "readOnlyRootFilesystem not set to true (recommended for security)" });
    }

    const noServiceAccount = !yaml.match(/serviceAccountName:/);
    if (yaml.includes("Pod") || yaml.includes("Deployment") || yaml.includes("StatefulSet")) {
      findings.push({ severity: "info", message: "No explicit serviceAccountName set (uses 'default')" });
    }
  }

  if (args.checkResources !== false) {
    const hasResourceLimits = yaml.match(/resources:/);
    if (!hasResourceLimits && (yaml.includes("containers:") || yaml.includes("spec:"))) {
      findings.push({ severity: "warning", message: "No resource limits defined (risk of resource starvation)" });
    }

    const hasRequests = yaml.match(/requests:/);
    const hasLimits = yaml.match(/limits:/);
    if (hasResourceLimits && !hasRequests) {
      findings.push({ severity: "warning", message: "Resource requests not defined (may affect scheduling)" });
    }
    if (hasResourceLimits && !hasLimits) {
      findings.push({ severity: "warning", message: "Resource limits not defined (risk of runaway resource usage)" });
    }
  }

  if (yaml.includes("image: latest")) {
    findings.push({ severity: "warning", message: "Using 'latest' image tag (not reproducible)" });
  }

  if (!yaml.match(/livenessProbe:/) && (yaml.includes("Deployment") || yaml.includes("Pod"))) {
    findings.push({ severity: "warning", message: "No livenessProbe defined (kubelet can't restart unhealthy container)" });
  }

  if (!yaml.match(/readinessProbe:/) && (yaml.includes("Deployment") || yaml.includes("Pod"))) {
    findings.push({ severity: "info", message: "No readinessProbe defined (traffic may be sent to unhealthy pods)" });
  }

  const imageRefs = yaml.match(/image:\s*([^\s]+)/g);
  const images = imageRefs?.map((r) => r.replace(/image:\s*/, "").trim()) ?? [];

  return {
    resourceCount: (yaml.match(/^---/g) ?? []).length + 1,
    findings,
    summary: {
      errors: findings.filter((f) => f.severity === "error").length,
      warnings: findings.filter((f) => f.severity === "warning").length,
      info: findings.filter((f) => f.severity === "info").length,
    },
    images,
  };
});

register({
  name: "terraform_analyze_plan",
  description: "Analyze a Terraform plan output or HCL for issues and optimization opportunities",
  parameters: {
    type: "object",
    properties: {
      hcl: { type: "string", description: "Terraform HCL content or plan output" },
    },
    required: ["hcl"],
  },
}, async (args) => {
  const hcl = args.hcl as string;
  const findings: Array<{ severity: "error" | "warning" | "suggestion"; message: string }> = [];

  const providers = hcl.match(/provider\s+"([^"]+)"/g);
  if (providers && !hcl.match(/required_providers/)) {
    findings.push({ severity: "suggestion", message: "Use 'required_providers' block to pin provider versions" });
  }

  if (hcl.match(/resource\s+"[^"]+"\s+"[^"]+"\s*\{/g) && !hcl.match(/terraform\s*\{/)) {
    findings.push({ severity: "suggestion", message: "Add a 'terraform' block with backend configuration" });
  }

  if (!hcl.match(/backend\s+/)) {
    findings.push({ severity: "warning", message: "No backend configured (state stored locally)" });
  }

  if (hcl.match(/count\s*=/)) {
    findings.push({ severity: "suggestion", message: "Consider using 'for_each' instead of 'count' for better resource management" });
  }

  if (!hcl.match(/tags\s*=/)) {
    findings.push({ severity: "suggestion", message: "No tags defined on resources (recommended for cost tracking and organization)" });
  }

  if (hcl.match(/source\s*=\s*["'][^"']+["']/) && !hcl.match(/version\s*=/)) {
    findings.push({ severity: "warning", message: "Module sources should pin a version" });
  }

  const sensitiveValues = ["password", "secret", "api_key", "private_key"];
  for (const val of sensitiveValues) {
    const regex = new RegExp(`${val}\\s*=\\s*["'][^"']+["']`, "gi");
    if (hcl.match(regex)) {
      findings.push({ severity: "error", message: `Sensitive value '${val}' may be hardcoded (use variable or secret store)` });
    }
  }

  return {
    findings,
    summary: {
      errors: findings.filter((f) => f.severity === "error").length,
      warnings: findings.filter((f) => f.severity === "warning").length,
      suggestions: findings.filter((f) => f.severity === "suggestion").length,
    },
    resourceCount: (hcl.match(/resource\s+"[^"]+"/g) ?? []).length,
    dataSourceCount: (hcl.match(/data\s+"[^"]+"/g) ?? []).length,
    moduleCount: (hcl.match(/module\s+"[^"]+"/g) ?? []).length,
  };
});

register({
  name: "devops_diagnose_logs",
  description: "Analyze log snippets for common infrastructure patterns and suggest fixes",
  parameters: {
    type: "object",
    properties: {
      logs: { type: "string", description: "Log text to analyze" },
      source: { type: "string", description: "Log source (k8s, nginx, app, docker, system)" },
    },
    required: ["logs"],
  },
}, async (args) => {
  const logs = args.logs as string;
  const source = (args.source as string) ?? "generic";

  const patterns: Array<{
    pattern: RegExp;
    severity: "critical" | "warning" | "info";
    diagnosis: string;
    suggestion: string;
  }> = [];

  patterns.push(
    { pattern: /OOMKilled|out of memory|memory cgroup/i, severity: "critical", diagnosis: "Container killed due to out of memory", suggestion: "Increase memory limits in container spec or optimize memory usage" },
    { pattern: /CrashLoopBackOff/i, severity: "critical", diagnosis: "Pod repeatedly crashing after startup", suggestion: "Check application logs, fix startup errors, adjust liveness probe" },
    { pattern: /ImagePullBackOff|ErrImagePull/i, severity: "critical", diagnosis: "Container image cannot be pulled", suggestion: "Verify image tag exists, check registry authentication, fix imagePullSecrets" },
    { pattern: /disk full|no space left|disk pressure/i, severity: "critical", diagnosis: "Disk space exhaustion on node", suggestion: "Clean up unused images/volumes, increase disk size, add pod eviction rules" },
    { pattern: /connection refused|ECONNREFUSED/i, severity: "critical", diagnosis: "Service connection refused", suggestion: "Verify target service is running, check network policies, confirm port configuration" },
    { pattern: /5\d{2}|error 50[0-9]/i, severity: "warning", diagnosis: "HTTP 5xx server errors detected", suggestion: "Check application logs, verify upstream services, review error rates in monitoring" },
    { pattern: /timeout|timed? ?out/i, severity: "warning", diagnosis: "Operation timeout", suggestion: "Increase timeout settings, check network latency, optimize slow queries" },
    { pattern: /rate limit|429|too many requests/i, severity: "warning", diagnosis: "Rate limiting triggered", suggestion: "Implement backoff/retry, increase rate limits if appropriate, check caller identity" },
    { pattern: /out of memory|heap|gc overhead|memory leak/i, severity: "warning", diagnosis: "Memory pressure detected", suggestion: "Profile heap usage, check for memory leaks, increase memory limits" },
    { pattern: /etcd|leader election|raft/i, severity: "critical", diagnosis: "etcd cluster issue", suggestion: "Check etcd member health, verify disk performance, ensure quorum" },
    { pattern: /dns.*fail|name.*resolve/i, severity: "warning", diagnosis: "DNS resolution failure", suggestion: "Check CoreDNS/kube-dns pods, verify DNS config, check network policies" },
    { pattern: /cert.*expir|tls.*handshake/i, severity: "warning", diagnosis: "TLS/certificate issue", suggestion: "Renew certificates, check cert-manager logs, verify certificate chain" },
  );

  const matchingPatterns = patterns
    .filter((p) => p.pattern.test(logs))
    .map((p) => ({ severity: p.severity, diagnosis: p.diagnosis, suggestion: p.suggestion }));

  const errorCount = (logs.match(/(error|exception|fail|critical)/gi) ?? []).length;
  const warnCount = (logs.match(/(warn|timeout|slow)/gi) ?? []).length;

  return {
    source,
    logLength: logs.length,
    lineCount: logs.split("\n").length,
    estimatedErrors: errorCount,
    estimatedWarnings: warnCount,
    matchedPatterns: matchingPatterns,
    summary: matchingPatterns.length > 0
      ? `Found ${matchingPatterns.length} known patterns (${matchingPatterns.filter((m) => m.severity === "critical").length} critical, ${matchingPatterns.filter((m) => m.severity === "warning").length} warnings)`
      : "No known patterns matched. Review logs manually for anomalies.",
  };
});

// JSON-RPC over stdin/stdout
process.stdin.on("data", async (buffer) => {
  for (const line of buffer.toString().split("\n").filter(Boolean)) {
    try {
      const req = JSON.parse(line);
      if (req.method === "initialize") {
        console.log(JSON.stringify({
          jsonrpc: "2.0", id: req.id, result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
          },
        }));
      } else if (req.method === "tools/list") {
        console.log(JSON.stringify({
          jsonrpc: "2.0", id: req.id, result: {
            tools: [...tools.values()].map((t) => t.def),
          },
        }));
      } else if (req.method === "tools/call") {
        const tool = tools.get(String((req.params as Record<string, unknown>).name ?? ""));
        if (!tool) {
          console.log(JSON.stringify({
            jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `Tool not found: ${req.params}` },
          }));
          return;
        }
        try {
          const result = await tool.handler((req.params as Record<string, unknown>).arguments as Record<string, unknown> ?? {});
          console.log(JSON.stringify({
            jsonrpc: "2.0", id: req.id, result: {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            },
          }));
        } catch (err) {
          console.log(JSON.stringify({
            jsonrpc: "2.0", id: req.id, error: {
              code: -32603, message: err instanceof Error ? err.message : String(err),
            },
          }));
        }
      }
    } catch {
      // ignore parse errors
    }
  }
});
