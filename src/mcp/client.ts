import { spawn, type ChildProcess } from "child_process";
import type { McpServerConfig } from "./config";
import type { ToolDefinition, ToolResult } from "../tools/schema";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

export class McpClient {
  private proc: ChildProcess;
  private name: string;
  private buffer = "";
  private pending = new Map<number, PendingRequest>();
  private idSeq = 0;
  private _connected = false;
  private _errored = false;

  get connected() {
    return this._connected;
  }

  get serverName() {
    return this.name;
  }

  constructor(name: string, config: McpServerConfig) {
    this.name = name;
    this.proc = spawn(config.command, config.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...config.env },
    });

    this.proc.stdout!.on("data", (chunk: Buffer) => this.onData(chunk));
    this.proc.stderr!.on("data", (chunk: Buffer) => {
      // MCP servers often log diagnostics to stderr — ignore by default
    });

    this.proc.on("exit", (code) => {
      this._connected = false;
      this._errored = code !== 0;
      const err = new Error(`MCP server '${name}' exited with code ${code}`);
      for (const [, entry] of this.pending) {
        entry.reject(err);
      }
      this.pending.clear();
    });

    this.proc.on("error", (err) => {
      this._connected = false;
      this._errored = true;
      for (const [, entry] of this.pending) {
        entry.reject(err);
      }
      this.pending.clear();
    });
  }

  private onData(chunk: Buffer) {
    this.buffer += chunk.toString();
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        this.handleMessage(JSON.parse(trimmed));
      } catch {
        // malformed JSON — ignore
      }
    }
  }

  private handleMessage(msg: { id?: number; result?: unknown; error?: { message: string } }) {
    if (msg.id != null && this.pending.has(msg.id)) {
      const entry = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) {
        entry.reject(new Error(msg.error.message));
      } else {
        entry.resolve(msg.result);
      }
    }
  }

  private send(msg: unknown): void {
    this.proc.stdin!.write(JSON.stringify(msg) + "\n");
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.idSeq;
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "0.1.0",
      capabilities: {},
      clientInfo: { name: "mtc", version: "0.1.0" },
    });
    this.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    this._connected = true;
  }

  async listTools(): Promise<ToolDefinition[]> {
    const result = await this.request("tools/list") as { tools?: { name?: string; description?: string; inputSchema?: Record<string, unknown> }[] };
    return (result.tools ?? []).map((t) => ({
      name: t.name ?? "unknown",
      description: t.description ?? "",
      parameters: (t.inputSchema ?? { type: "object", properties: {} }) as ToolDefinition["parameters"],
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        return this.callTool(t.name ?? "unknown", args);
      },
    }));
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const result = await this.request("tools/call", {
        name: toolName,
        arguments: args,
      }) as { content?: { type?: string; text?: string }[]; isError?: boolean };
      const text = (result.content ?? []).map((c) => c.text ?? "").join("\n");
      return { success: !result.isError, data: text };
    } catch (err) {
      return {
        success: false,
        error: `MCP tool '${toolName}' failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  close() {
    this.proc.kill();
    this._connected = false;
  }
}
