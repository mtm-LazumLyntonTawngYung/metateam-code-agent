import { getDb } from "../session/db";
import { loadConfig } from "../config";

export type TelemetryEvent = {
  id: number;
  event_type: string;
  event_name: string;
  properties: string | null;
  device_id: string;
  session_id: string | null;
  created_at: string;
};

export type DailyStats = {
  date: string;
  total_tool_calls: number;
  tool_failures: number;
  failure_rate: number;
  unique_sessions: number;
  models_used: string;
};

export type ModelStats = {
  model: string;
  call_count: number;
  total_tokens: number;
};

export type ToolStats = {
  tool_name: string;
  call_count: number;
  failure_count: number;
  failure_rate: number;
  avg_duration_ms: number;
};

function migrate(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      event_name TEXT NOT NULL,
      properties TEXT,
      device_id TEXT NOT NULL,
      session_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_telemetry_type
    ON telemetry_events(event_type, created_at)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_telemetry_device
    ON telemetry_events(device_id, created_at)
  `);
}

export function getDeviceId(): string {
  const cfg = loadConfig();
  if (cfg.telemetry?.deviceId) return cfg.telemetry.deviceId;
  return "unknown";
}

export function isTelemetryEnabled(): boolean {
  return loadConfig().telemetry?.enabled === true;
}

export function recordEvent(
  eventType: string,
  eventName: string,
  properties?: Record<string, unknown>,
  sessionId?: string,
): void {
  if (!isTelemetryEnabled()) return;
  try {
    migrate();
    const db = getDb();
    const deviceId = getDeviceId();
    const propsStr = properties ? JSON.stringify(properties) : null;
    db.run(
      `INSERT INTO telemetry_events (event_type, event_name, properties, device_id, session_id)
       VALUES (?, ?, ?, ?, ?)`,
      [eventType, eventName, propsStr, deviceId, sessionId ?? null],
    );
  } catch {
    // telemetry failures are non-fatal
  }
}

export function queryDailyStats(days = 30): DailyStats[] {
  try {
    migrate();
    const db = getDb();
    return db
      .query<DailyStats, [number]>(
        `SELECT
           date(created_at) AS date,
           COUNT(*) AS total_tool_calls,
           SUM(CASE WHEN json_extract(properties, '$.success') = 'false' THEN 1 ELSE 0 END) AS tool_failures,
           ROUND(
             100.0 * SUM(CASE WHEN json_extract(properties, '$.success') = 'false' THEN 1 ELSE 0 END) / COUNT(*),
             1
           ) AS failure_rate,
           COUNT(DISTINCT session_id) AS unique_sessions,
           GROUP_CONCAT(DISTINCT json_extract(properties, '$.model')) AS models_used
         FROM telemetry_events
         WHERE event_type = 'tool_call'
           AND created_at >= datetime('now', ? || ' days')
         GROUP BY date(created_at)
         ORDER BY date DESC`,
      )
      .all(-days);
  } catch {
    return [];
  }
}

export function queryModelStats(days = 30): ModelStats[] {
  try {
    migrate();
    const db = getDb();
    return db
      .query<ModelStats, [number]>(
        `SELECT
           json_extract(properties, '$.model') AS model,
           COUNT(*) AS call_count,
           COALESCE(SUM(json_extract(properties, '$.tokens')), 0) AS total_tokens
         FROM telemetry_events
         WHERE event_type = 'model_usage'
           AND created_at >= datetime('now', ? || ' days')
         GROUP BY json_extract(properties, '$.model')
         ORDER BY call_count DESC`,
      )
      .all(-days);
  } catch {
    return [];
  }
}

export function queryToolStats(days = 30): ToolStats[] {
  try {
    migrate();
    const db = getDb();
    return db
      .query<ToolStats, [number]>(
        `SELECT
           json_extract(properties, '$.tool') AS tool_name,
           COUNT(*) AS call_count,
           SUM(CASE WHEN json_extract(properties, '$.success') = 'false' THEN 1 ELSE 0 END) AS failure_count,
           ROUND(
             100.0 * SUM(CASE WHEN json_extract(properties, '$.success') = 'false' THEN 1 ELSE 0 END) / COUNT(*),
             1
           ) AS failure_rate,
           ROUND(AVG(json_extract(properties, '$.duration')), 0) AS avg_duration_ms
         FROM telemetry_events
         WHERE event_type = 'tool_call'
           AND created_at >= datetime('now', ? || ' days')
         GROUP BY json_extract(properties, '$.tool')
         ORDER BY call_count DESC`,
      )
      .all(-days);
  } catch {
    return [];
  }
}

export function queryActiveDevices(days = 30): number {
  try {
    migrate();
    const db = getDb();
    const row = db
      .query<{ count: number }, [number]>(
        `SELECT COUNT(DISTINCT device_id) AS count
         FROM telemetry_events
         WHERE created_at >= datetime('now', ? || ' days')`,
      )
      .get(-days);
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

export function queryTotalTokens(days = 30): number {
  try {
    migrate();
    const db = getDb();
    const row = db
      .query<{ total: number }, [number]>(
        `SELECT COALESCE(SUM(json_extract(properties, '$.tokens')), 0) AS total
         FROM telemetry_events
         WHERE event_type = 'model_usage'
           AND created_at >= datetime('now', ? || ' days')`,
      )
      .get(-days);
    return row?.total ?? 0;
  } catch {
    return 0;
  }
}

export function queryRecentEvents(limit = 50): TelemetryEvent[] {
  try {
    migrate();
    const db = getDb();
    return db
      .query<TelemetryEvent, [number]>(
        `SELECT * FROM telemetry_events
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(limit);
  } catch {
    return [];
  }
}
