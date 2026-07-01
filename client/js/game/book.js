import { State } from './state.js';
import { evaluate } from './eval.js';

const DARK_SQUARES = [0,2,4,6,9,11,13,15,16,18,20,22,25,27,29,31,32,34,36,38,41,43,45,47,48,50,52,54,57,59,61,63];
const BOOK_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';
const charToSq = Object.fromEntries(BOOK_ALPHA.split('').map((c, i) => [c, DARK_SQUARES[i]]));

const bookMap = new Map();

function algToIdx(sq) {
    if (!sq || sq.length < 2) return -1;
    const col = sq.charCodeAt(0) - 97;
    const row = parseInt(sq[1]) - 1;
    if (col < 0 || col > 7 || row < 0 || row > 7) return -1;
    return row * 8 + col;
}

function parsePDNLine(pdnLine) {
    const moves = [];
    const tokens = pdnLine.replace(/\d+\./g, ' ').trim().split(/\s+/);
    for (const tk of tokens) {
        if (!tk || /[{}()\[\]]/.test(tk)) continue;
        const seps = tk.split(/[-x]/);
        if (seps.length < 2) continue;
        const from = algToIdx(seps[0]);
        const to = algToIdx(seps[seps.length - 1]);
        if (from >= 0 && to >= 0) moves.push({ from, to });
    }
    return moves;
}

function bookAddLine(state, moveIdxs) {
    const s = state.clone();
    for (const mi of moveIdxs) {
        const lm = s.getMoves();
        const found = lm.find(m => m.from === mi.from && m.to === mi.to);
        if (!found) return;
        const h = s.hash;
        if (!bookMap.has(h)) bookMap.set(h, []);
        const arr = bookMap.get(h);
        if (!arr.includes(found.from * 64 + found.to))
            arr.push(found.from * 64 + found.to);
        s.applyMove(found);
    }
}

function buildFromCompressed(compressed) {
    const initState = new State();
    for (const line of compressed) {
        if (line.length < 2) continue;
        const moveIdxs = [];
        let ok = true;
        for (let i = 0; i < line.length - 1; i += 2) {
            const fsq = charToSq[line[i]];
            const tsq = charToSq[line[i + 1]];
            if (fsq === undefined || tsq === undefined) { ok = false; break; }
            moveIdxs.push({ from: fsq, to: tsq });
        }
        if (ok && moveIdxs.length > 0) bookAddLine(initState, moveIdxs);
    }
}

function buildFromPDN(pdnLines) {
    const initState = new State();
    for (const pdnLine of pdnLines) {
        try {
            const moveIdxs = parsePDNLine(pdnLine);
            if (moveIdxs.length > 0) bookAddLine(initState, moveIdxs);
        } catch (_) { /* invalid line — skip */ }
    }
}

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

export function probeBook(state) {
    const h = state.hash;
    const arr = bookMap.get(h);
    if (!arr || arr.length === 0) return null;
    const lm = state.getMoves();
    const candidates = [];
    for (const encoded of arr) {
        const fr = Math.floor(encoded / 64);
        const to = encoded % 64;
        const found = lm.find(m => m.from === fr && m.to === to);
        if (found) candidates.push(found);
    }
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    const scored = candidates.map(m => {
        const s2 = state.clone();
        s2.applyMove(m);
        return { move: m, score: -evaluate(s2) };
    });
    const maxSc = scored.reduce((mx, e) => Math.max(mx, e.score), -Infinity);
    let pcCount = 0;
    for (let i = 0; i < 64; i++) if (state.board[i] !== 0) pcCount++;
    const BOOK_TEMP = pcCount > 18 ? 14 : pcCount > 14 ? 10 : 8;
    const weights = scored.map(e => Math.exp((e.score - maxSc) / BOOK_TEMP));
    const total = weights.reduce((s, w) => s + w, 0);
    let rnd = Math.random() * total;
    for (let i = 0; i < scored.length; i++) {
        rnd -= weights[i];
        if (rnd <= 0) return scored[i].move;
    }
    return scored[scored.length - 1].move;
}
