import "server-only";
import { mkdirSync, chmodSync, existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR } from "./content";

/**
 * Фойдаланувчилар, тўловлар ва журнал учун SQLite базаси (Node.js'нинг ўзида
 * бор node:sqlite — қўшимча пакет керак эмас). Файл: DATA_DIR/app.db.
 * Контент (эшиттиришлар, жадвал) аввалгидек content.json да қолади.
 */

type DB = DatabaseSync;

const FILE = path.join(DATA_DIR, "app.db");

const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    login TEXT UNIQUE COLLATE NOCASE,
    email TEXT,
    pass TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_login INTEGER,
    blocked INTEGER NOT NULL DEFAULT 0,
    premium_from INTEGER,
    premium_until INTEGER,
    expiry_notice INTEGER,
    tg_id INTEGER UNIQUE,
    tg_name TEXT
  );
  CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE tokens (
    token TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount INTEGER NOT NULL,
    days INTEGER NOT NULL,
    method TEXT NOT NULL DEFAULT 'card',
    provider_ref TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    receipt TEXT,
    receipt_type TEXT,
    comment TEXT,
    created_at INTEGER NOT NULL,
    decided_at INTEGER,
    reject_reason TEXT,
    period_from INTEGER,
    period_until INTEGER
  );
  CREATE INDEX payments_user ON payments(user_id);
  CREATE INDEX payments_status ON payments(status);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    details TEXT,
    ip TEXT
  );
  `,
];

function open(): DB {
  mkdirSync(DATA_DIR, { recursive: true });
  const fresh = !existsSync(FILE);
  const db = new DatabaseSync(FILE);
  if (fresh) chmodSync(FILE, 0o600); // шахсий маълумотлар — фақат сайт жараёни ўқийди
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const v = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  for (let i = v; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return db;
}

export function db(): DB {
  const g = globalThis as unknown as { __svDb?: DB };
  return (g.__svDb ??= open());
}

/** Бир неча ёзувни битта транзакцияда */
export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

/* ---------- Созламалар (Premium нархи, карта рақами ва ҳ.к.) ---------- */

export function getSetting(key: string): string | null {
  const r = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return r?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db().prepare("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

/* ---------- Админ амаллари журнали ---------- */

export function audit(actor: string, action: string, target?: string | number | null, details?: unknown, ip?: string | null) {
  db()
    .prepare("INSERT INTO audit(at, actor, action, target, details, ip) VALUES(?, ?, ?, ?, ?, ?)")
    .run(Date.now(), actor, action, target == null ? null : String(target), details == null ? null : JSON.stringify(details), ip ?? null);
}
