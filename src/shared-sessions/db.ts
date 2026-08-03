import { Database } from "bun:sqlite";
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

const dbDir = join(homedir(), ".config", "mtc");
const dbPath = join(dbDir, "shared-sessions.db");

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
        CREATE TABLE IF NOT EXISTS shared_sessions (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','ended','archived')),
          owner_id TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          expires_at TEXT,
          max_participants INTEGER DEFAULT 10,
          is_encrypted INTEGER DEFAULT 0,
          is_ephemeral INTEGER DEFAULT 0,
          metadata TEXT DEFAULT '{}'
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS participants (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES shared_sessions(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('owner','admin','editor','viewer','guest')),
          access_level TEXT NOT NULL DEFAULT 'read-only' CHECK(access_level IN ('read-only','comment-only','edit')),
          connection_status TEXT NOT NULL DEFAULT 'connected' CHECK(connection_status IN ('connected','disconnected','reconnecting')),
          joined_at TEXT DEFAULT (datetime('now')),
          last_active_at TEXT DEFAULT (datetime('now')),
          cursor TEXT,
          selection TEXT,
          color TEXT NOT NULL,
          UNIQUE(session_id, user_id)
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS session_operations (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES shared_sessions(id) ON DELETE CASCADE,
          participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK(type IN ('insert','delete','replace','move','format')),
          file_id TEXT NOT NULL,
          position INTEGER NOT NULL,
          content TEXT,
          timestamp TEXT DEFAULT (datetime('now')),
          version INTEGER NOT NULL,
          applied INTEGER DEFAULT 1
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS session_snapshots (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES shared_sessions(id) ON DELETE CASCADE,
          version INTEGER NOT NULL,
          files TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          created_by TEXT NOT NULL
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS session_links (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES shared_sessions(id) ON DELETE CASCADE,
          token TEXT NOT NULL UNIQUE,
          access_level TEXT NOT NULL CHECK(access_level IN ('read-only','comment-only','edit')),
          expires_at TEXT,
          max_uses INTEGER,
          current_uses INTEGER DEFAULT 0,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          is_valid INTEGER DEFAULT 1
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS permissions (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES shared_sessions(id) ON DELETE CASCADE,
          participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
          access_level TEXT NOT NULL CHECK(access_level IN ('read-only','comment-only','edit')),
          domain TEXT,
          granted_at TEXT DEFAULT (datetime('now')),
          granted_by TEXT NOT NULL,
          expires_at TEXT
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS conflicts (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES shared_sessions(id) ON DELETE CASCADE,
          operation_ids TEXT NOT NULL,
          file_id TEXT NOT NULL,
          detected_at TEXT DEFAULT (datetime('now')),
          resolved_at TEXT,
          resolution TEXT CHECK(resolution IN ('auto-merge','manual','last-write-wins')),
          resolved_by TEXT
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS context_snapshots (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES shared_sessions(id) ON DELETE CASCADE,
          file_tree TEXT NOT NULL,
          environment TEXT NOT NULL DEFAULT '{}',
          command_history TEXT NOT NULL DEFAULT '[]',
          breakpoints TEXT NOT NULL DEFAULT '[]',
          variable_watches TEXT NOT NULL DEFAULT '[]',
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS metadata (
          session_id TEXT NOT NULL REFERENCES shared_sessions(id) ON DELETE CASCADE,
          key TEXT NOT NULL,
          value TEXT,
          PRIMARY KEY(session_id, key)
        )
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_participants_session ON participants(session_id)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_operations_session ON session_operations(session_id, timestamp)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_snapshots_session ON session_snapshots(session_id, version)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_links_session ON session_links(session_id)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_permissions_session ON permissions(session_id)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_conflicts_session ON conflicts(session_id)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_context_session ON context_snapshots(session_id)
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
