import type {
  WorkspaceEntry,
  WorkspaceResult,
  ConflictInfo,
  ConflictResolution,
} from "./types";
import {
  readEntry,
  writeEntry,
  getLatestVersion,
  verifyChecksum,
} from "./workspace";

type LockInfo = {
  agentId: string;
  key: string;
  acquiredAt: string;
  expiresAt: string;
};

const locks = new Map<string, LockInfo>();
const LOCK_TIMEOUT_MS = 30000;

export function acquireLock(key: string, agentId: string, timeoutMs?: number): boolean {
  const lockKey = key;
  const existingLock = locks.get(lockKey);

  if (existingLock) {
    if (new Date(existingLock.expiresAt) < new Date()) {
      locks.delete(lockKey);
    } else if (existingLock.agentId !== agentId) {
      return false;
    }
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + (timeoutMs ?? LOCK_TIMEOUT_MS));

  locks.set(lockKey, {
    agentId,
    key,
    acquiredAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  return true;
}

export function releaseLock(key: string, agentId: string): boolean {
  const lock = locks.get(key);
  if (!lock) return false;

  if (lock.agentId !== agentId) return false;

  locks.delete(key);
  return true;
}

export function isLocked(key: string): boolean {
  const lock = locks.get(key);
  if (!lock) return false;

  if (new Date(lock.expiresAt) < new Date()) {
    locks.delete(key);
    return false;
  }

  return true;
}

export function getLockOwner(key: string): string | null {
  const lock = locks.get(key);
  if (!lock) return null;

  if (new Date(lock.expiresAt) < new Date()) {
    locks.delete(key);
    return null;
  }

  return lock.agentId;
}

export function checkVersion(
  key: string,
  expectedVersion: number,
): { valid: boolean; currentVersion: number } {
  const currentVersion = getLatestVersion(key);
  return {
    valid: currentVersion === expectedVersion,
    currentVersion,
  };
}

export function atomicWrite(
  key: string,
  value: unknown,
  agentId: string,
  expectedVersion: number,
): WorkspaceResult {
  const versionCheck = checkVersion(key, expectedVersion);
  if (!versionCheck.valid) {
    return {
      success: false,
      conflict: {
        key,
        currentVersion: versionCheck.currentVersion,
        expectedVersion,
        lastModifiedBy: "",
        lastModifiedAt: "",
      },
    };
  }

  const result = writeEntry(key, value, agentId, expectedVersion);
  return result;
}

export function compareAndSwap(
  key: string,
  expectedValue: unknown,
  newValue: unknown,
  agentId: string,
): WorkspaceResult {
  const readResult = readEntry(key, agentId);
  if (!readResult.success || !readResult.entry) {
    return readResult;
  }

  const currentValue = readResult.entry.value;
  const currentVersion = readResult.entry.version;

  if (JSON.stringify(currentValue) !== JSON.stringify(expectedValue)) {
    return {
      success: false,
      conflict: {
        key,
        currentVersion,
        expectedVersion: currentVersion,
        lastModifiedBy: readResult.entry.lastModifiedBy,
        lastModifiedAt: readResult.entry.lastModifiedAt,
      },
    };
  }

  return writeEntry(key, newValue, agentId, currentVersion);
}

export function detectConflict(
  key: string,
  expectedVersion: number,
): ConflictInfo | null {
  const currentVersion = getLatestVersion(key);
  if (currentVersion === expectedVersion) return null;

  const entry = readEntry(key, "system");
  if (!entry.success || !entry.entry) return null;

  return {
    key,
    currentVersion,
    expectedVersion,
    lastModifiedBy: entry.entry.lastModifiedBy,
    lastModifiedAt: entry.entry.lastModifiedAt,
  };
}

export function resolveConflict(
  conflict: ConflictInfo,
  resolution: ConflictResolution,
  agentId: string,
  localValue?: unknown,
  remoteValue?: unknown,
): WorkspaceResult {
  let resolvedValue: unknown;

  switch (resolution.strategy) {
    case "last-write-wins":
      const latestEntry = readEntry(conflict.key, "system");
      if (!latestEntry.success || !latestEntry.entry) {
        return { success: false, error: "Failed to read current value" };
      }
      resolvedValue = latestEntry.entry.value;
      break;

    case "auto-merge":
      if (localValue !== undefined && remoteValue !== undefined) {
        resolvedValue = mergeValues(localValue, remoteValue);
      } else {
        const currentEntry = readEntry(conflict.key, "system");
        if (!currentEntry.success || !currentEntry.entry) {
          return { success: false, error: "Failed to read current value" };
        }
        resolvedValue = currentEntry.entry.value;
      }
      break;

    case "custom":
      if (resolution.resolver) {
        resolvedValue = resolution.resolver(localValue, remoteValue);
      } else {
        return { success: false, error: "Custom resolver not provided" };
      }
      break;

    case "manual":
      return {
        success: false,
        error: "Manual resolution required",
        conflict,
      };

    default:
      return { success: false, error: `Unknown resolution strategy: ${resolution.strategy}` };
  }

  return writeEntry(conflict.key, resolvedValue, agentId, conflict.currentVersion);
}

function mergeValues(local: unknown, remote: unknown): unknown {
  if (typeof local !== "object" || typeof remote !== "object" || local === null || remote === null) {
    return remote;
  }

  if (Array.isArray(local) && Array.isArray(remote)) {
    const merged = [...local];
    for (const item of remote) {
      if (!merged.some((m) => JSON.stringify(m) === JSON.stringify(item))) {
        merged.push(item);
      }
    }
    return merged;
  }

  const localObj = local as Record<string, unknown>;
  const remoteObj = remote as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...localObj };

  for (const [key, value] of Object.entries(remoteObj)) {
    if (!(key in merged)) {
      merged[key] = value;
    } else if (typeof merged[key] === "object" && typeof value === "object") {
      merged[key] = mergeValues(merged[key], value);
    }
  }

  return merged;
}

export function cleanupExpiredLocks(): number {
  let cleaned = 0;
  const now = new Date();

  for (const [key, lock] of locks) {
    if (new Date(lock.expiresAt) < now) {
      locks.delete(key);
      cleaned++;
    }
  }

  return cleaned;
}

export function getLockStats(): {
  totalLocks: number;
  byAgent: Record<string, number>;
} {
  const byAgent: Record<string, number> = {};

  for (const lock of locks.values()) {
    byAgent[lock.agentId] = (byAgent[lock.agentId] ?? 0) + 1;
  }

  return {
    totalLocks: locks.size,
    byAgent,
  };
}

export function resetConcurrencyControl(): void {
  locks.clear();
}
