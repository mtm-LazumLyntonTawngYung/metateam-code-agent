import * as vscode from "vscode";
import { EventEmitter } from "events";

export type WsMessage = {
  type: string;
  id?: string;
  [key: string]: unknown;
};

export type ConnectionState = "disconnected" | "connecting" | "connected";

export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private host: string;
  private port: number;
  private _state: ConnectionState = "disconnected";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _clientId: string = "";
  private _sessionId: string = "";

  constructor(host: string, port: number) {
    super();
    this.host = host;
    this.port = port;
  }

  get state(): ConnectionState {
    return this._state;
  }

  get clientId(): string {
    return this._clientId;
  }

  get sessionId(): string {
    return this._sessionId;
  }

  connect(): void {
    if (this.ws) return;
    this._state = "connecting";
    this.emit("stateChange", this._state);

    const url = `ws://${this.host}:${this.port}`;
    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this._state = "connected";
        this.emit("stateChange", this._state);
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as WsMessage;
          if (msg.type === "hello") {
            this._clientId = (msg.clientId as string) || "";
            this._sessionId = (msg.sessionId as string) || "";
          }
          this.emit("message", msg);
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
        this._state = "disconnected";
        this.emit("stateChange", this._state);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this._state = "disconnected";
      this.emit("stateChange", this._state);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this._state = "disconnected";
    this.emit("stateChange", this._state);
  }

  send(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  sendQuery(text: string): string {
    const id = crypto.randomUUID();
    this.send({ type: "query", id, text });
    return id;
  }

  sendToolCall(tool: string, args: Record<string, unknown>): string {
    const id = crypto.randomUUID();
    this.send({ type: "tool_call", id, tool, args });
    return id;
  }

  respondPermission(requestId: string, response: string): void {
    this.send({ type: "permission", requestId, response });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }
}
