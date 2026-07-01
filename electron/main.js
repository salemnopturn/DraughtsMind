import { app, BrowserWindow, ipcMain } from 'electron';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { initDb, getDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow;
let bookData = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: 'DraughtsMind',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.loadFile(join(__dirname, '..', 'client', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function loadBook() {
  try {
    const resourcesPath = app.isPackaged
      ? process.resourcesPath
      : join(__dirname, '..');
    const bookPath = join(resourcesPath, 'book.json');
    bookData = JSON.parse(readFileSync(bookPath, 'utf8'));
  } catch (_) {
    bookData = { compressed: [], pdn: [] };
  }
}

// ── IPC Handlers ───────────────────────────────────────────────────────────

function registerIpcHandlers() {
  ipcMain.handle('draughtsmind:book', () => bookData);

  ipcMain.handle('draughtsmind:matches:list', () => {
    const db = getDb();
    return db.prepare('SELECT * FROM matches ORDER BY created_at DESC').all();
  });

  ipcMain.handle('draughtsmind:matches:get', (_, id) => {
    const db = getDb();
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
    if (!match) return null;
    const state = db.prepare('SELECT * FROM game_states WHERE match_id = ?').get(id);
    return { match, state: state || null };
  });

  ipcMain.handle('draughtsmind:matches:create', (_, data) => {
    const { mode } = data;
    if (!['pvp', 'pva', 'mvh', 'ava', 'sandbox'].includes(mode)) {
      throw new Error('Invalid mode');
    }
    const db = getDb();
    const result = db.prepare('INSERT INTO matches (mode) VALUES (?)').run(mode);
    db.prepare(
      'INSERT INTO game_states (match_id, board, turn, history, mode) VALUES (?, ?, ?, ?, ?)'
    ).run(result.lastInsertRowid, '[]', 1, '[]', mode);
    return { id: result.lastInsertRowid, mode };
  });

  ipcMain.handle('draughtsmind:matches:update', (_, id, data) => {
    const db = getDb();
    const match = db.prepare('SELECT id FROM matches WHERE id = ?').get(id);
    if (!match) throw new Error('Match not found');

    const { board, turn, history, pdn, result, mode } = data;

    if (result) {
      db.prepare('UPDATE matches SET result = ?, pdn = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(result, pdn || null, id);
      db.prepare('DELETE FROM game_states WHERE match_id = ?').run(id);
    } else {
      db.prepare('UPDATE matches SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
      db.prepare(
        'INSERT OR REPLACE INTO game_states (match_id, board, turn, history, mode) VALUES (?, ?, ?, ?, ?)'
      ).run(id, JSON.stringify(board), turn, JSON.stringify(history), mode);
    }
    return { ok: true };
  });

  ipcMain.handle('draughtsmind:matches:delete', (_, id) => {
    const db = getDb();
    db.prepare('DELETE FROM game_states WHERE match_id = ?').run(id);
    db.prepare('DELETE FROM matches WHERE id = ?').run(id);
    return { ok: true };
  });
}

// ── App Lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
  initDb();
  loadBook();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
