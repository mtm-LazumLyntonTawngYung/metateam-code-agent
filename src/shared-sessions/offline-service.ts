import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { SessionOperation } from "./types";

export type OfflineChange = {
  id: string;
  sessionId: string;
  participantId: string;
  operation: SessionOperation;
  timestamp: string;
  synced: boolean;
  syncAttempts: number;
  lastSyncAttempt?: string;
  error?: string;
};

export type OfflineQueue = {
  sessionId: string;
  participantId: string;
  changes: OfflineChange[];
  lastSynced: string;
  isOnline: boolean;
};

const offlineStorageDir = join(homedir(), ".config", "mtc", "offline");
const MAX_SYNC_ATTEMPTS = 5;
const SYNC_RETRY_DELAY_MS = 5000;

const offlineQueues = new Map<string, OfflineQueue>();

export function initOfflineStorage(): void {
  if (!existsSync(offlineStorageDir)) {
    mkdirSync(offlineStorageDir, { recursive: true });
  }
}

export function queueOfflineChange(
  sessionId: string,
  participantId: string,
  operation: SessionOperation,
): OfflineChange {
  initOfflineStorage();

  const change: OfflineChange = {
    id: randomBytes(16).toString("hex"),
    sessionId,
    participantId,
    operation,
    timestamp: new Date().toISOString(),
    synced: false,
    syncAttempts: 0,
  };

  const queueKey = `${sessionId}:${participantId}`;
  let queue = offlineQueues.get(queueKey);

  if (!queue) {
    queue = {
      sessionId,
      participantId,
      changes: [],
      lastSynced: new Date().toISOString(),
      isOnline: false,
    };
    offlineQueues.set(queueKey, queue);
  }

  queue.changes.push(change);
  persistOfflineQueue(queueKey, queue);

  return change;
}

export function getOfflineChanges(sessionId: string, participantId: string): OfflineChange[] {
  const queueKey = `${sessionId}:${participantId}`;
  const queue = offlineQueues.get(queueKey);

  if (!queue) {
    return loadOfflineQueue(queueKey)?.changes ?? [];
  }

  return queue.changes.filter((c) => !c.synced);
}

export function markChangeSynced(changeId: string): boolean {
  for (const queue of offlineQueues.values()) {
    const change = queue.changes.find((c) => c.id === changeId);
    if (change) {
      change.synced = true;
      change.lastSyncAttempt = new Date().toISOString();
      persistOfflineQueue(`${queue.sessionId}:${queue.participantId}`, queue);
      return true;
    }
  }
  return false;
}

export function markChangeFailed(changeId: string, error: string): boolean {
  for (const queue of offlineQueues.values()) {
    const change = queue.changes.find((c) => c.id === changeId);
    if (change) {
      change.syncAttempts++;
      change.lastSyncAttempt = new Date().toISOString();
      change.error = error;
      persistOfflineQueue(`${queue.sessionId}:${queue.participantId}`, queue);
      return true;
    }
  }
  return false;
}

export function getPendingChanges(sessionId: string, participantId: string): OfflineChange[] {
  return getOfflineChanges(sessionId, participantId).filter(
    (c) => !c.synced && c.syncAttempts < MAX_SYNC_ATTEMPTS,
  );
}

export function clearSyncedChanges(sessionId: string, participantId: string): number {
  const queueKey = `${sessionId}:${participantId}`;
  const queue = offlineQueues.get(queueKey);

  if (!queue) return 0;

  const before = queue.changes.length;
  queue.changes = queue.changes.filter((c) => !c.synced);
  persistOfflineQueue(queueKey, queue);

  return before - queue.changes.length;
}

export function setOnlineStatus(sessionId: string, participantId: string, isOnline: boolean): void {
  const queueKey = `${sessionId}:${participantId}`;
  let queue = offlineQueues.get(queueKey);

  if (!queue) {
    queue = {
      sessionId,
      participantId,
      changes: [],
      lastSynced: new Date().toISOString(),
      isOnline,
    };
    offlineQueues.set(queueKey, queue);
  } else {
    queue.isOnline = isOnline;
  }

  persistOfflineQueue(queueKey, queue);
}

export function getOfflineStats(sessionId: string, participantId: string): {
  totalChanges: number;
  syncedChanges: number;
  pendingChanges: number;
  failedChanges: number;
} {
  const queueKey = `${sessionId}:${participantId}`;
  const queue = offlineQueues.get(queueKey) ?? loadOfflineQueue(queueKey);

  if (!queue) {
    return { totalChanges: 0, syncedChanges: 0, pendingChanges: 0, failedChanges: 0 };
  }

  const total = queue.changes.length;
  const synced = queue.changes.filter((c) => c.synced).length;
  const pending = queue.changes.filter((c) => !c.synced && c.syncAttempts < MAX_SYNC_ATTEMPTS).length;
  const failed = queue.changes.filter((c) => !c.synced && c.syncAttempts >= MAX_SYNC_ATTEMPTS).length;

  return { totalChanges: total, syncedChanges: synced, pendingChanges: pending, failedChanges: failed };
}

export function mergeOfflineChanges(
  localChanges: OfflineChange[],
  remoteChanges: SessionOperation[],
): SessionOperation[] {
  const merged = [...remoteChanges];

  for (const localChange of localChanges) {
    if (localChange.synced) continue;

    const hasConflict = merged.some(
      (remote) =>
        remote.fileId === localChange.operation.fileId &&
        Math.abs(remote.position - localChange.operation.position) < 5,
    );

    if (!hasConflict) {
      merged.push(localChange.operation);
    }
  }

  return merged.sort((a, b) => a.version - b.version);
}

export function cleanupOldOfflineData(maxAgeMs: number): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, queue] of offlineQueues) {
    const lastActivity = queue.changes.length > 0
      ? new Date(queue.changes[queue.changes.length - 1].timestamp).getTime()
      : new Date(queue.lastSynced).getTime();

    if (now - lastActivity > maxAgeMs) {
      offlineQueues.delete(key);
      deleteOfflineQueueFile(key);
      cleaned++;
    }
  }

  return cleaned;
}

function persistOfflineQueue(key: string, queue: OfflineQueue): void {
  initOfflineStorage();
  const filePath = join(offlineStorageDir, `${key.replace(":", "-")}.json`);
  writeFileSync(filePath, JSON.stringify(queue, null, 2));
}

function loadOfflineQueue(key: string): OfflineQueue | null {
  initOfflineStorage();
  const filePath = join(offlineStorageDir, `${key.replace(":", "-")}.json`);

  if (!existsSync(filePath)) return null;

  try {
    const data = readFileSync(filePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function deleteOfflineQueueFile(key: string): void {
  const filePath = join(offlineStorageDir, `${key.replace(":", "-")}.json`);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

export function listOfflineQueues(): OfflineQueue[] {
  initOfflineStorage();
  const files = readdirSync(offlineStorageDir).filter((f) => f.endsWith(".json"));
  const queues: OfflineQueue[] = [];

  for (const file of files) {
    try {
      const data = readFileSync(join(offlineStorageDir, file), "utf-8");
      queues.push(JSON.parse(data));
    } catch {
      // Skip invalid files
    }
  }

  return queues;
}
