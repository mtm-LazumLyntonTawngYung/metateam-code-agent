/**
 * PROPRIETARY — MetaTeam Technologies
 *
 * This file is part of the Enterprise Edition of Metateam Code Agent.
 * It is NOT licensed under the MIT License.
 * Commercial license required. See LICENSE.ENTERPRISE or contact
 * legal@metateam.io for terms.
 */

import { getDb } from "../session/db";
import { broadcastNotification } from "./realtime";

export type NotificationLevel = "info" | "success" | "warning" | "critical";

export type DashboardNotification = {
  id: string;
  level: NotificationLevel;
  title: string;
  message: string;
  source: string;
  read: boolean;
  createdAt: string;
};

export type NotificationPreferences = {
  emailEnabled: boolean;
  slackEnabled: boolean;
  minLevel: NotificationLevel;
  webhookUrl?: string;
};

let notifDbInitialized = false;

function ensureNotifDb(): void {
  if (notifDbInitialized) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL CHECK(level IN ('info','success','warning','critical')),
      title TEXT NOT NULL,
      message TEXT DEFAULT '',
      source TEXT DEFAULT 'system',
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_prefs (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notifications_created
    ON notifications(created_at DESC)
  `);
  notifDbInitialized = true;
}

export function createNotification(options: {
  level: NotificationLevel;
  title: string;
  message?: string;
  source?: string;
}): DashboardNotification {
  ensureNotifDb();
  const db = getDb();
  const id = crypto.randomUUID();
  const level = options.level;
  const title = options.title;
  const message = options.message ?? "";
  const source = options.source ?? "system";

  db.run(
    "INSERT INTO notifications (id, level, title, message, source, read, created_at) VALUES (?, ?, ?, ?, ?, 0, datetime('now'))",
    [id, level, title, message, source],
  );

  const row = db.query(
    "SELECT id, level, title, message, source, read, created_at FROM notifications WHERE id = ?",
  ).get(id) as { id: string; level: string; title: string; message: string; source: string; read: number; created_at: string };

  const notif: DashboardNotification = {
    id: row.id,
    level: row.level as NotificationLevel,
    title: row.title,
    message: row.message,
    source: row.source,
    read: row.read === 1,
    createdAt: row.created_at,
  };
  broadcastNotification(notif);
  void deliverWebhook(notif);
  return notif;
}

const LEVEL_ORDER: NotificationLevel[] = ["info", "success", "warning", "critical"];

async function deliverWebhook(notif: DashboardNotification): Promise<void> {
  const prefs = getNotificationPreferences();
  if (!prefs.webhookUrl) return;
  const minIdx = LEVEL_ORDER.indexOf(prefs.minLevel ?? "info");
  const curIdx = LEVEL_ORDER.indexOf(notif.level);
  if (curIdx < minIdx) return;
  try {
    await fetch(prefs.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "notification",
        level: notif.level,
        title: notif.title,
        message: notif.message,
        source: notif.source,
        createdAt: notif.createdAt,
      }),
    });
  } catch {
    // webhook delivery is best-effort
  }
}

export function listNotifications(options: {
  limit?: number;
  offset?: number;
  level?: string;
  read?: "read" | "unread";
  source?: string;
} = {}): DashboardNotification[] {
  ensureNotifDb();
  const db = getDb();
  const conditions: string[] = [];
  const params: string[] = [];

  if (options.level && options.level !== "all") {
    conditions.push("level = ?");
    params.push(options.level);
  }
  if (options.read === "read") {
    conditions.push("read = 1");
  } else if (options.read === "unread") {
    conditions.push("read = 0");
  }
  if (options.source) {
    conditions.push("source = ?");
    params.push(options.source);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const rows = db.query(
    `SELECT id, level, title, message, source, read, created_at FROM notifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  ).all(...params, String(limit), String(offset)) as Array<{
    id: string; level: string; title: string; message: string; source: string; read: number; created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    level: r.level as NotificationLevel,
    title: r.title,
    message: r.message,
    source: r.source,
    read: r.read === 1,
    createdAt: r.created_at,
  }));
}

export function getNotificationStats(): { total: number; unread: number; byLevel: Record<string, number> } {
  ensureNotifDb();
  const db = getDb();
  const total = (db.query("SELECT COUNT(*) as count FROM notifications").get() as { count: number }).count;
  const unread = (db.query("SELECT COUNT(*) as count FROM notifications WHERE read = 0").get() as { count: number }).count;
  const byLevel: Record<string, number> = { info: 0, success: 0, warning: 0, critical: 0 };
  const rows = db.query("SELECT level, COUNT(*) as count FROM notifications GROUP BY level").all() as Array<{ level: string; count: number }>;
  for (const r of rows) byLevel[r.level] = r.count;
  return { total, unread, byLevel };
}

export function updateNotification(id: string, changes: { read?: boolean }): DashboardNotification | null {
  ensureNotifDb();
  const db = getDb();
  if (changes.read !== undefined) {
    db.run("UPDATE notifications SET read = ? WHERE id = ?", [changes.read ? 1 : 0, id]);
  }
  const row = db.query(
    "SELECT id, level, title, message, source, read, created_at FROM notifications WHERE id = ?",
  ).get(id) as { id: string; level: string; title: string; message: string; source: string; read: number; created_at: string } | null;
  if (!row) return null;
  return {
    id: row.id,
    level: row.level as NotificationLevel,
    title: row.title,
    message: row.message,
    source: row.source,
    read: row.read === 1,
    createdAt: row.created_at,
  };
}

export function markAllRead(): number {
  ensureNotifDb();
  const db = getDb();
  const result = db.run("UPDATE notifications SET read = 1 WHERE read = 0");
  return result.changes;
}

export function deleteNotification(id: string): boolean {
  ensureNotifDb();
  const db = getDb();
  const result = db.run("DELETE FROM notifications WHERE id = ?", [id]);
  return result.changes > 0;
}

export function clearNotifications(level?: string): number {
  ensureNotifDb();
  const db = getDb();
  if (level) {
    const result = db.run("DELETE FROM notifications WHERE level = ?", [level]);
    return result.changes;
  }
  const result = db.run("DELETE FROM notifications");
  return result.changes;
}

export function getNotificationPreferences(): NotificationPreferences {
  ensureNotifDb();
  const db = getDb();
  const defaults: NotificationPreferences = {
    emailEnabled: false,
    slackEnabled: false,
    minLevel: "info",
  };
  const rows = db.query("SELECT key, value FROM notification_prefs").all() as Array<{ key: string; value: string }>;
  for (const r of rows) {
    try {
      (defaults as Record<string, unknown>)[r.key] = JSON.parse(r.value);
    } catch {
      // ignore corrupt pref
    }
  }
  return defaults;
}

export function updateNotificationPreferences(prefs: Partial<NotificationPreferences>): NotificationPreferences {
  ensureNotifDb();
  const db = getDb();
  const validKeys: (keyof NotificationPreferences)[] = ["emailEnabled", "slackEnabled", "minLevel", "webhookUrl"];
  for (const key of validKeys) {
    if (prefs[key] !== undefined) {
      db.run("INSERT OR REPLACE INTO notification_prefs (key, value) VALUES (?, ?)", [key, JSON.stringify(prefs[key])]);
    }
  }
  return getNotificationPreferences();
}
