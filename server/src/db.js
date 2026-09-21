// ── EstateFlow database layer ──────────────────────────────────────────────
// Uses Node's built-in SQLite driver (zero native deps). The schema is plain
// SQL and written to be portable to PostgreSQL — see README "PostgreSQL".
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'app.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

db.exec(`
CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  address TEXT NOT NULL,
  city TEXT, state TEXT, zip TEXT, county TEXT,
  apn TEXT,
  property_type TEXT DEFAULT 'single_family',
  beds REAL, baths REAL, sqft INTEGER, lot_sqft INTEGER, year_built INTEGER,
  price REAL, assessed_value REAL,
  last_sale_price REAL, last_sale_date TEXT,
  owner_name TEXT, owner_mailing_address TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  latitude REAL, longitude REAL,
  notes TEXT, raw TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_properties_source ON properties(source, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_properties_city ON properties(city);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT, phone TEXT,
  type TEXT NOT NULL DEFAULT 'buyer',        -- buyer | seller | renter | agent | vendor
  stage TEXT NOT NULL DEFAULT 'new',         -- new | contacted | qualified | negotiating | closed | lost
  tags TEXT NOT NULL DEFAULT '[]',
  budget_min REAL, budget_max REAL,
  preferred_locations TEXT,
  notes TEXT,
  source TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'sms',       -- sms | email | webchat
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'open',       -- open | pending_human | closed
  autopilot INTEGER NOT NULL DEFAULT 1,
  unread INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,                   -- in | out
  body TEXT NOT NULL,
  intent TEXT, sentiment TEXT,
  ai_generated INTEGER NOT NULL DEFAULT 0,
  meta TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_messages_conversation ON messages(conversation_id);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connector TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'running',    -- running | success | error
  records_found INTEGER DEFAULT 0,
  records_imported INTEGER DEFAULT 0,
  log TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  started_at TEXT NOT NULL, finished_at TEXT
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  entity_type TEXT, entity_id INTEGER,
  summary TEXT NOT NULL,
  meta TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function logActivity(type, entityType, entityId, summary, meta = null) {
  run(
    'INSERT INTO activities (type, entity_type, entity_id, summary, meta, created_at) VALUES (?,?,?,?,?,?)',
    type, entityType, entityId, summary, meta ? JSON.stringify(meta) : null, now()
  );
}

export function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(key, value) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, JSON.stringify(value)
  );
}
