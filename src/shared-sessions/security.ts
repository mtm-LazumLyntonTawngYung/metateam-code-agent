import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac } from "crypto";
import type { SharedSession } from "./types";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

export function generateEncryptionKey(): Buffer {
  return randomBytes(KEY_LENGTH);
}

export function deriveKey(password: string, salt: Buffer): Buffer {
  return createHash("sha256")
    .update(password)
    .update(salt)
    .digest();
}

export function encrypt(data: string, key: Buffer): { encrypted: string; iv: string; tag: string } {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
  };
}

export function decrypt(encryptedData: string, key: Buffer, iv: string, tag: string): string {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

export function encryptSessionData(data: Record<string, unknown>, key: Buffer): string {
  const jsonData = JSON.stringify(data);
  const { encrypted, iv, tag } = encrypt(jsonData, key);
  return JSON.stringify({ encrypted, iv, tag });
}

export function decryptSessionData(encryptedData: string, key: Buffer): Record<string, unknown> {
  const { encrypted, iv, tag } = JSON.parse(encryptedData);
  const decrypted = decrypt(encrypted, key, iv, tag);
  return JSON.parse(decrypted);
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateHMAC(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function verifyHMAC(data: string, secret: string, signature: string): boolean {
  const expected = generateHMAC(data, secret);
  return expected === signature;
}

export function generateSessionId(): string {
  return randomBytes(16).toString("hex");
}

export function generateParticipantColor(): string {
  const colors = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
    "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .trim();
}

export function validateSessionId(sessionId: string): boolean {
  return /^[a-f0-9]{32}$/i.test(sessionId);
}

export function validateUserId(userId: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(userId);
}

export function validateToken(token: string): boolean {
  return /^[a-zA-Z0-9_-]{32,64}$/.test(token);
}

export function isSecureConnection(protocol: string): boolean {
  return protocol === "wss:" || protocol === "https:";
}

export function generateRateLimitKey(clientId: string, windowMs: number): string {
  const window = Math.floor(Date.now() / windowMs);
  return `${clientId}:${window}`;
}

export function checkRateLimit(
  key: string,
  limits: Map<string, { count: number; resetAt: number }>,
  maxRequests: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const bucket = limits.get(key);

  if (!bucket || now > bucket.resetAt) {
    limits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  bucket.count++;
  return bucket.count <= maxRequests;
}

export function cleanupExpiredEntries<T extends { expiresAt?: string }>(
  items: Map<string, T>,
): string[] {
  const now = new Date().toISOString();
  const expired: string[] = [];

  for (const [key, item] of items) {
    if (item.expiresAt && item.expiresAt < now) {
      expired.push(key);
    }
  }

  for (const key of expired) {
    items.delete(key);
  }

  return expired;
}

export function generateCSRFToken(): string {
  return randomBytes(32).toString("hex");
}

export function validateCSRFToken(token: string, expected: string): boolean {
  return token === expected;
}

export function maskSensitiveData(data: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const masked = { ...data };
  for (const field of fields) {
    if (field in masked) {
      const value = String(masked[field]);
      masked[field] = value.slice(0, 2) + "*".repeat(Math.max(0, value.length - 4)) + value.slice(-2);
    }
  }
  return masked;
}

export function generateAuditId(): string {
  return randomBytes(8).toString("hex");
}

export function timestampToDate(timestamp: number): Date {
  return new Date(timestamp);
}

export function dateToTimestamp(date: Date): number {
  return date.getTime();
}

export function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

export function addTimeToNow(milliseconds: number): Date {
  return new Date(Date.now() + milliseconds);
}

export function generateExpiresAt(ttlMs: number): string {
  return addTimeToNow(ttlMs).toISOString();
}
