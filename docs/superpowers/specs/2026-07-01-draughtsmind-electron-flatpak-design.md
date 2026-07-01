# DraughtsMind v3 — Electron + Flatpak Design Spec

**Date:** 2026-07-01
**Approach:** Preload API Bridge (Approach A)
**App ID:** `dev.salemnopturn.draughtsmind`

## Goal

Transform DraughtsMind from a client-server web app into a standalone Electron desktop application, packaged as a Flatpak for Flathub submission. Eliminate the Express server — SQLite and opening book are handled directly by Electron's main process.

## Architecture

```
┌─────────────────────────────────────────┐
│  Main Process (electron/main.js)        │
│  ├── app lifecycle (ready, activate)    │
│  ├── BrowserWindow creation             │
│  ├── SQLite via better-sqlite3          │
│  │   └── same schema: matches + game_states │
│  ├── book.json loaded into memory       │
│  └── IPC handlers registered            │
├─────────────────────────────────────────┤
│  Preload (electron/preload.js)          │
│  └── contextBridge.exposeInMainWorld(   │
│        'draughtsmind', {                │
│          getBook: () → Promise          │
│          matches: { list, get, create,  │
│                     update, delete }    │
│        }                                │
│      )                                  │
├─────────────────────────────────────────┤
│  Renderer (client/)                     │
│  ├── index.html — identical             │
│  ├── css/style.css — identical          │
│  ├── js/game/* — identical              │
│  ├── js/ui/* — identical                │
│  └── js/main.js — fetch→IPC migration   │
│      js/book.js — fetch→IPC migration   │
└─────────────────────────────────────────┘
```

**Security:** `contextIsolation: true`, `nodeIntegration: false` — Flathub requirement.

**SQLite DB location:** `app.getPath('userData')/draughtsmind.db`

**Opening book:** Bundled as `extraResource` via electron-builder, loaded from `process.resourcesPath` in main process.

## IPC API Surface

The preload script exposes `window.draughtsmind` to the renderer:

```js
window.draughtsmind = {
  // Opening book
  getBook: () => Promise<{ compressed: string, pdnLines: string[] }>,

  // Match CRUD
  matches: {
    list: () => Promise<{ id, mode, result, pdn, created_at, updated_at }[]>,
    get: (id) => Promise<{ match, gameState }>,
    create: (data) => Promise<{ id }>,
    update: (id, data) => Promise<{ ok: boolean }>,
    delete: (id) => Promise<{ ok: boolean }>,
  }
}
```

**IPC channel naming:** `draughtsmind:book`, `draughtsmind:matches:list`, `draughtsmind:matches:get`, `draughtsmind:matches:create`, `draughtsmind:matches:update`, `draughtsmind:matches:delete`.

## Client Code Changes

Only two files need modification:

### `client/js/book.js`
- Replace `fetch('/api/book')` with `window.draughtsmind.getBook()`
- Remove `serverUrl` parameter (no longer needed)
- Map building and softmax probe logic stays identical

### `client/js/main.js`
- Replace 5 `fetch('/api/matches/...')` calls with `window.draughtsmind.matches.*`
- Match management functions (`saveMatch`, `loadMatch`, `deleteMatch`, `checkResume`) change internals but keep same signatures
- Game loop, AI integration, UI wiring stay identical

### No changes to:
- `client/index.html`
- `client/css/style.css`
- `client/js/game/*` (constants, state, gameState, search, eval)
- `client/js/ui/*` (board, controls, history, clock)

## New Files

### `electron/main.js`
Main process entry point:
- `app.whenReady()` → create BrowserWindow (1000×750, resizable)
- Load `client/index.html` as renderer content
- Initialize SQLite via `better-sqlite3` in userData path
- Load `book.json` from resources path into memory
- Register IPC handlers for book + matches
- Handle app lifecycle (window-all-closed, activate)

### `electron/preload.js`
Preload script using `contextBridge`:
- Expose `window.draughtsmind` API
- Each method calls `ipcRenderer.invoke()` with appropriate channel
- Type-safe channel names as constants

### `electron/db.js`
SQLite module (adapted from `server/db.js`):
- Same schema: `matches` + `game_states` tables
- Same functions: `initDB()`, `getDB()`
- Path: `app.getPath('userData')/draughtsmind.db`

## Flatpak + Flathub Packaging

### Files

| File | Purpose |
|------|---------|
| `flatpak/dev.salemnopturn.draughtsmind.yml` | Flatpak manifest |
| `flatpak/dev.salemnopturn.draughtsmind.desktop` | Desktop entry |
| `flatpak/dev.salemnopturn.draughtsmind.metainfo.xml` | AppStream metadata |
| `flatpak/icons/hicolor/` | App icons (16×16 to 512×512 PNGs) |

### Flatpak Manifest

```yaml
app-id: dev.salemnopturn.draughtsmind
runtime: org.freedesktop.Platform
runtime-version: '24.08'
sdk: org.freedesktop.Sdk
base: org.electronjs.Electron2.BaseApp
base-version: '24.08'
command: draughtsmind
modules:
  - name: draughtsmind
    buildsystem: simple
    build-commands:
      - npm ci --omit=dev
      - npx electron-builder --linux --flatpak
    sources:
      - type: dir
        path: ../../
finish-args:
  - --share=ipc
  - --socket=x11
  - --socket=wayland
  - --socket=pulseaudio
  - --device=dri
  - --filesystem=home
```

### Desktop Entry

Standard Freedesktop format:
- Name: DraughtsMind
- Comment: Elite Brazilian Draughts AI
- Category: Game
- Keywords: draughts, checkers, damas, AI, game
- Icon: dev.salemnopturn.draughtsmind

### Metainfo XML

Flathub-required metadata:
- App description (English + Portuguese)
- Screenshots (placeholder URLs)
- Release notes for v3.0.0
- License: GPL-3.0-or-later
- Developer info
- Content rating (OARS — all ages)

## Project Structure

```
DraughtsMind/
├── electron/
│   ├── main.js              ← Main process entry
│   ├── preload.js           ← contextBridge API
│   └── db.js                ← SQLite (adapted from server/)
├── client/                  ← Unchanged (renderer loads from here)
├── server/                  ← Preserved for web version dev
├── flatpak/
│   ├── dev.salemnopturn.draughtsmind.yml
│   ├── dev.salemnopturn.draughtsmind.desktop
│   ├── dev.salemnopturn.draughtsmind.metainfo.xml
│   └── icons/
├── scripts/
│   ├── setup.sh             ← Updated: also installs electron deps
│   ├── start.sh             ← Updated: launches Electron in dev
│   └── build-flatpak.sh     ← New: builds the Flatpak bundle
├── package.json             ← Updated: add electron, electron-builder
├── electron-builder.yml     ← New: build config
└── test/
```

## package.json Changes

```json
{
  "name": "draughtsmind",
  "version": "2.0.0",
  "main": "electron/main.js",
  "scripts": {
    "start": "electron .",
    "build:flatpak": "electron-builder --linux --flatpak",
    "test": "node --test test/*.test.js"
  },
  "devDependencies": {
    "electron": "^35.0.0",
    "electron-builder": "^26.0.0"
  }
}
```

## electron-builder.yml

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
  target: [flatpak]
  category: Game
```

## Build Pipeline

1. `npm ci` — install deps
2. `npm start` — launch Electron in dev mode
3. `npm run build:flatpak` — electron-builder produces `.flatpak` bundle in `dist/`
4. For Flathub submission: the `flatpak/` manifest is used by Flathub's CI to build from source. The electron-builder output is for local testing only.

## Dev Workflow

- `npm start` — launches Electron in dev mode
- `node server/index.js` — existing web server still works for browser testing
- `npm test` — runs existing unit tests (unchanged)

## What Stays the Same

- All game engine code (state, search, eval, book logic)
- All UI code (board, controls, history, clock)
- Opening book data and probe algorithm
- Match persistence schema and API contract
- Dark theme CSS
- Game modes, AI, evaluation, everything user-facing

## What Changes

- Server eliminated — main process handles SQLite + book directly
- `fetch()` calls replaced with IPC calls (2 files, ~15 lines changed)
- New electron/ directory (3 files)
- New flatpak/ directory (4+ files)
- Updated package.json with electron deps
- New electron-builder.yml
- Updated scripts
