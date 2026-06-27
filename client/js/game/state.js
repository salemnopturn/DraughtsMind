import { EMPTY, W_MAN, B_MAN, W_KING, B_KING, getPieceIdx, moveSorter } from './constants.js';

const zobristTable = new Uint32Array(256);
let zobristTurn = 0;
(function initZobrist() {
    let seed = 987654321;
    function xs() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; }
    for (let i = 0; i < 256; i++) zobristTable[i] = xs();
    zobristTurn = xs();
})();

export class State {
    constructor() {
        this.board = new Int8Array(64);
        this.turn  = 1;
        this.hashHist      = [];
        this.halfMoveClock = 0;
        this.endgameClock  = 0;
        this.isEndgame     = false;
        this.endgameLimit  = 10;
        this.timeW = 0; this.timeB = 0;
        this.init();
    }
    init() {
        this.board.fill(EMPTY);
        for (let i = 0; i < 64; i++) {
            const r = i >> 3, c = i & 7;
            if ((r + c) % 2 === 0) {
                if (r < 3)      this.board[i] = W_MAN;
                else if (r > 4) this.board[i] = B_MAN;
            }
        }
        this.turn = 1; this.hashHist = [this.hash()];
        this.halfMoveClock = 0; this.endgameClock = 0; this.isEndgame = false; this.endgameLimit = 10;
    }

    clone() {
        const s = Object.create(State.prototype);
        s.board         = this.board.slice();
        s.turn          = this.turn;
        s.hashHist      = this.hashHist.slice();
        s.halfMoveClock = this.halfMoveClock;
        s.endgameClock  = this.endgameClock;
        s.isEndgame     = this.isEndgame;
        s.endgameLimit  = this.endgameLimit;
        s.timeW         = this.timeW;
        s.timeB         = this.timeB;
        return s;
    }

    hash() {
        let h = 0;
        for (let i = 0; i < 64; i++)
            if (this.board[i] !== EMPTY) h ^= zobristTable[i * 4 + getPieceIdx(this.board[i])];
        if (this.turn === -1) h ^= zobristTurn;
        return h;
    }
    isValid(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

    getMoves() {
        const captures = [], simples = [];
        for (let i = 0; i < 64; i++) {
            const p = this.board[i];
            if (p === EMPTY || Math.sign(p) !== this.turn) continue;
            const isKing = (p === W_KING || p === B_KING);
            const caps = this.getCaptures(i, i >> 3, i & 7, isKing, [], i, []);
            if (caps.length > 0) captures.push(...caps);
            else if (captures.length === 0) simples.push(...this.getSimples(i, i >> 3, i & 7, isKing));
        }
        if (captures.length > 0) {
            let maxC = 0;
            for (let i = 0; i < captures.length; i++)
                if (captures[i].captured.length > maxC) maxC = captures[i].captured.length;
            const filtered = [];
            for (let i = 0; i < captures.length; i++)
                if (captures[i].captured.length === maxC) filtered.push(captures[i]);
            return filtered.sort(moveSorter);
        }
        return simples.sort(moveSorter);
    }

    getSimples(idx, r, c, isKing) {
        const moves = [];
        const dirs  = isKing ? [[1,1],[1,-1],[-1,1],[-1,-1]]
                             : this.turn === 1 ? [[1,1],[1,-1]] : [[-1,1],[-1,-1]];
        for (const d of dirs) {
            for (let step = 1; step <= (isKing ? 7 : 1); step++) {
                const nr = r + d[0] * step, nc = c + d[1] * step;
                if (!this.isValid(nr, nc)) break;
                const nIdx = nr * 8 + nc;
                if (this.board[nIdx] !== EMPTY) break;
                const isPromo = !isKing && ((this.turn === 1 && nr === 7) || (this.turn === -1 && nr === 0));
                moves.push({ from: idx, to: nIdx, path: [nIdx], captured: [], promo: isPromo, isPawn: !isKing, capKings: 0 });
            }
        }
        return moves;
    }

    getCaptures(idx, r, c, isKing, curCap, origFrom, curPath) {
        const moves = [], dirs = [[1,1],[1,-1],[-1,1],[-1,-1]];
        for (const d of dirs) {
            let enemyIdx = -1, step = 1;
            while (true) {
                const nr = r + d[0] * step, nc = c + d[1] * step;
                if (!this.isValid(nr, nc)) break;
                const chk = nr * 8 + nc, p = this.board[chk];
                if (p !== EMPTY) {
                    if (Math.sign(p) === this.turn || curCap.includes(chk)) break;
                    if (enemyIdx === -1) { enemyIdx = chk; if (!isKing && step > 1) break; }
                    else break;
                } else if (enemyIdx !== -1) {
                    // CBD Art.13 / Regra 7: A pedra que durante o lance de captura de
                    // várias peças apenas passe pela casa de coroação SEM AÍ PARAR
                    // NÃO será promovida a dama. A promoção só ocorre quando a pedra
                    // TERMINA a sequência na casa de coroação.
                    const nCap = curCap.concat(enemyIdx), nPath = curPath.concat(chk);
                    const origP = this.board[idx];
                    // During the sequence, the piece always remains what it was (man stays man).
                    this.board[idx] = EMPTY; this.board[chk] = origP;
                    const nextCaps = this.getCaptures(chk, nr, nc, isKing, nCap, origFrom, nPath);
                    this.board[idx] = origP; this.board[chk] = EMPTY;
                    if (nextCaps.length > 0) {
                        moves.push(...nextCaps);
                    } else {
                        // Sequence ends here: promote ONLY if the final landing square
                        // is the crown row (the piece "stops" there).
                        const atCrown = !isKing && ((this.turn === 1 && nr === 7) || (this.turn === -1 && nr === 0));
                        let capKings = 0;
                        for (const cIdx of nCap) if (Math.abs(this.board[cIdx]) === 2) capKings++;
                        moves.push({ from: origFrom, to: chk, path: nPath, captured: nCap, promo: atCrown, isPawn: !isKing, capKings });
                    }
                    if (!isKing) break;
                }
                step++;
                if (!isKing && enemyIdx === -1 && step > 1) break;
            }
        }
        return moves;
    }

    applyMove(m) {
        let p = this.board[m.from]; this.board[m.from] = EMPTY;
        for (const cap of m.captured) this.board[cap] = EMPTY;
        if (m.promo) p = Math.sign(p) * 2;
        this.board[m.to] = p;

        if (m.captured.length > 0 || m.isPawn) this.halfMoveClock = 0;
        else this.halfMoveClock++;

        let wK = 0, wP = 0, bK = 0, bP = 0;
        for (let i = 0; i < 64; i++) {
            const sq = this.board[i];
            if (sq === W_KING) wK++; else if (sq === W_MAN) wP++;
            else if (sq === B_KING) bK++; else if (sq === B_MAN) bP++;
        }

        // Returns 0 (not endgame), 4 (1D×1D: 2-move rule), or 10 (other: 5-move rule)
        const endgameLimit = (() => {
            if (wP === 0 && bP === 0) {
                // Art.59.D: 1D×1D — empate em 2 lances (4 meios-lances)
                if (wK === 1 && bK === 1) return 4;
                if (wK <= 2 && bK <= 2 && wK >= 1 && bK >= 1) return 10;
                if ((wK === 3 && bK === 1) || (bK === 3 && wK === 1)) {
                    const loneColor = wK === 1 ? W_KING : B_KING;
                    for (let i = 0; i < 64; i++)
                        if (this.board[i] === loneColor && (i >> 3) === (i & 7)) return 10;
                    return 0;
                }
            }
            // Art.100 (64 casas): 2D+1P vs 1D (dama solitária na grande diagonal a1-h8)
            if (wP === 1 && wK === 2 && bK === 1 && bP === 0) {
                for (let i = 0; i < 64; i++)
                    if (this.board[i] === B_KING && (i >> 3) === (i & 7)) return 10;
                return 0;
            }
            if (bP === 1 && bK === 2 && wK === 1 && wP === 0) {
                for (let i = 0; i < 64; i++)
                    if (this.board[i] === W_KING && (i >> 3) === (i & 7)) return 10;
                return 0;
            }
            // Art.100 (64 casas): 1D+2P vs 1D (dama solitária na grande diagonal a1-h8)
            if (wP === 0 && bP === 2 && wK === 1 && bK === 1) {
                for (let i = 0; i < 64; i++)
                    if (this.board[i] === W_KING && (i >> 3) === (i & 7)) return 10;
                return 0;
            }
            if (bP === 0 && wP === 2 && bK === 1 && wK === 1) {
                for (let i = 0; i < 64; i++)
                    if (this.board[i] === B_KING && (i >> 3) === (i & 7)) return 10;
                return 0;
            }
            if (wP === 0 && bP === 1 && wK >= 1 && bK >= 1 && wK <= 2) return 10;
            if (bP === 0 && wP === 1 && bK >= 1 && wK >= 1 && bK <= 2) return 10;
            // Art.59.E.C: 1D+1P × 1D+1P — empate em 5 lances
            if (wK === 1 && bK === 1 && wP === 1 && bP === 1) return 10;
            // Art.59.F: 1D solitária na grande diagonal + 2P vs 1D — empate em 5 lances
            // (as 2 pedras bloqueadas antes da diagonal da dama solitária)
            if (wK === 1 && bK === 1 && wP === 0 && bP === 2) {
                for (let i = 0; i < 64; i++)
                    if (this.board[i] === W_KING && (i >> 3) === (i & 7)) return 10;
                return 0;
            }
            if (bK === 1 && wK === 1 && bP === 0 && wP === 2) {
                for (let i = 0; i < 64; i++)
                    if (this.board[i] === B_KING && (i >> 3) === (i & 7)) return 10;
                return 0;
            }
            return 0;
        })();

        if (endgameLimit > 0) {
            if (!this.isEndgame) { this.isEndgame = true; this.endgameClock = 0; this.endgameLimit = endgameLimit; }
            else if (m.captured.length > 0) { this.endgameClock = 0; this.endgameLimit = endgameLimit; }
            else this.endgameClock++;
        } else {
            this.isEndgame = false; this.endgameClock = 0; this.endgameLimit = 10;
        }

        this.turn *= -1;

        if (m.captured.length > 0) this.hashHist = [];
        const h = this.hash();
        if (this.hashHist.length >= 256) this.hashHist.shift();
        this.hashHist.push(h);
    }

    checkDraw() {
        if (this.halfMoveClock >= 40)
            return "Empate: 20 lances consecutivos de damas sem captura ou movimento de pedra (CBD).";
        if (this.isEndgame && this.endgameClock >= this.endgameLimit)
            return this.endgameLimit === 4
                ? "Empate: limite de 2 lances em 1 Dama × 1 Dama (CBD Art.59.D)."
                : "Empate: limite de 5 lances no final (CBD Art.59.E/F).";
        if (this.hashHist.length >= 9) {
            const cur = this.hash(); let cnt = 0;
            for (const h of this.hashHist) if (h === cur) cnt++;
            if (cnt >= 3) return "Empate: mesma posição repetida 3 vezes (CBD Art.98).";
        }
        return false;
    }
}
