import type { ToolResult } from "../tools/schema";

export class AgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentError";
  }
}

export class LlmError extends AgentError {
  provider: string;
  retryable: boolean;
  status?: number;

  constructor(message: string, opts: { provider?: string; retryable?: boolean; status?: number } = {}) {
    super(message);
    this.name = "LlmError";
    this.provider = opts.provider ?? "unknown";
    this.retryable = opts.retryable ?? false;
    this.status = opts.status;
  }

  static fromStatus(provider: string, status: number, body: string): LlmError {
    const msg = `${provider} ${status}: ${body}`;
    if (status === 429) return new LlmError(msg, { provider, retryable: true, status });
    if (status >= 500) return new LlmError(msg, { provider, retryable: true, status });
    if (status === 401) return new LlmError(msg, { provider, retryable: false, status });
    return new LlmError(msg, { provider, retryable: false, status });
  }
}

export class ToolError extends AgentError {
  toolName: string;

  constructor(message: string, toolName: string) {
    super(message);
    this.name = "ToolError";
    this.toolName = toolName;
  }

  static invalidArgs(toolName: string, detail: string): ToolError {
    return new ToolError(`Invalid arguments for ${toolName}: ${detail}`, toolName);
  }

  static unknown(toolName: string): ToolError {
    return new ToolError(`Unknown tool: ${toolName}`, toolName);
  }

  static execution(toolName: string, reason: string): ToolError {
    return new ToolError(`Tool '${toolName}' failed: ${reason}`, toolName);
  }

  toResult(): ToolResult {
    return { success: false as const, error: this.message };
  }
}

export class SessionError extends AgentError {
  constructor(message: string) {
    super(message);
    this.name = "SessionError";
  }
}

export class IncompleteResponseError extends AgentError {
  constructor(readonly vercelID?: string) {
    super("The provider ended the response before returning usable output.");
    this.name = "IncompleteResponseError";
  }
}
