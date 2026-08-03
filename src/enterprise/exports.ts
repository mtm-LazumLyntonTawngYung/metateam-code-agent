/**
 * PROPRIETARY — MetaTeam Technologies
 *
 * This file is part of the Enterprise Edition of Metateam Code Agent.
 * It is NOT licensed under the MIT License.
 * Commercial license required. See LICENSE.ENTERPRISE or contact
 * legal@metateam.io for terms.
 */

import { randomUUID } from "crypto";
import { getDb } from "../session/db";

export type ExportFormat = "csv" | "json";

export function toCSV(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const escape = (value: unknown): string => {
    const s = value == null ? "" : String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map(escape).join(",");
  const body = rows.map((r) => columns.map((c) => escape(r[c])).join(","));
  return [header, ...body].join("\r\n");
}

export type SerializeResult = {
  contentType: string;
  body: string;
  extension: string;
};

export function serializeExport(
  data: Array<Record<string, unknown>> | Record<string, unknown>,
  format: ExportFormat,
  columns?: string[],
): SerializeResult {
  if (format === "json") {
    return {
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(data, null, 2),
      extension: "json",
    };
  }
  const rows = Array.isArray(data) ? data : [data];
  const cols = columns ?? (rows.length > 0 ? Object.keys(rows[0]) : []);
  return { contentType: "text/csv; charset=utf-8", body: toCSV(rows, cols), extension: "csv" };
}

export type ExportRecord = {
  id: string;
  source: string;
  format: ExportFormat;
  filters: string;
  params: string;
  createdBy: string;
  createdAt: string;
};

let exportDbInitialized = false;

function ensureExportDb(): void {
  if (exportDbInitialized) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS export_history (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      format TEXT NOT NULL,
      filters TEXT DEFAULT '',
      params TEXT DEFAULT '',
      created_by TEXT DEFAULT 'dashboard',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS export_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      format TEXT NOT NULL,
      filters TEXT DEFAULT '',
      schedule TEXT DEFAULT 'none',
      last_run_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_export_history_created
    ON export_history(created_at DESC)
  `);
  exportDbInitialized = true;
}

export function listExports(options: { limit?: number; offset?: number } = {}): ExportRecord[] {
  ensureExportDb();
  const db = getDb();
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const rows = db.query(
    `SELECT * FROM export_history ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  ).all(String(limit), String(offset)) as Array<{
    id: string; source: string; format: string; filters: string; params: string;
    created_by: string; created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    format: r.format as ExportFormat,
    filters: r.filters,
    params: r.params,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

export function recordExport(record: {
  source: string;
  format: ExportFormat;
  filters?: string;
  params?: string;
  createdBy?: string;
}): ExportRecord {
  ensureExportDb();
  const db = getDb();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const filters = record.filters ?? "";
  const params = record.params ?? "";
  const createdBy = record.createdBy ?? "dashboard";
  db.run(
    `INSERT INTO export_history (id, source, format, filters, params, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, record.source, record.format, filters, params, createdBy, createdAt],
  );
  return {
    id,
    source: record.source,
    format: record.format,
    filters,
    params,
    createdBy,
    createdAt,
  };
}

export function deleteExport(id: string): boolean {
  ensureExportDb();
  const result = getDb().run("DELETE FROM export_history WHERE id = ?", [id]);
  return result.changes > 0;
}

export function clearExports(): number {
  ensureExportDb();
  return getDb().run("DELETE FROM export_history").changes;
}

export type ExportTemplate = {
  id: string;
  name: string;
  source: string;
  format: ExportFormat;
  filters: string;
  schedule: "none" | "daily" | "weekly";
  lastRunAt: string | null;
  createdAt: string;
};

export function listTemplates(): ExportTemplate[] {
  ensureExportDb();
  const db = getDb();
  const rows = db.query("SELECT * FROM export_templates ORDER BY created_at DESC").all() as Array<{
    id: string; name: string; source: string; format: string; filters: string;
    schedule: string; last_run_at: string | null; created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    source: r.source,
    format: r.format as ExportFormat,
    filters: r.filters,
    schedule: (r.schedule as ExportTemplate["schedule"]) ?? "none",
    lastRunAt: r.last_run_at,
    createdAt: r.created_at,
  }));
}

export function getTemplate(id: string): ExportTemplate | null {
  return listTemplates().find((t) => t.id === id) ?? null;
}

export function createTemplate(input: {
  name: string;
  source: string;
  format: ExportFormat;
  filters?: string;
  schedule?: "none" | "daily" | "weekly";
}): ExportTemplate | null {
  const name = input.name.trim();
  if (!name) return null;
  ensureExportDb();
  const db = getDb();
  const id = randomUUID();
  const schedule = input.schedule ?? "none";
  if (!["none", "daily", "weekly"].includes(schedule)) return null;
  db.run(
    `INSERT INTO export_templates (id, name, source, format, filters, schedule)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, name, input.source, input.format, input.filters ?? "", schedule],
  );
  return getTemplate(id);
}

export function updateTemplate(
  id: string,
  changes: Partial<Pick<ExportTemplate, "name" | "source" | "format" | "filters" | "schedule">>,
): ExportTemplate | null {
  const existing = getTemplate(id);
  if (!existing) return null;
  ensureExportDb();
  const name = changes.name?.trim();
  if (name !== undefined && !name) return null;
  const schedule = changes.schedule ?? existing.schedule;
  if (!["none", "daily", "weekly"].includes(schedule)) return null;
  getDb().run(
    `UPDATE export_templates SET name = ?, source = ?, format = ?, filters = ?, schedule = ? WHERE id = ?`,
    [
      name ?? existing.name,
      changes.source ?? existing.source,
      changes.format ?? existing.format,
      changes.filters ?? existing.filters,
      schedule,
      id,
    ],
  );
  return getTemplate(id);
}

export function deleteTemplate(id: string): boolean {
  ensureExportDb();
  return getDb().run("DELETE FROM export_templates WHERE id = ?", [id]).changes > 0;
}

export function touchTemplateLastRun(id: string, at: string): void {
  ensureExportDb();
  getDb().run("UPDATE export_templates SET last_run_at = ? WHERE id = ?", [at, id]);
}

export function isScheduleDue(template: ExportTemplate, now: Date): boolean {
  if (template.schedule === "none") return false;
  const last = template.lastRunAt ? new Date(template.lastRunAt).getTime() : 0;
  const intervalMs = template.schedule === "daily" ? 24 * 3600 * 1000 : 7 * 24 * 3600 * 1000;
  return now.getTime() - last >= intervalMs;
}

export function dueScheduledTemplates(now = new Date()): ExportTemplate[] {
  return listTemplates().filter((t) => isScheduleDue(t, now));
}
