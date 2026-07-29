import {
  handleQuery,
  handlePermissionResponse,
  handleToolCall,
  createServerSession,
  destroyServerSession,
  type ServerConfig,
} from "./handler";

type WsData = { clientId: string };

export function startServer(config: ServerConfig): void {
  const host = config.host ?? "127.0.0.1";

  console.error(`mtc serve listening on ws://${host}:${config.port}`);

  Bun.serve<WsData>({
    hostname: host,
    port: config.port,
    fetch(req, server) {
      if (server.upgrade(req, { data: { clientId: crypto.randomUUID() } })) {
        return;
      }
      if (req.method === "GET") {
        return new Response("mtc WebSocket server — connect via WebSocket", {
          headers: { "Content-Type": "text/plain" },
        });
      }
      return new Response("Only WebSocket connections accepted", { status: 426 });
    },
    websocket: {
      open(ws) {
        const clientId = ws.data.clientId;
        const sessionId = createServerSession(clientId);
        ws.send(JSON.stringify({ type: "hello", clientId, sessionId, version: "0.1.0" }));
      },
      message(ws, raw) {
        const clientId = ws.data.clientId;
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw as string);
        } catch {
          ws.send(JSON.stringify({ type: "error", id: "parse", message: "Invalid JSON" }));
          return;
        }

        const msgType = msg.type as string;
        const msgId = (msg.id as string) ?? crypto.randomUUID();
        const send = (data: string) => { try { ws.send(data); } catch {} };

        switch (msgType) {
          case "query": {
            const text = msg.text as string;
            if (!text) {
              send(JSON.stringify({ type: "error", id: msgId, message: "query.text is required" }));
              return;
            }
            handleQuery(clientId, msgId, text, send);
            break;
          }
          case "tool_call": {
            const toolName = msg.tool as string;
            const args = (msg.args ?? {}) as Record<string, unknown>;
            if (!toolName) {
              send(JSON.stringify({ type: "error", id: msgId, message: "tool_call.tool is required" }));
              return;
            }
            handleToolCall(clientId, msgId, toolName, args, send);
            break;
          }
          case "permission": {
            const requestId = msg.requestId as string;
            const response = msg.response as string;
            handlePermissionResponse(clientId, requestId, response, send);
            break;
          }
          default:
            send(JSON.stringify({ type: "error", id: msgId, message: `Unknown message type: ${msgType}` }));
        }
      },
      close(ws) {
        destroyServerSession(ws.data.clientId);
      },
    },
  });
}
