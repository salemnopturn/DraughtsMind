import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import { mkdirSync } from 'fs';

let db;

export function getDb() {
  if (!db) {
    const userDataPath = app.getPath('userData');
    mkdirSync(userDataPath, { recursive: true });
    db = new Database(join(userDataPath, 'draughtsmind.db'));
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function initDb() {
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
}
