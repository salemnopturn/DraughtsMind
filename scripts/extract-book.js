#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync('/tmp/DraughtsMind/DraughtsMind v31.0.0.html', 'utf8');

// ── Extract BOOK_DATA_EXT ─────────────────────────────────────────────────
// The monolith has: const BOOK_DATA_EXT = "..." "..." ... ;
// Multiple string literals concatenated by the JS engine.
const extMatch = html.match(/const BOOK_DATA_EXT\s*=\s*([\s\S]*?);\s*\n/);
if (!extMatch) { console.error('BOOK_DATA_EXT not found'); process.exit(1); }
const extBlock = extMatch[1];
const extStrings = [...extBlock.matchAll(/"([^"]*)"/g)].map(m => m[1]);
const compressed = extStrings.join('').split('|').filter(s => s.length >= 2);

// ── Extract PDN_EXTRA_LINES ───────────────────────────────────────────────
// The monolith has: const PDN_EXTRA_LINES = [ "..." , "..." , ... ];
const pdnMatch = html.match(/const PDN_EXTRA_LINES\s*=\s*\[([\s\S]*?)\];/);
if (!pdnMatch) { console.error('PDN_EXTRA_LINES not found'); process.exit(1); }
const pdnBlock = pdnMatch[1];
const pdn = [...pdnBlock.matchAll(/"([^"]*)"/g)].map(m => m[1]).filter(s => s.trim().length > 0);

const out = { compressed, pdn };
const outPath = join(__dirname, '..', 'server', 'data', 'book.json');
writeFileSync(outPath, JSON.stringify(out));
console.log(`Wrote ${outPath}: ${compressed.length} compressed lines, ${pdn.length} PDN lines`);
