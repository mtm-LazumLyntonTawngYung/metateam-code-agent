import type { SharedSession, Participant, SessionOperation, CreateSessionInput, JoinSessionInput, OperationInput, AccessLevel } from "./types";
import {
  createSession,
  getSession,
  listSessions,
  updateSession,
  deleteSession,
  endSession,
  archiveSession,
} from "./session-service";
import {
  joinSession,
  leaveSession,
  getSessionParticipants,
  countParticipants,
  updateParticipantRole,
} from "./participant-service";
import {
  grantPermission,
  revokePermission,
  validateAccess,
  canPerformAction,
  getEffectiveAccessLevel,
} from "./permission-engine";
import {
  createSessionLink,
  validateSessionLink,
  invalidateSessionLink,
  getSessionLinks,
} from "./session-link-service";
import {
  applyOperation,
  getSessionOperations,
  getCurrentVersion,
  createSnapshot,
  getLatestSnapshot,
} from "./collaboration-service";
import {
  detectConflicts,
  resolveConflict,
  getUnresolvedConflicts,
} from "./conflict-resolver";
import {
  captureContext,
  getLatestContextSnapshot,
} from "./context-sharing-service";
import {
  handleWsConnection,
  handleWsDisconnection,
  handleOperation,
  handleCursorPosition,
  handleSelection,
} from "./ws-collaboration";
import { checkRateLimit, trackConnection, trackDisconnection, trackOperation, trackError } from "./performance";
import { validateAccessToken, generateTokenPair } from "./token-service";
import type { RateLimitConfig } from "./performance";

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
};

export type ApiRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
};

const defaultRateLimitConfig: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 100,
};

export function createApiGateway(rateLimitConfig?: Partial<RateLimitConfig>) {
  const config = { ...defaultRateLimitConfig, ...rateLimitConfig };

  return {
    async handleRequest(request: ApiRequest): Promise<ApiResponse> {
      const clientId = request.headers["x-client-id"] || "anonymous";

      if (!checkRateLimit(clientId, config)) {
        trackError();
        return {
          success: false,
          error: "Rate limit exceeded",
          timestamp: new Date().toISOString(),
        };
      }

      const authHeader = request.headers["authorization"];
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        const accessToken = validateAccessToken(token);
        if (!accessToken) {
          trackError();
          return {
            success: false,
            error: "Invalid or expired token",
            timestamp: new Date().toISOString(),
          };
        }
      }

      const startTime = Date.now();

      try {
        const response = await routeRequest(request);
        const latency = Date.now() - startTime;
        trackOperation(latency);
        return response;
      } catch (error) {
        trackError();
        return {
          success: false,
          error: error instanceof Error ? error.message : "Internal server error",
          timestamp: new Date().toISOString(),
        };
      }
    },
  };
}

async function routeRequest(request: ApiRequest): Promise<ApiResponse> {
  const { method, path } = request;

  if (method === "POST" && path === "/api/sessions") {
    return handleCreateSession(request);
  }

  if (method === "GET" && path === "/api/sessions") {
    return handleListSessions(request);
  }

  if (method === "GET" && path.startsWith("/api/sessions/")) {
    const sessionId = path.split("/")[3];
    return handleGetSession(sessionId);
  }

  if (method === "PUT" && path.startsWith("/api/sessions/")) {
    const sessionId = path.split("/")[3];
    return handleUpdateSession(sessionId, request);
  }

  if (method === "DELETE" && path.startsWith("/api/sessions/")) {
    const sessionId = path.split("/")[3];
    return handleDeleteSession(sessionId);
  }

  if (method === "POST" && path.includes("/participants")) {
    const sessionId = path.split("/")[3];
    return handleJoinSession(sessionId, request);
  }

  if (method === "GET" && path.includes("/participants")) {
    const sessionId = path.split("/")[3];
    return handleGetParticipants(sessionId);
  }

  if (method === "POST" && path.includes("/operations")) {
    const sessionId = path.split("/")[3];
    return handleApplyOperation(sessionId, request);
  }

  if (method === "GET" && path.includes("/operations")) {
    const sessionId = path.split("/")[3];
    return handleGetOperations(sessionId, request);
  }

  if (method === "POST" && path.includes("/links")) {
    const sessionId = path.split("/")[3];
    return handleCreateLink(sessionId, request);
  }

  if (method === "POST" && path.includes("/validate-link")) {
    return handleValidateLink(request);
  }

  if (method === "POST" && path.includes("/conflicts")) {
    const sessionId = path.split("/")[3];
    return handleDetectConflicts(sessionId, request);
  }

  if (method === "POST" && path.includes("/resolve-conflict")) {
    return handleResolveConflict(request);
  }

  if (method === "POST" && path.includes("/context")) {
    const sessionId = path.split("/")[3];
    return handleCaptureContext(sessionId, request);
  }

  if (method === "GET" && path.includes("/context")) {
    const sessionId = path.split("/")[3];
    return handleGetContext(sessionId);
  }

  return {
    success: false,
    error: "Not found",
    timestamp: new Date().toISOString(),
  };
}

async function handleCreateSession(request: ApiRequest): Promise<ApiResponse<SharedSession>> {
  const input = request.body as CreateSessionInput;
  const session = createSession(input);
  return { success: true, data: session, timestamp: new Date().toISOString() };
}

async function handleListSessions(request: ApiRequest): Promise<ApiResponse<SharedSession[]>> {
  const userId = request.query?.userId;
  const sessions = listSessions(userId);
  return { success: true, data: sessions, timestamp: new Date().toISOString() };
}

async function handleGetSession(sessionId: string): Promise<ApiResponse<SharedSession>> {
  const session = getSession(sessionId);
  if (!session) {
    return { success: false, error: "Session not found", timestamp: new Date().toISOString() };
  }
  return { success: true, data: session, timestamp: new Date().toISOString() };
}

async function handleUpdateSession(sessionId: string, request: ApiRequest): Promise<ApiResponse<SharedSession>> {
  const updates = request.body as Partial<SharedSession>;
  const session = updateSession(sessionId, updates);
  if (!session) {
    return { success: false, error: "Session not found", timestamp: new Date().toISOString() };
  }
  return { success: true, data: session, timestamp: new Date().toISOString() };
}

async function handleDeleteSession(sessionId: string): Promise<ApiResponse<boolean>> {
  const deleted = deleteSession(sessionId);
  return { success: true, data: deleted, timestamp: new Date().toISOString() };
}

async function handleJoinSession(sessionId: string, request: ApiRequest): Promise<ApiResponse<Participant>> {
  const input = request.body as JoinSessionInput;
  const participant = joinSession({ ...input, sessionId });
  if (!participant) {
    return { success: false, error: "Failed to join session", timestamp: new Date().toISOString() };
  }
  return { success: true, data: participant, timestamp: new Date().toISOString() };
}

async function handleGetParticipants(sessionId: string): Promise<ApiResponse<Participant[]>> {
  const participants = getSessionParticipants(sessionId);
  return { success: true, data: participants, timestamp: new Date().toISOString() };
}

async function handleApplyOperation(sessionId: string, request: ApiRequest): Promise<ApiResponse<SessionOperation>> {
  const input = request.body as Omit<OperationInput, "sessionId">;
  const operation = applyOperation({ ...input, sessionId });
  if (!operation) {
    return { success: false, error: "Failed to apply operation", timestamp: new Date().toISOString() };
  }
  return { success: true, data: operation, timestamp: new Date().toISOString() };
}

async function handleGetOperations(sessionId: string, request: ApiRequest): Promise<ApiResponse<SessionOperation[]>> {
  const fileId = request.query?.fileId;
  const sinceVersion = request.query?.sinceVersion ? parseInt(request.query.sinceVersion) : undefined;
  const operations = getSessionOperations(sessionId, fileId, sinceVersion);
  return { success: true, data: operations, timestamp: new Date().toISOString() };
}

async function handleCreateLink(sessionId: string, request: ApiRequest): Promise<ApiResponse> {
  const input = request.body as { accessLevel: AccessLevel; expiresAt?: string; maxUses?: number; createdBy: string };
  const link = createSessionLink({ ...input, sessionId });
  if (!link) {
    return { success: false, error: "Failed to create link", timestamp: new Date().toISOString() };
  }
  return { success: true, data: link, timestamp: new Date().toISOString() };
}

async function handleValidateLink(request: ApiRequest): Promise<ApiResponse> {
  const { token } = request.body as { token: string };
  const result = validateSessionLink(token);
  if (!result) {
    return { success: false, error: "Invalid or expired link", timestamp: new Date().toISOString() };
  }
  return { success: true, data: result, timestamp: new Date().toISOString() };
}

async function handleDetectConflicts(sessionId: string, request: ApiRequest): Promise<ApiResponse> {
  const { fileId } = request.body as { fileId: string };
  const conflicts = detectConflicts(sessionId, fileId);
  return { success: true, data: conflicts, timestamp: new Date().toISOString() };
}

async function handleResolveConflict(request: ApiRequest): Promise<ApiResponse> {
  const { conflictId, resolution, resolvedBy } = request.body as {
    conflictId: string;
    resolution: "auto-merge" | "manual" | "last-write-wins";
    resolvedBy: string;
  };
  const conflict = resolveConflict(conflictId, resolution, resolvedBy);
  if (!conflict) {
    return { success: false, error: "Failed to resolve conflict", timestamp: new Date().toISOString() };
  }
  return { success: true, data: conflict, timestamp: new Date().toISOString() };
}

async function handleCaptureContext(sessionId: string, request: ApiRequest): Promise<ApiResponse> {
  const input = request.body as {
    fileTree: unknown[];
    environment: Record<string, string>;
    commandHistory: string[];
    breakpoints: unknown[];
    variableWatches: unknown[];
  };
  const snapshot = captureContext(
    sessionId,
    input.fileTree as any,
    input.environment,
    input.commandHistory,
    input.breakpoints as any,
    input.variableWatches as any,
  );
  return { success: true, data: snapshot, timestamp: new Date().toISOString() };
}

async function handleGetContext(sessionId: string): Promise<ApiResponse> {
  const snapshot = getLatestContextSnapshot(sessionId);
  if (!snapshot) {
    return { success: false, error: "No context found", timestamp: new Date().toISOString() };
  }
  return { success: true, data: snapshot, timestamp: new Date().toISOString() };
}
