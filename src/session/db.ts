import { Database } from "bun:sqlite";
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

const dbDir = join(homedir(), ".config", "mtc");
const dbPath = join(dbDir, "history.db");

let db: Database | null = null;

export function getDb(): Database {
  if (db) return db;

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  const current = db.query("PRAGMA user_version").get() as { user_version: number };
  const from = current.user_version;
  const migrations: Array<() => void> = [
    () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          label TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          metadata TEXT
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN ('user','assistant','tool','system')),
          content TEXT NOT NULL,
          tool_name TEXT,
          tool_args TEXT,
          tool_result TEXT,
          token_count INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          pruned INTEGER DEFAULT 0
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS patches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          file_path TEXT NOT NULL,
          original_content TEXT NOT NULL,
          new_content TEXT NOT NULL,
          tool_name TEXT,
          tool_args TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS summaries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          summary_text TEXT NOT NULL,
          pruned_until INTEGER,
          token_count INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS turns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          model_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          reasoning_tokens INTEGER DEFAULT 0,
          cache_read_tokens INTEGER DEFAULT 0,
          cache_write_tokens INTEGER DEFAULT 0,
          cost_usd REAL DEFAULT 0,
          duration_ms INTEGER DEFAULT 0,
          tool_calls INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_session
        ON messages(session_id, created_at)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_patches_session
        ON patches(session_id, created_at)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_turns_session
        ON turns(session_id, created_at)
      `);
    },
  ];

  for (let v = from; v < migrations.length; v++) {
    migrations[v]();
    db.exec(`PRAGMA user_version = ${v + 1}`);
  }
}

export function run(sql: string, bindings: unknown[] = []): { changes: number; lastInsertRowid: number } {
  const result = (getDb().run as (sql: string, ...args: unknown[]) => { changes: number; lastInsertRowid: number })(sql, ...bindings);
  return result;
}

export function all<T = Record<string, unknown>>(sql: string, bindings: unknown[] = []): T[] {
  const q = getDb().query(sql);
  const result = (q.all as (...args: unknown[]) => T[])(...bindings);
  return result;
}

export function get<T = Record<string, unknown>>(sql: string, bindings: unknown[] = []): T | null {
  const rows = all<T>(sql, bindings);
  return rows[0] ?? null;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
