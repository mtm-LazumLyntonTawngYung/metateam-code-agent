import type { SharedSession, Participant, SessionOperation, SessionEvent } from "./types";
import { getSession } from "./session-service";
import { getParticipant, joinSession, leaveSession, updateCursorPosition, updateSelection } from "./participant-service";
import { applyOperation, getCurrentVersion } from "./collaboration-service";
import { validateAccess, canPerformAction } from "./permission-engine";
import { subscribe, broadcastSessionEvent } from "./event-bus";
import type { OperationInput } from "./types";

type WsClient = {
  id: string;
  sessionId: string;
  participantId: string;
  userId: string;
  send: (data: string) => void;
};

const clients = new Map<string, WsClient>();
const sessionClients = new Map<string, Set<string>>();

export function handleWsConnection(
  clientId: string,
  sessionId: string,
  userId: string,
  displayName: string,
  send: (data: string) => void,
): { success: boolean; error?: string } {
  const session = getSession(sessionId);
  if (!session) {
    return { success: false, error: "Session not found" };
  }

  if (session.status !== "active") {
    return { success: false, error: "Session is not active" };
  }

  const participant = joinSession({
    sessionId,
    userId,
    displayName,
    role: "editor",
    accessLevel: "edit",
  });

  if (!participant) {
    return { success: false, error: "Failed to join session" };
  }

  const client: WsClient = {
    id: clientId,
    sessionId,
    participantId: participant.id,
    userId,
    send,
  };

  clients.set(clientId, client);

  if (!sessionClients.has(sessionId)) {
    sessionClients.set(sessionId, new Set());
  }
  sessionClients.get(sessionId)!.add(clientId);

  subscribe(sessionId, (event: SessionEvent) => {
    broadcastToSession(sessionId, {
      type: "session_event",
      event,
    });
  });

  broadcastToSession(sessionId, {
    type: "participant_joined",
    participant,
  });

  send(JSON.stringify({
    type: "connected",
    sessionId,
    participantId: participant.id,
    version: getCurrentVersion(sessionId),
  }));

  return { success: true };
}

export function handleWsDisconnection(clientId: string): void {
  const client = clients.get(clientId);
  if (!client) return;

  leaveSession(client.sessionId, client.userId);

  const sessionClientIds = sessionClients.get(client.sessionId);
  if (sessionClientIds) {
    sessionClientIds.delete(clientId);
    if (sessionClientIds.size === 0) {
      sessionClients.delete(client.sessionId);
    }
  }

  clients.delete(clientId);

  broadcastToSession(client.sessionId, {
    type: "participant_left",
    participantId: client.participantId,
  });
}

export function handleOperation(
  clientId: string,
  input: Omit<OperationInput, "participantId">,
): { success: boolean; error?: string; operation?: SessionOperation } {
  const client = clients.get(clientId);
  if (!client) {
    return { success: false, error: "Client not connected" };
  }

  if (!canPerformAction(client.sessionId, client.userId, "edit")) {
    return { success: false, error: "Insufficient permissions" };
  }

  const operation = applyOperation({
    ...input,
    sessionId: client.sessionId,
    participantId: client.participantId,
  });

  if (!operation) {
    return { success: false, error: "Failed to apply operation" };
  }

  broadcastToSession(client.sessionId, {
    type: "operation",
    operation,
    participantId: client.participantId,
  });

  return { success: true, operation };
}

export function handleCursorPosition(
  clientId: string,
  cursor: { fileId: string; line: number; column: number },
): void {
  const client = clients.get(clientId);
  if (!client) return;

  updateCursorPosition(client.participantId, cursor);

  broadcastToSession(client.sessionId, {
    type: "cursor_update",
    participantId: client.participantId,
    cursor,
  });
}

export function handleSelection(
  clientId: string,
  selection: { fileId: string; startLine: number; startColumn: number; endLine: number; endColumn: number } | null,
): void {
  const client = clients.get(clientId);
  if (!client) return;

  updateSelection(client.participantId, selection);

  broadcastToSession(client.sessionId, {
    type: "selection_update",
    participantId: client.participantId,
    selection,
  });
}

export function broadcastToSession(sessionId: string, message: unknown): void {
  const clientIds = sessionClients.get(sessionId);
  if (!clientIds) return;

  const data = JSON.stringify(message);
  for (const clientId of clientIds) {
    const client = clients.get(clientId);
    if (client) {
      try {
        client.send(data);
      } catch {
        // Client disconnected
      }
    }
  }
}

export function getSessionClientCount(sessionId: string): number {
  return sessionClients.get(sessionId)?.size ?? 0;
}

export function isUserInSession(sessionId: string, userId: string): boolean {
  const clientIds = sessionClients.get(sessionId);
  if (!clientIds) return false;

  for (const clientId of clientIds) {
    const client = clients.get(clientId);
    if (client && client.userId === userId) {
      return true;
    }
  }

  return false;
}

export function disconnectAllClients(): void {
  for (const [clientId, client] of clients) {
    handleWsDisconnection(clientId);
  }
  clients.clear();
  sessionClients.clear();
}
