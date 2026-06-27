import { EMPTY, W_MAN, B_MAN, W_KING, B_KING, moveSorter } from './constants.js';
import { State } from './state.js';
import { evaluate } from './eval.js';

let evalMode = 0;
export function setEvalMode(m) { evalMode = m; }

// Dynamic import for book.js (Task 6) — defaults to null if unavailable
let _probeBookFn = null;
(async () => {
  try {
    const mod = await import('./book.js');
    _probeBookFn = mod.probeBook;
  } catch {
    _probeBookFn = () => null;
  }
})();
function probeBook(state) {
  return _probeBookFn ? _probeBookFn(state) : null;
}

// ════════════════════════════════════════════════════════════════════════
//  TABELA DE TRANSPOSIÇÃO  [SRCH-V15-1] — 2^22 entradas
// ════════════════════════════════════════════════════════════════════════
// ── TT v16: dois slots por bucket (depth-preferred + always-replace) ─────
const TT_SIZE  = 1 << 22;
const TT_MASK  = TT_SIZE - 1;
const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;
const tt0 = new Array(TT_SIZE);
const tt1 = new Array(TT_SIZE);
let   ttGen = 0;

function ttStore(hash, depth, flag, score, fm, tm) {
    const idx = (hash & TT_MASK) >>> 0;
    const e0  = tt0[idx];
    {
        const e1 = tt1[idx];
        if (!e1) tt1[idx] = { h: hash, d: depth, f: flag, s: score, fm, tm, g: ttGen };
        else { e1.h=hash; e1.d=depth; e1.f=flag; e1.s=score; e1.fm=fm; e1.tm=tm; e1.g=ttGen; }
    }
    if (!e0 || e0.g !== ttGen || e0.h === hash || depth >= e0.d) {
        if (!e0) tt0[idx] = { h: hash, d: depth, f: flag, s: score, fm, tm, g: ttGen };
        else { e0.h=hash; e0.d=depth; e0.f=flag; e0.s=score; e0.fm=fm; e0.tm=tm; e0.g=ttGen; }
    }
}

function ttProbe(hash) {
    const idx = (hash & TT_MASK) >>> 0;
    const e0 = tt0[idx];
    if (e0 && e0.g === ttGen && e0.h === hash) return e0;
    const e1 = tt1[idx];
    if (e1 && e1.g === ttGen && e1.h === hash) return e1;
    return null;
}

// ════════════════════════════════════════════════════════════════════════
//  KILLER MOVES + HISTÓRIA + COUNTER MOVES (v16)
// ════════════════════════════════════════════════════════════════════════
const MAX_PLY = 128;
const killers = Array.from({ length: MAX_PLY }, () => [null, null]);
const histTable = new Int32Array(4096);
const counterTable = new Array(4096).fill(null);

const undoBuffers = Array.from({ length: MAX_PLY }, () => ({
    board: new Int8Array(64),
    turn: 0, hash: 0, halfMoveClock: 0,
    endgameClock: 0, isEndgame: false, endgameLimit: 0,
    wK: 0, wP: 0, bK: 0, bP: 0,
    hashHistArr: []
}));

function storeKiller(ply, m) {
    if (ply >= MAX_PLY) return;
    const k = killers[ply];
    if (k[0] && k[0].from === m.from && k[0].to === m.to) return;
    k[1] = k[0]; k[0] = { from: m.from, to: m.to };
}

function storeCounter(prevFrom, prevTo, m) {
    if (prevFrom < 0) return;
    counterTable[prevFrom * 64 + prevTo] = { from: m.from, to: m.to };
}

function scoreMoveOrder(m, hfm, htm, ply, prevFrom, prevTo) {
    if (m.from===hfm && m.to===htm) return 2000000;
    if (m.captured.length > 0) {
        return 1000000 + m.captured.length*10000 + (m.capKings||0)*3000 + (m.promo?5000:0);
    }
    if (m.promo) return 900000;
    if (ply < MAX_PLY) {
        const k = killers[ply];
        if (k[0]&&k[0].from===m.from&&k[0].to===m.to) return 800000;
        if (k[1]&&k[1].from===m.from&&k[1].to===m.to) return 799000;
    }
    if (prevFrom >= 0) {
        const cm = counterTable[prevFrom * 64 + prevTo];
        if (cm && cm.from===m.from && cm.to===m.to) return 798000;
    }
    return histTable[m.from*64+m.to];
}

function orderMoves(moves, hfm, htm, ply, prevFrom, prevTo) {
    const n = moves.length, scores = new Int32Array(n);
    for (let i = 0; i < n; i++) scores[i] = scoreMoveOrder(moves[i], hfm, htm, ply, prevFrom, prevTo);
    for (let i = 1; i < n; i++) {
        const sm = scores[i], mv = moves[i]; let j = i-1;
        while (j>=0 && scores[j]<sm) { scores[j+1]=scores[j]; moves[j+1]=moves[j]; j--; }
        scores[j+1]=sm; moves[j+1]=mv;
    }
}

// ════════════════════════════════════════════════════════════════════════
//  MOTOR DE BUSCA v16.0.0
// ════════════════════════════════════════════════════════════════════════
let nodes = 0, searchAborted = false, searchStartTime = 0, searchTimeLimitMs = 0;
let inNullMove = false;

function qsearch(state, alpha, beta, ply, depth) {
    nodes++;
    if ((nodes & 4095) === 0 && searchTimeLimitMs > 0) {
        if (Date.now() - searchStartTime > searchTimeLimitMs) { searchAborted = true; return alpha; }
    }
    if (ply >= MAX_PLY) return evaluate(state, evalMode);
    if (state.checkDraw()) return 0;

    const moves = state.getMoves();
    if (moves.length === 0) return -9999 + ply;

    const hasCaptures = moves[0].captured.length > 0;

    if (!hasCaptures) {
        const standPat = evaluate(state, evalMode);
        if (standPat >= beta) return standPat;
        if (standPat > alpha) alpha = standPat;
        return alpha;
    }

    let bestScore = -Infinity;
    for (const m of moves) {
        if (searchAborted) return alpha;
        state.save(undoBuffers[ply]);
        state.applyMove(m);
        const score = -qsearch(state, -beta, -alpha, ply+1, depth-1);
        state.restore(undoBuffers[ply]);
        if (score > bestScore) bestScore = score;
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
    }
    return bestScore;
}

// [SRCH-V16-LMP] Late Move Pruning: máx de movimentos silenciosos por depth
const LMP_TABLE = [0, 5, 9, 15, 22, 30];

function search(state, depth, alpha, beta, ply, prevFrom, prevTo) {
    nodes++;
    if ((nodes & 4095) === 0 && searchTimeLimitMs > 0) {
        if (Date.now() - searchStartTime > searchTimeLimitMs) { searchAborted = true; return alpha; }
    }
    if (ply >= MAX_PLY) return evaluate(state, evalMode);
    if (state.checkDraw()) return 0;

    const isPV = beta > alpha + 1;

    if (depth <= 0) return qsearch(state, alpha, beta, ply, 0);

    const hash = state.hash;
    let hfm = -1, htm = -1;
    const tte = ttProbe(hash);
    if (tte) {
        hfm = tte.fm; htm = tte.tm;
        if (tte.d >= depth) {
            if      (tte.f===TT_EXACT)               return tte.s;
            else if (tte.f===TT_LOWER&&tte.s>=beta)  return tte.s;
            else if (tte.f===TT_UPPER&&tte.s<=alpha) return tte.s;
        }
    }

    // [SRCH-V16-IID] IID melhorado: só quando sem TT move
    if (hfm < 0 && depth >= 3 && !inNullMove) {
        search(state, depth - 3, alpha, beta, ply, prevFrom, prevTo);
        const tte2 = ttProbe(hash);
        if (tte2) { hfm = tte2.fm; htm = tte2.tm; }
    }

    const moves = state.getMoves();
    if (moves.length === 0) return -9999 + ply;

    const hasCaptures = moves[0].captured.length > 0;
    let staticEval = null;

    // [SRCH-V22-EXT] Forced-move extension
    let extension = 0;
    if (moves.length === 1 && !hasCaptures && !inNullMove && ply < 16) {
        extension = 1;
    }

    // [SRCH-V16-FP] Futility Pruning por profundidade
    if (!isPV && depth <= 3 && ply >= 1 && !inNullMove && !hasCaptures &&
            alpha > -8000 && beta < 8000) {
        staticEval = evaluate(state, evalMode);
        const margin = depth === 1 ? 120 : depth === 2 ? 220 : 340;
        if (staticEval + margin <= alpha) return staticEval;
    }

    // [SRCH-V17-NMP] Null Move Pruning com R adaptativo e guard de finais
    if (!inNullMove && !isPV && depth >= 4 && !hasCaptures &&
            beta < 9000 && beta > -9000) {
        const wK = state.wK, bK = state.bK, wP = state.wP, bP = state.bP;
        const pc = wK + bK + wP + bP;
        const sideKings = state.turn===1 ? wK : bK;
        const isPureKingEG = (wP===0 && bP===0 && pc<=6);
        if (!isPureKingEG && (pc >= 10 || sideKings > 0)) {
            if (staticEval===null) staticEval = evaluate(state, evalMode);
            if (staticEval >= beta) {
                state.save(undoBuffers[ply]);
                state.flipTurn(); state.halfMoveClock++;
                const h2 = state.hash;
                if (!state.hashHist.includes(h2)) {
                    state.hashHist.push(h2);
                    if (state.hashHist.length > 256) state.hashHist.shift();
                    const R_NMP = depth >= 7 ? 4 : depth >= 5 ? 3 : 2;
                    inNullMove = true;
                    const nullScore = -search(state, depth-1-R_NMP, -beta, -beta+1, ply+1, -1, -1);
                    inNullMove = false;
                    state.restore(undoBuffers[ply]);
                    if (!searchAborted && nullScore >= beta) return nullScore;
                } else {
                    state.restore(undoBuffers[ply]);
                }
            }
        }
    }

    // [SRCH-V27-RZ] Razoring em depth<=2
    if (!isPV && depth <= 2 && !inNullMove && !hasCaptures && alpha > -8000) {
        if (staticEval===null) staticEval = evaluate(state, evalMode);
        const razorMargin = depth === 1 ? 320 : 540;
        if (staticEval + razorMargin < alpha) return qsearch(state, alpha, beta, ply, 0);
    }

    orderMoves(moves, hfm, htm, ply, prevFrom, prevTo);

    const origAlpha = alpha;
    let bestScore = -Infinity, bestFm = -1, bestTm = -1;
    let quietCount = 0;

    for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        const isCapture = m.captured.length > 0;
        const isQuiet   = !isCapture && !m.promo;

        // [SRCH-V16-LMP] Late Move Pruning
        if (!isPV && !inNullMove && isQuiet && depth <= 5 && ply >= 1 &&
                bestScore > -8000 && alpha > -8000) {
            if (quietCount >= LMP_TABLE[Math.min(depth,5)]) break;
        }
        if (isQuiet) quietCount++;

        state.save(undoBuffers[ply]);
        state.applyMove(m);

        let score;
        if (i === 0) {
            score = -search(state, depth-1+extension, -beta, -alpha, ply+1, m.from, m.to);
        } else {
            // [SRCH-V16-LMR] LMR adaptativo
            let lmrR = 0;
            if (isQuiet && depth >= 3 && i >= 2 && ply >= 1) {
                lmrR = Math.max(1, Math.floor(Math.log(depth) * Math.log(i+1) / 2.0));
                if (depth >= 5 && i >= 5) lmrR = Math.min(lmrR+1, depth-2);
                if (depth >= 8 && i >= 10) lmrR = Math.min(lmrR+1, depth-2);
            }
            score = -search(state, depth-1-lmrR, -alpha-1, -alpha, ply+1, m.from, m.to);
            if (!searchAborted && score > alpha && (lmrR > 0 || isPV)) {
                score = -search(state, depth-1, -beta, -alpha, ply+1, m.from, m.to);
            }
        }
        state.restore(undoBuffers[ply]);
        if (searchAborted) return alpha;

        if (score > bestScore) { bestScore=score; bestFm=m.from; bestTm=m.to; }
        if (score > alpha) alpha = score;
        if (alpha >= beta) {
            if (isQuiet) {
                storeKiller(ply, m);
                storeCounter(prevFrom, prevTo, m);
                const hk = m.from*64+m.to;
                histTable[hk] = Math.min(histTable[hk]+depth*depth, 200000);
                for (let j=0; j<i; j++) {
                    const mj=moves[j];
                    if (!mj.captured.length && !mj.promo) {
                        histTable[mj.from*64+mj.to] = Math.max(histTable[mj.from*64+mj.to]-depth*depth, -200000);
                    }
                }
            }
            break;
        }
    }

    if (!searchAborted && bestFm !== -1) {
        const flag = bestScore<=origAlpha ? TT_UPPER : bestScore>=beta ? TT_LOWER : TT_EXACT;
        ttStore(hash, depth, flag, bestScore, bestFm, bestTm);
    }
    return bestScore;
}

// ── Aprofundamento iterativo + janelas de aspiração ───────────────────────
export function getBestMove(state, maxDepth, timeLimitMs) {
    const moves = state.getMoves();
    if (moves.length === 0) return { move:null, score:-10000, depth:0, nodes:0, pv:[], isBook:false };

    const bookMove = probeBook(state);
    if (bookMove) {
        return { move: bookMove, score: 0, depth: 0, nodes: 0, pv: [bookMove], isBook: true };
    }

    if (moves.length === 1) return { move:moves[0], score:evaluate(state, evalMode), depth:1, nodes:1, pv:[moves[0]], isBook:false };

    for (const k of killers) { k[0]=null; k[1]=null; }
    histTable.fill(0);
    counterTable.fill(null);
    ttGen++;
    nodes=0; searchAborted=false;
    searchStartTime=Date.now(); searchTimeLimitMs=timeLimitMs||0;

    let bestMove = moves[0], bestScore=-Infinity, reachedDepth=0;

    for (let depth=1; depth<=maxDepth; depth++) {
        if (depth > 2) {
            for (let hi = 0; hi < histTable.length; hi++) histTable[hi] = (histTable[hi] * 3) >> 2;
        }

        let score;
        if (depth >= 5 && bestScore > -9000 && bestScore < 9000) {
            let delta = 8, ok = false;
            while (!ok && !searchAborted) {
                score = search(state, depth, bestScore-delta, bestScore+delta, 0, -1, -1);
                if (searchAborted) break;
                if (score > bestScore-delta && score < bestScore+delta) { ok = true; }
                else { delta = Math.round(delta * 1.6); if (delta >= 9000) { score = search(state, depth, -Infinity, Infinity, 0, -1, -1); ok = true; } }
            }
        } else {
            score = search(state, depth, -Infinity, Infinity, 0, -1, -1);
        }
        if (searchAborted) break;

        const tte = ttProbe(state.hash);
        if (tte && tte.fm >= 0) {
            const f = moves.find(m => m.from===tte.fm && m.to===tte.tm);
            if (f) { bestMove=f; bestScore=score; }
            else if (score > bestScore) bestScore=score;
        } else if (score > bestScore) { bestScore=score; }
        reachedDepth=depth;
    }

    // [SRCH-V27-VAR] Root-level variety adaptativa por fase
    {
        let _totalPc = 0;
        for (let _i = 0; _i < 64; _i++) if (state.board[_i] !== EMPTY) _totalPc++;
        let VARIETY_CP, VARIETY_TEMP;
        if (_totalPc > 18)       { VARIETY_CP = 15; VARIETY_TEMP = 9; }
        else if (_totalPc > 8)   { VARIETY_CP =  8; VARIETY_TEMP = 6; }
        else                     { VARIETY_CP =  3; VARIETY_TEMP = 3; }
        searchAborted = false;
        if (reachedDepth >= 2 && bestScore > -9000 && bestScore < 9000 && moves.length > 1) {
            const rootScores = [];
            for (const m of moves) {
                state.save(undoBuffers[0]);
                state.applyMove(m);
                const sc = -search(state, 1, -Infinity, Infinity, 1, m.from, m.to);
                state.restore(undoBuffers[0]);
                rootScores.push({ move: m, score: sc });
            }
            const maxQuick = rootScores.reduce((mx, e) => Math.max(mx, e.score), -Infinity);
            const pool = rootScores.filter(e => e.score >= maxQuick - VARIETY_CP);
            if (pool.length > 1) {
                const weights = pool.map(e => Math.exp((e.score - maxQuick) / VARIETY_TEMP));
                const total = weights.reduce((s, w) => s + w, 0);
                let rnd = Math.random() * total;
                for (let i = 0; i < pool.length; i++) {
                    rnd -= weights[i];
                    if (rnd <= 0) { bestMove = pool[i].move; break; }
                }
                if (!bestMove) bestMove = pool[pool.length - 1].move;
            }
        }
    }

    // Extrair PV da TT
    const pv=[];
    for (let d=0; d<Math.min(reachedDepth,6); d++) {
        const te = ttProbe(state.hash); if(!te||te.fm<0) break;
        const ms = state.getMoves().find(m=>m.from===te.fm&&m.to===te.tm); if(!ms) break;
        pv.push(ms);
        state.save(undoBuffers[d]);
        state.applyMove(ms);
    }
    // Restore state after PV extraction
    for (let d=Math.min(reachedDepth,6)-1; d>=0; d--) {
        state.restore(undoBuffers[d]);
    }

    return { move:bestMove, score:bestScore, depth:reachedDepth, nodes, pv, isBook:false };
}
