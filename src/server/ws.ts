import {
  handleQuery,
  handlePermissionResponse,
  handleToolCall,
  createServerSession,
  destroyServerSession,
  type ServerConfig,
} from "./handler";

type WsData = { clientId: string; authenticated: boolean };

const AUTH_TIMEOUT_MS = 10000;
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_MSG = 30;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(clientId);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(clientId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  bucket.count++;
  return bucket.count <= RATE_LIMIT_MAX_MSG;
}

export function startServer(config: ServerConfig): void {
  const host = config.host ?? "127.0.0.1";
  const authToken = config.authToken ?? process.env.MTC_WS_TOKEN;

  if (authToken) {
    console.error("mtc serve: WebSocket authentication enabled (MTC_WS_TOKEN)");
  } else {
    console.error("mtc serve: WARNING — no MTC_WS_TOKEN set, server is unauthenticated!");
  }

  console.error(`mtc serve listening on ws://${host}:${config.port}`);

  Bun.serve<WsData>({
    hostname: host,
    port: config.port,
    fetch(req, server) {
      if (server.upgrade(req, { data: { clientId: crypto.randomUUID(), authenticated: false } })) {
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

        if (authToken) {
          let authTimer: Timer | null = setTimeout(() => {
            ws.send(JSON.stringify({ type: "error", id: "auth_timeout", message: "Authentication timeout" }));
            ws.close(4001, "Authentication timeout");
          }, AUTH_TIMEOUT_MS);

          ws.send(JSON.stringify({ type: "auth_required", message: "Send { type: 'auth', token: '...' }" }));

          const cleanup = () => { if (authTimer) { clearTimeout(authTimer); authTimer = null; } };

          const authHandler = (ws: import("bun").ServerWebSocket<WsData>, raw: string) => {
            let msg: Record<string, unknown>;
            try {
              msg = JSON.parse(raw);
            } catch {
              ws.send(JSON.stringify({ type: "error", id: "parse", message: "Invalid JSON" }));
              return;
            }

            if (msg.type !== "auth") {
              ws.send(JSON.stringify({ type: "error", id: "auth", message: "Authenticate first" }));
              return;
            }

            if (msg.token !== authToken) {
              ws.send(JSON.stringify({ type: "error", id: "auth", message: "Invalid token" }));
              ws.close(4001, "Invalid token");
              return;
            }

            cleanup();
            (ws.data as WsData).authenticated = true;
            ws.send(JSON.stringify({ type: "hello", clientId, sessionId: createServerSession(clientId), version: "0.1.0" }));
          };

          (ws as any)._authHandler = authHandler;
        } else {
          const sessionId = createServerSession(clientId);
          ws.send(JSON.stringify({ type: "hello", clientId, sessionId, version: "0.1.0" }));
        }
      },
      message(ws, raw) {
        const clientId = ws.data.clientId;

        if (!checkRateLimit(clientId)) {
          ws.send(JSON.stringify({ type: "error", id: "rate_limit", message: "Rate limit exceeded" }));
          return;
        }

        if (authToken && !ws.data.authenticated) {
          if ((ws as any)._authHandler) {
            (ws as any)._authHandler(ws, raw);
          }
          return;
        }

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
        rateBuckets.delete(ws.data.clientId);
      },
    },
  });
}
