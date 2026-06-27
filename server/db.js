import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db;

export function getDb() {
  if (!db) {
    db = new Database(join(__dirname, 'draughtsmind.db'));
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function init() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      mode        TEXT NOT NULL,
      result      TEXT,
      pdn         TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS game_states (
      match_id    INTEGER PRIMARY KEY REFERENCES matches(id),
      board       TEXT NOT NULL,
      turn        INTEGER NOT NULL,
      history     TEXT NOT NULL,
      mode        TEXT NOT NULL
    );
  `);
  return Promise.resolve();
}
