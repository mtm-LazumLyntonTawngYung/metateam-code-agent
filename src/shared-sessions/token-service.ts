import { randomBytes, createHmac, createHash } from "crypto";
import { generateToken, hashToken, generateExpiresAt } from "./security";

export type AccessToken = {
  id: string;
  token: string;
  tokenHash: string;
  userId: string;
  sessionId?: string;
  scopes: string[];
  expiresAt: string;
  createdAt: string;
  lastUsedAt?: string;
  isRevoked: boolean;
  metadata: Record<string, unknown>;
};

export type RefreshToken = {
  id: string;
  token: string;
  tokenHash: string;
  userId: string;
  accessTokenId: string;
  expiresAt: string;
  createdAt: string;
  isRevoked: boolean;
};

export type TokenPair = {
  accessToken: AccessToken;
  refreshToken: RefreshToken;
};

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SECRET = process.env.MTC_TOKEN_SECRET || randomBytes(32).toString("hex");

const accessTokens = new Map<string, AccessToken>();
const refreshTokens = new Map<string, RefreshToken>();
const revokedTokens = new Set<string>();

export function generateAccessToken(
  userId: string,
  scopes: string[],
  sessionId?: string,
  metadata?: Record<string, unknown>,
): AccessToken {
  const id = randomBytes(16).toString("hex");
  const token = generateToken();
  const tokenHash = hashToken(token);
  const now = new Date();

  const accessToken: AccessToken = {
    id,
    token,
    tokenHash,
    userId,
    sessionId,
    scopes,
    expiresAt: generateExpiresAt(ACCESS_TOKEN_TTL_MS),
    createdAt: now.toISOString(),
    isRevoked: false,
    metadata: metadata ?? {},
  };

  accessTokens.set(id, accessToken);
  return accessToken;
}

export function generateRefreshToken(accessTokenId: string): RefreshToken {
  const id = randomBytes(16).toString("hex");
  const token = generateToken();
  const tokenHash = hashToken(token);
  const now = new Date();

  const refreshToken: RefreshToken = {
    id,
    token,
    tokenHash,
    userId: "",
    accessTokenId,
    expiresAt: generateExpiresAt(REFRESH_TOKEN_TTL_MS),
    createdAt: now.toISOString(),
    isRevoked: false,
  };

  refreshTokens.set(id, refreshToken);
  return refreshToken;
}

export function generateTokenPair(
  userId: string,
  scopes: string[],
  sessionId?: string,
): TokenPair {
  const accessToken = generateAccessToken(userId, scopes, sessionId);
  const refreshToken = generateRefreshToken(accessToken.id);
  refreshToken.userId = userId;

  return { accessToken, refreshToken };
}

export function validateAccessToken(token: string): AccessToken | null {
  const tokenHash = hashToken(token);

  for (const accessToken of accessTokens.values()) {
    if (accessToken.tokenHash === tokenHash && !accessToken.isRevoked) {
      if (new Date(accessToken.expiresAt) < new Date()) {
        accessToken.isRevoked = true;
        return null;
      }

      accessToken.lastUsedAt = new Date().toISOString();
      return accessToken;
    }
  }

  return null;
}

export function validateRefreshToken(token: string): RefreshToken | null {
  const tokenHash = hashToken(token);

  for (const refreshToken of refreshTokens.values()) {
    if (refreshToken.tokenHash === tokenHash && !refreshToken.isRevoked) {
      if (new Date(refreshToken.expiresAt) < new Date()) {
        refreshToken.isRevoked = true;
        return null;
      }

      return refreshToken;
    }
  }

  return null;
}

export function refreshAccessToken(refreshToken: string): TokenPair | null {
  const existingRefresh = validateRefreshToken(refreshToken);
  if (!existingRefresh) return null;

  const existingAccess = accessTokens.get(existingRefresh.accessTokenId);
  if (!existingAccess) return null;

  existingAccess.isRevoked = true;
  existingRefresh.isRevoked = true;

  return generateTokenPair(
    existingRefresh.userId,
    existingAccess.scopes,
    existingAccess.sessionId,
  );
}

export function revokeAccessToken(accessTokenId: string): boolean {
  const accessToken = accessTokens.get(accessTokenId);
  if (!accessToken) return false;

  accessToken.isRevoked = true;
  revokedTokens.add(accessToken.tokenHash);

  for (const refreshToken of refreshTokens.values()) {
    if (refreshToken.accessTokenId === accessTokenId) {
      refreshToken.isRevoked = true;
      revokedTokens.add(refreshToken.tokenHash);
    }
  }

  return true;
}

export function revokeRefreshToken(refreshTokenId: string): boolean {
  const refreshToken = refreshTokens.get(refreshTokenId);
  if (!refreshToken) return false;

  refreshToken.isRevoked = true;
  revokedTokens.add(refreshToken.tokenHash);

  const accessToken = accessTokens.get(refreshToken.accessTokenId);
  if (accessToken) {
    accessToken.isRevoked = true;
    revokedTokens.add(accessToken.tokenHash);
  }

  return true;
}

export function revokeAllUserTokens(userId: string): number {
  let revoked = 0;

  for (const accessToken of accessTokens.values()) {
    if (accessToken.userId === userId && !accessToken.isRevoked) {
      accessToken.isRevoked = true;
      revokedTokens.add(accessToken.tokenHash);
      revoked++;
    }
  }

  for (const refreshToken of refreshTokens.values()) {
    if (refreshToken.userId === userId && !refreshToken.isRevoked) {
      refreshToken.isRevoked = true;
      revokedTokens.add(refreshToken.tokenHash);
      revoked++;
    }
  }

  return revoked;
}

export function getUserTokens(userId: string): AccessToken[] {
  return Array.from(accessTokens.values()).filter((t) => t.userId === userId);
}

export function getSessionTokens(sessionId: string): AccessToken[] {
  return Array.from(accessTokens.values()).filter(
    (t) => t.sessionId === sessionId && !t.isRevoked,
  );
}

export function cleanupExpiredTokens(): { accessTokens: number; refreshTokens: number } {
  const now = new Date();
  let accessCleaned = 0;
  let refreshCleaned = 0;

  for (const [id, accessToken] of accessTokens) {
    if (new Date(accessToken.expiresAt) < now || accessToken.isRevoked) {
      accessTokens.delete(id);
      accessCleaned++;
    }
  }

  for (const [id, refreshToken] of refreshTokens) {
    if (new Date(refreshToken.expiresAt) < now || refreshToken.isRevoked) {
      refreshTokens.delete(id);
      refreshCleaned++;
    }
  }

  return { accessTokens: accessCleaned, refreshTokens: refreshCleaned };
}

export function generateSessionToken(sessionId: string, userId: string): string {
  const payload = {
    sessionId,
    userId,
    timestamp: Date.now(),
  };

  const payloadStr = JSON.stringify(payload);
  const signature = createHmac("sha256", SECRET).update(payloadStr).digest("hex");

  return Buffer.from(payloadStr).toString("base64url") + "." + signature;
}

export function validateSessionToken(token: string): { sessionId: string; userId: string } | null {
  try {
    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) return null;

    const payloadStr = Buffer.from(payloadB64, "base64url").toString();
    const expectedSignature = createHmac("sha256", SECRET).update(payloadStr).digest("hex");

    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(payloadStr);
    const age = Date.now() - payload.timestamp;

    if (age > ACCESS_TOKEN_TTL_MS) return null;

    return { sessionId: payload.sessionId, userId: payload.userId };
  } catch {
    return null;
  }
}

export function getTokenStats(): {
  totalAccessTokens: number;
  totalRefreshTokens: number;
  activeAccessTokens: number;
  activeRefreshTokens: number;
  revokedTokens: number;
} {
  const now = new Date();
  let activeAccess = 0;
  let activeRefresh = 0;

  for (const token of accessTokens.values()) {
    if (!token.isRevoked && new Date(token.expiresAt) > now) {
      activeAccess++;
    }
  }

  for (const token of refreshTokens.values()) {
    if (!token.isRevoked && new Date(token.expiresAt) > now) {
      activeRefresh++;
    }
  }

  return {
    totalAccessTokens: accessTokens.size,
    totalRefreshTokens: refreshTokens.size,
    activeAccessTokens: activeAccess,
    activeRefreshTokens: activeRefresh,
    revokedTokens: revokedTokens.size,
  };
}
