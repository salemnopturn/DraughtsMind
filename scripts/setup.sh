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
