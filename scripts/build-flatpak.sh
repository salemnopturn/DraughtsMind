#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Building Flatpak bundle..."
npm run build:flatpak
echo "Build complete. Output in dist/"
