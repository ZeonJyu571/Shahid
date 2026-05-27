import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'evidence.db');

// Ensure the data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    id                   TEXT PRIMARY KEY,
    -- Hash of the full original submission (set at submit time)
    raw_submission_hash  TEXT,
    -- Raw file hashes (comma-separated if multiple files)
    raw_file_hashes      TEXT,
    -- Public layer: what appears in case inquiry
    public_data          TEXT NOT NULL,   -- JSON: { date, type, location, summary }
    public_hash          TEXT,            -- SHA-256 of serialized public_data (set on approval)
    -- Sensitive layer: reviewer-only
    sensitive_data       TEXT NOT NULL,   -- JSON: { description, actor, victimCount, contact, relation, filePaths }
    sensitive_hash       TEXT,            -- SHA-256 of serialized sensitive_data (set on approval)
    -- Blockchain fields (reserved, not yet implemented)
    merkle_root          TEXT DEFAULT NULL,
    xrpl_tx_id           TEXT DEFAULT NULL,
    -- Workflow
    status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK(status IN ('pending', 'approved', 'rejected')),
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at          TEXT DEFAULT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cases_status     ON cases(status);
  CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at DESC);
`);

// Migration: add raw_submission_hash to existing databases that predate this column
const cols = db.prepare(`PRAGMA table_info(cases)`).all() as { name: string }[];
if (!cols.some(c => c.name === 'raw_submission_hash')) {
  db.exec(`ALTER TABLE cases ADD COLUMN raw_submission_hash TEXT`);
}

export default db;
