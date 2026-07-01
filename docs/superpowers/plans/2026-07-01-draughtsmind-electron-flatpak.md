# DraughtsMind Electron + Flatpak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform DraughtsMind from a client-server web app into a standalone Electron desktop application packaged as a Flatpak for Flathub.

**Architecture:** Electron main process handles SQLite + opening book directly (eliminates Express server). Preload script exposes `window.draughtsmind` API via contextBridge. Renderer (existing client code) calls IPC instead of fetch(). Flatpak packaging with full Flathub metadata.

**Tech Stack:** Electron 35, better-sqlite3, electron-builder, Flatpak (org.freedesktop.Platform 24.08 + Electron2.BaseApp)

---

## File Structure

```
DraughtsMind/
├── electron/
│   ├── main.js              ← Main process entry (NEW)
│   ├── preload.js           ← contextBridge API (NEW)
│   └── db.js                ← SQLite module adapted from server/db.js (NEW)
├── client/
│   ├── js/game/book.js      ← MODIFY: fetch→IPC
│   └── js/main.js           ← MODIFY: fetch→IPC
├── flatpak/
│   ├── dev.salemnopturn.draughtsmind.yml        (NEW)
│   ├── dev.salemnopturn.draughtsmind.desktop    (NEW)
│   ├── dev.salemnopturn.draughtsmind.metainfo.xml (NEW)
│   └── icons/hicolor/128x128/apps/dev.salemnopturn.draughtsmind.png (NEW)
├── scripts/
│   ├── setup.sh             ← MODIFY: add electron deps
│   ├── start.sh             ← MODIFY: launch electron
│   └── build-flatpak.sh     (NEW)
├── package.json             ← MODIFY: add electron deps, main entry
├── electron-builder.yml     (NEW)
└── server/                  ← UNCHANGED (preserved for web dev)
```

---

### Task 1: Project scaffolding — package.json + electron-builder.yml

**Files:**
- Modify: `package.json`
- Create: `electron-builder.yml`

- [ ] **Step 1: Update package.json**

```json
{
  "name": "draughtsmind",
  "version": "3.0.0",
  "description": "Elite Brazilian Draughts AI engine",
  "main": "electron/main.js",
  "type": "module",
  "scripts": {
    "start": "electron .",
    "build:flatpak": "electron-builder --linux --flatpak",
    "test": "node --test test/*.test.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0"
  },
  "devDependencies": {
    "electron": "^35.0.0",
    "electron-builder": "^26.0.0"
  }
}
```

- [ ] **Step 2: Create electron-builder.yml**

```yaml
appId: dev.salemnopturn.draughtsmind
productName: DraughtsMind
directories:
  output: dist
files:
  - client/**/*
  - electron/**/*
  - node_modules/**/*
extraResources:
  - from: server/data/book.json
    to: book.json
linux:
  target:
    - flatpak
  category: Game
```

- [ ] **Step 3: Install dependencies**

Run: `npm install` in project root.
Expected: `node_modules/` created with electron, electron-builder, better-sqlite3.

- [ ] **Step 4: Commit**

```bash
git add package.json electron-builder.yml package-lock.json
git commit -m "chore: add electron + electron-builder deps and build config"
```

---

### Task 2: electron/db.js — SQLite module

**Files:**
- Create: `electron/db.js`

Adapted from `server/db.js`. Uses `app.getPath('userData')` for the DB path instead of `__dirname`.

- [ ] **Step 1: Create electron/db.js**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add electron/db.js
git commit -m "feat(electron): add SQLite database module"
```

---

### Task 3: electron/preload.js — contextBridge API

**Files:**
- Create: `electron/preload.js`

Exposes `window.draughtsmind` API to the renderer via contextBridge + ipcRenderer.

- [ ] **Step 1: Create electron/preload.js**

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('draughtsmind', {
  getBook: () => ipcRenderer.invoke('draughtsmind:book'),

  matches: {
    list:   ()           => ipcRenderer.invoke('draughtsmind:matches:list'),
    get:    (id)         => ipcRenderer.invoke('draughtsmind:matches:get', id),
    create: (data)       => ipcRenderer.invoke('draughtsmind:matches:create', data),
    update: (id, data)   => ipcRenderer.invoke('draughtsmind:matches:update', id, data),
    delete: (id)         => ipcRenderer.invoke('draughtsmind:matches:delete', id),
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/preload.js
git commit -m "feat(electron): add preload script with IPC bridge"
```

---

### Task 4: electron/main.js — Main process entry

**Files:**
- Create: `electron/main.js`

Creates BrowserWindow, initializes SQLite, loads book.json, registers IPC handlers.

- [ ] **Step 1: Create electron/main.js**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.js
git commit -m "feat(electron): add main process with IPC handlers"
```

---

### Task 5: Migrate client/js/game/book.js — fetch to IPC

**Files:**
- Modify: `client/js/game/book.js:73-83`

- [ ] **Step 1: Replace loadBook() function**

Change lines 73-83 of `client/js/game/book.js` from:

```js
export async function loadBook() {
    try {
        const res = await fetch('/api/book');
        if (!res.ok) return;
        const data = await res.json();
        if (data.compressed) buildFromCompressed(data.compressed);
        if (data.pdn) buildFromPDN(data.pdn);
    } catch (_) {
        // Book unavailable — AI plays without book
    }
}
```

To:

```js
export async function loadBook() {
    try {
        let data;
        if (window.draughtsmind) {
            data = await window.draughtsmind.getBook();
        } else {
            const res = await fetch('/api/book');
            if (!res.ok) return;
            data = await res.json();
        }
        if (data.compressed) buildFromCompressed(data.compressed);
        if (data.pdn) buildFromPDN(data.pdn);
    } catch (_) {
        // Book unavailable — AI plays without book
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add client/js/game/book.js
git commit -m "feat(client): migrate book.js from fetch to IPC bridge"
```

---

### Task 6: Migrate client/js/main.js — fetch to IPC

**Files:**
- Modify: `client/js/main.js:56-77` (API helpers)
- Modify: `client/js/main.js:233-266` (saveMatch, finalizeMatch, deleteMatch)
- Modify: `client/js/main.js:268-287` (checkForResume)
- Modify: `client/js/main.js:289-322` (resumeMatch)
- Modify: `client/js/main.js:328-366` (showLoadModal)

- [ ] **Step 1: Replace API helpers with IPC-aware versions**

Change lines 54-77 of `client/js/main.js` from:

```js
// ── API helpers ─────────────────────────────────────────────────────────────

async function apiPost(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function apiPut(url, body) {
    const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function apiGet(url) {
    const res = await fetch(url);
    return res.json();
}
```

To:

```js
// ── API helpers (IPC bridge with fetch fallback) ────────────────────────────

const api = window.draughtsmind?.matches;

async function apiPost(_url, body) {
    if (api) return api.create(body);
    const res = await fetch(_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function apiPut(_url, body) {
    if (api) {
        const id = parseInt(_url.split('/').pop());
        return api.update(id, body);
    }
    const res = await fetch(_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function apiGet(_url) {
    if (api) {
        const parts = _url.split('/');
        const id = parts.length > 3 ? parseInt(parts[parts.length - 1]) : null;
        return id ? api.get(id) : api.list();
    }
    const res = await fetch(_url);
    return res.json();
}
```

- [ ] **Step 2: Replace deleteMatch to use IPC**

Change lines 262-266 of `client/js/main.js` from:

```js
async function deleteMatch(id) {
    try {
        await fetch(`/api/matches/${id}`, { method: 'DELETE' });
    } catch (_) { /* ignore */ }
}
```

To:

```js
async function deleteMatch(id) {
    try {
        if (api) await api.delete(id);
        else await fetch(`/api/matches/${id}`, { method: 'DELETE' });
    } catch (_) { /* ignore */ }
}
```

- [ ] **Step 3: Commit**

```bash
git add client/js/main.js
git commit -m "feat(client): migrate main.js match persistence from fetch to IPC"
```

---

### Task 7: Update scripts

**Files:**
- Modify: `scripts/setup.sh`
- Modify: `scripts/start.sh`
- Create: `scripts/build-flatpak.sh`

- [ ] **Step 1: Update scripts/setup.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Installing dependencies..."
npm install
echo "Initializing database..."
cd server && node -e "import('./db.js').then(m => m.init())"
cd ..
echo "Setup complete."
echo "  Web dev:  './scripts/start.sh' (server mode)"
echo "  Desktop:  'npm start' (Electron mode)"
```

- [ ] **Step 2: Update scripts/start.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../server"
exec node index.js
```

(Keep as-is — still useful for web dev mode.)

- [ ] **Step 3: Create scripts/build-flatpak.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Building Flatpak bundle..."
npm run build:flatpak
echo "Build complete. Output in dist/"
```

Make executable: `chmod +x scripts/build-flatpak.sh`

- [ ] **Step 4: Commit**

```bash
git add scripts/setup.sh scripts/build-flatpak.sh
git commit -m "chore: update scripts for Electron dev and Flatpak build"
```

---

### Task 8: Flatpak manifest

**Files:**
- Create: `flatpak/dev.salemnopturn.draughtsmind.yml`

- [ ] **Step 1: Create Flatpak manifest**

```yaml
app-id: dev.salemnopturn.draughtsmind
runtime: org.freedesktop.Platform
runtime-version: '24.08'
sdk: org.freedesktop.Sdk
base: org.electronjs.Electron2.BaseApp
base-version: '24.08'
command: draughtsmind

finish-args:
  - --share=ipc
  - --socket=x11
  - --socket=wayland
  - --socket=pulseaudio
  - --device=dri
  - --filesystem=home

modules:
  - name: draughtsmind
    buildsystem: simple
    build-commands:
      - npm ci --omit=dev
      - npx electron-builder --linux --flatpak
      - install -dm755 /app/bin
      - install -dm755 /app/share/draughtsmind
      - cp -r dist/linux-unpacked/* /app/share/draughtsmind/
      - cat > /app/bin/draughtsmind << 'EOF'
      - #!/bin/sh
      - exec /app/share/draughtsmind/draughtsmind "$@"
      - EOF
      - chmod +x /app/bin/draughtsmind
      - install -Dm644 flatpak/dev.salemnopturn.draughtsmind.desktop /app/share/applications/dev.salemnopturn.draughtsmind.desktop
      - install -Dm644 flatpak/dev.salemnopturn.draughtsmind.metainfo.xml /app/share/metainfo/dev.salemnopturn.draughtsmind.metainfo.xml
      - for size in 16 32 48 64 128 256 512; do
          install -Dm644 flatpak/icons/hicolor/${size}x${size}/apps/dev.salemnopturn.draughtsmind.png
            /app/share/icons/hicolor/${size}x${size}/apps/dev.salemnopturn.draughtsmind.png;
        done
    sources:
      - type: dir
        path: ../
```

- [ ] **Step 2: Commit**

```bash
git add flatpak/dev.salemnopturn.draughtsmind.yml
git commit -m "feat(flatpak): add Flatpak manifest"
```

---

### Task 9: Desktop entry + metainfo XML

**Files:**
- Create: `flatpak/dev.salemnopturn.draughtsmind.desktop`
- Create: `flatpak/dev.salemnopturn.draughtsmind.metainfo.xml`

- [ ] **Step 1: Create desktop entry**

```ini
[Desktop Entry]
Type=Application
Name=DraughtsMind
GenericName=Draughts AI
Comment=Elite Brazilian Draughts AI engine
Exec=draughtsmind %f
Icon=dev.salemnopturn.draughtsmind
Terminal=false
Categories=Game;StrategyGame;
Keywords=draughts;checkers;damas;AI;game;strategy;
StartupWMClass=draughtsmind
```

- [ ] **Step 2: Create metainfo XML**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>dev.salemnopturn.draughtsmind</id>

  <name>DraughtsMind</name>
  <summary>Elite Brazilian Draughts AI engine</summary>

  <metadata_license>CC0-1.0</metadata_license>
  <project_license>GPL-3.0-or-later</project_license>

  <developer id="dev.salemnopturn">
    <name>salemnopturn</name>
  </developer>

  <description>
    <p>
      DraughtsMind is a high-performance Brazilian Draughts (damas brasileiras) AI engine
      featuring a handcrafted evaluation with 30+ heuristics, alpha-beta search with advanced
      pruning techniques, and an opening book with thousands of lines.
    </p>
    <p>Features:</p>
    <ul>
      <li>5 game modes: PvP, PvA, MVH, AvA, Sandbox</li>
      <li>Adjustable search depth (1-16 plies)</li>
      <li>Real-time analysis with evaluation and principal variation</li>
      <li>Chess-clock timer system</li>
      <li>PDN import/export</li>
      <li>Match save/load with SQLite persistence</li>
    </ul>
  </description>

  <launchable type="desktop-id">dev.salemnopturn.draughtsmind.desktop</launchable>

  <url type="homepage">https://github.com/salemnopturn/DraughtsMind</url>
  <url type="bugtracker">https://github.com/salemnopturn/DraughtsMind/issues</url>

  <screenshots>
    <screenshot type="default">
      <image>https://raw.githubusercontent.com/salemnopturn/DraughtsMind/main/screenshots/screenshot.png</image>
      <caption>DraughtsMind — Brazilian Draughts AI</caption>
    </screenshot>
  </screenshots>

  <content_rating type="oars-1.1" />

  <releases>
    <release version="3.0.0" date="2026-07-01">
      <description>
        <p>Electron desktop app with Flatpak packaging.</p>
        <ul>
          <li>Standalone desktop application — no server required</li>
          <li>Flatpak package for Flathub</li>
          <li>SQLite match persistence</li>
          <li>Opening book bundled as app resource</li>
        </ul>
      </description>
    </release>
    <release version="2.0.0" date="2026-06-27">
      <description>
        <p>Full feature parity with monolith v31.0.0.</p>
        <ul>
          <li>5 game modes including AvA and Sandbox</li>
          <li>Chess-clock timer system</li>
          <li>Real-time analysis and board flip</li>
          <li>PDN import/export</li>
        </ul>
      </description>
    </release>
  </releases>

  <recommends>
    <control>pointing</control>
    <control>keyboard</control>
  </recommends>
</component>
```

- [ ] **Step 3: Commit**

```bash
git add flatpak/dev.salemnopturn.draughtsmind.desktop flatpak/dev.salemnopturn.draughtsmind.metainfo.xml
git commit -m "feat(flatpak): add desktop entry and AppStream metainfo"
```

---

### Task 10: App icons

**Files:**
- Create: `flatpak/icons/hicolor/128x128/apps/dev.salemnopturn.draughtsmind.png`

Flathub requires at least a 128×128 icon. A simple placeholder icon will be created.

- [ ] **Step 1: Create icons directory**

```bash
mkdir -p flatpak/icons/hicolor/128x128/apps
```

- [ ] **Step 2: Generate a simple placeholder icon**

Create a 128×128 PNG icon. Use ImageMagick or a simple Python script to generate a solid-color icon with "DM" text as placeholder:

```bash
python3 -c "
from PIL import Image, ImageDraw, ImageFont
img = Image.new('RGB', (128, 128), '#1a1a2e')
draw = ImageDraw.Draw(img)
draw.rectangle([16, 16, 112, 112], outline='#4a9eff', width=4)
draw.text((32, 40), 'DM', fill='#4a9eff')
img.save('flatpak/icons/hicolor/128x128/apps/dev.salemnopturn.draughtsmind.png')
" 2>/dev/null || python3 -c "
import struct, zlib
def create_png(w, h, color):
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    raw = b''
    for y in range(h):
        raw += b'\x00' + bytes(color) * w
    return (b'\x89PNG\r\n\x1a\n' +
            chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) +
            chunk(b'IDAT', zlib.compress(raw)) +
            chunk(b'IEND', b''))
png = create_png(128, 128, (26, 26, 46))
with open('flatpak/icons/hicolor/128x128/apps/dev.salemnopturn.draughtsmind.png', 'wb') as f:
    f.write(png)
print('Created placeholder icon')
"
```

- [ ] **Step 3: Commit**

```bash
git add flatpak/icons/
git commit -m "feat(flatpak): add placeholder app icon"
```

---

### Task 11: Verify Electron launches

**Files:** None (verification only)

- [ ] **Step 1: Launch Electron in dev mode**

Run: `npm start`
Expected: Electron window opens showing DraughtsMind UI.

- [ ] **Step 2: Verify book loads**

Check console for errors. The opening book should load via IPC.

- [ ] **Step 3: Play a move in PvA mode**

Click a piece, make a move. CPU should respond. This confirms:
- State engine works in renderer
- UI rendering works
- AI search works

- [ ] **Step 4: Verify match persistence**

Play a few moves, close and reopen the app. Resume modal should appear.

- [ ] **Step 5: Run existing tests**

Run: `npm test`
Expected: 26 tests pass (unchanged — game engine tests don't depend on Electron).

- [ ] **Step 6: Commit any fixes**

If any issues found, fix and commit.

---

### Task 12: Build and test Flatpak bundle

**Files:** None (build verification)

- [ ] **Step 1: Build Flatpak bundle**

Run: `npm run build:flatpak`
Expected: `dist/DraughtsMind-3.0.0.flatpak` created.

- [ ] **Step 2: Install and test locally**

Run: `flatpak install dist/DraughtsMind-3.0.0.flatpak`
Run: `flatpak run dev.salemnopturn.draughtsmind`
Expected: App launches from Flatpak sandbox.

- [ ] **Step 3: Verify Flatpak permissions**

Check that the app can:
- Read/write SQLite in userData
- Load book.json from resources
- Render the board
- Run AI search

- [ ] **Step 4: Commit build script adjustments**

If any issues found, fix and commit.

---

### Task 13: Final cleanup and documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README.md**

Add Electron + Flatpak sections to the existing README:

```markdown
## Desktop App (Electron)

### Prerequisites
- Node.js 18+
- npm

### Development

\`\`\`bash
npm install
npm start
\`\`\`

### Build Flatpak

\`\`\`bash
npm run build:flatpak
\`\`\`

Output: `dist/DraughtsMind-3.0.0.flatpak`

### Install locally

\`\`\`bash
flatpak install dist/DraughtsMind-3.0.0.flatpak
flatpak run dev.salemnopturn.draughtsmind
\`\`\`
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README with Electron and Flatpak instructions"
```
