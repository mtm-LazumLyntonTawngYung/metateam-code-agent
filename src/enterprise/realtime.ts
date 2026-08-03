/**
 * PROPRIETARY — MetaTeam Technologies
 *
 * This file is part of the Enterprise Edition of Metateam Code Agent.
 * It is NOT licensed under the MIT License.
 * Commercial license required. See LICENSE.ENTERPRISE or contact
 * legal@metateam.io for terms.
 */

/**
 * Real-time pub/sub hub backed by Bun's built-in WebSocket pub/sub.
 *
 * Topics:
 *   - "audit"    — new audit events (live audit log streaming)
 *   - "license"  — license status changes
 *   - "sessions" — session create/update events
 *   - "notify"   — dashboard notifications
 *   - "health"   — periodic system health pings
 *   - "status"   — configuration / org / user changes
 */

import type { AuditEvent } from "./types";

let server: { publish: (topic: string, data: string) => void } | null = null;

const CHANNELS = new Set(["audit", "license", "sessions", "notify", "health", "status"]);

export function attachRealtimeServer(srv: { publish: (topic: string, data: string) => void }): void {
  server = srv;
}

export function isValidChannel(topic: string): boolean {
  return CHANNELS.has(topic);
}

function publish(topic: string, data: unknown): void {
  if (!server) return;
  try {
    server.publish(topic, JSON.stringify(data));
  } catch {
    // client disconnected mid-publish — safe to ignore
  }
}

export function broadcastAudit(event: AuditEvent): void {
  publish("audit", { type: "audit", event });
}

export function broadcastLicense(payload: Record<string, unknown>): void {
  publish("license", { type: "license", ...payload });
}

export function broadcastSessions(payload: Record<string, unknown>): void {
  publish("sessions", { type: "sessions", ...payload });
}

export function broadcastSessionActivity(payload: Record<string, unknown>): void {
  publish("sessions", { type: "sessions", ...payload });
}

export function broadcastNotification(payload: Record<string, unknown>): void {
  publish("notify", { type: "notify", ...payload });
}

export function broadcastHealth(payload: Record<string, unknown>): void {
  publish("health", { type: "health", ...payload });
}

export function broadcastStatus(payload: Record<string, unknown>): void {
  publish("status", { type: "status", ...payload });
}

export function broadcastMessage(raw: string): void {
  if (!server) return;
  try {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof parsed !== "object" || parsed === null || !("topic" in (parsed as Record<string, unknown>))) {
      return;
    }
    const topic = (parsed as Record<string, unknown>).topic as string;
    if (isValidChannel(topic)) {
      publish(topic, parsed);
    }
  } catch {
    // ignore malformed messages
  }
}
