import { EMPTY, W_MAN, B_MAN, W_KING, B_KING } from './constants.js';

// ── PST tables ────────────────────────────────────────────────────────────────

// [EVAL-V20-2] King PST — centro reforçado, diagonais longas premium
// [EVAL-V27-KCTR] KING_CTR: centro grande e médio mais valorizados.
// Damas centrais têm raio de ação máximo — bonus forte em c3-f6.
// [EVAL-V28-KCTR] KING_CTR reforçado: c3-f6 centro grande premiado (+2cp), bordas penalizadas
const KING_CTR = [
    5,0,3,0,3,0,3,0,
    0,9,0,9,0,8,0,5,
    4,0,14,0,12,0,11,0,
    0,9,0,18,0,16,0,9,
    4,0,16,0,18,0,12,0,
    0,9,0,12,0,14,0,4,
    4,0,8,0,9,0,9,0,
    0,3,0,3,0,3,0,5
];

// [EVAL-V20-1] Man PST — centro mais forte, bordas penalizadas
// [EVAL-V27-PST] MAN_ADV_W: centro e avanço mais valorizados.
// Pedras no centro-avançado (linhas 4-5) ganham bônus de iniciativa.
// [EVAL-V28-PST] MAN_ADV_W: avanço e centro reforçados, base e topo zerados
const MAN_ADV_W = [
    0,0,0,0,0,0,0,0,
    0,3,0,5,0,5,0,3,
    4,0,8,0,10,0,8,0,
    0,10,0,15,0,15,0,10,
    11,0,17,0,17,0,15,0,
    0,18,0,22,0,22,0,18,
    19,0,23,0,23,0,22,0,
    0,0,0,0,0,0,0,0
];
const MAN_ADV_B = new Array(64);
for (let i = 0; i < 64; i++) MAN_ADV_B[i] = MAN_ADV_W[(7 - (i >> 3)) * 8 + (i & 7)];

const CENTER_PRIMARY   = [27, 36, 34, 29];
// [EVAL-V25-FIX] Bug: v24 usava [28,35,26,37] que são CASAS CLARAS (nunca ocupadas).
// Corrigido para casas escuras adjacentes ao centro primário: c3,e3,b4,g5,d6,f6.
const CENTER_SECONDARY = [18, 20, 25, 38, 43, 45];

// [EVAL-V16-D] Diagonais longas (squares escuros a1-h8 e a8-h1)
const LONG_DIAG_A1H8 = new Set([0,9,18,27,36,45,54,63]);
const LONG_DIAG_A8H1 = new Set([7,14,21,28,35,42,49,56]);

// ── Evaluation ────────────────────────────────────────────────────────────────

// v15.0.0 — adapted from monolith State.eval() method
export function evaluate(state, mode = 0) {
    let wP=0, bP=0;
    let wMob=0, bMob=0;
    let wBack=0, bBack=0, wEdge=0, bEdge=0;
    let wKMob=0, bKMob=0, wKCtr=0, bKCtr=0;
    let wLft=0, wRgt=0, bLft=0, bRgt=0;
    let wProt=0, bProt=0;
    let wBlocked=0, bBlocked=0;
    let wAdv=0, bAdv=0;
    let wMaxRank=0, bMaxRank=0;
    let wRush=0, bRush=0;
    // [EVAL-V16-D] Controle das diagonais longas
    let wLongDiag=0, bLongDiag=0;
    // [EVAL-V16-CH] Cadeias de pedras (pedra com amiga diagonal atrás)
    let wChain=0, bChain=0;
    // [EVAL-V16-KS] Dama em diagonal longa (bônus extra de posicionamento)
    let wKingOnLong=0, bKingOnLong=0;
    // [EVAL-V22-BREAK] Breakthrough potential
    let wBreak1=0, bBreak1=0;
    let wBreak2=0, bBreak2=0;
    const wKingPositions=[], bKingPositions=[];

    let score = 0; // [FIX-V31-TDZ] declared before board scan to avoid TDZ
    for (let i = 0; i < 64; i++) {
        const p = state.board[i]; if (p === EMPTY) continue;
        const r = i >> 3, c = i & 7, sign = Math.sign(p);
        const isKing = (p===W_KING || p===B_KING);

        if (!isKing) {
            if (sign===1) wP++; else bP++;
            const rank = sign===1 ? r : 7-r;

            if (sign===1) { wAdv += MAN_ADV_W[i]; }
            else          { bAdv += MAN_ADV_B[i]; }

            if (rank > (sign===1 ? wMaxRank : bMaxRank))
                { if(sign===1) wMaxRank=rank; else bMaxRank=rank; }
            if (rank === 6) { if(sign===1) wRush++; else bRush++; }
            if (rank===0) { if(sign===1) wBack++; else bBack++; }
            if (c===0||c===7) { if(sign===1) wEdge++; else bEdge++; }
            if (sign===1) { if(c<4) wLft++; else wRgt++; }
            else          { if(c<4) bLft++; else bRgt++; }

            // [EVAL-V16-D] Pedras nas diagonais longas
            if (LONG_DIAG_A1H8.has(i) || LONG_DIAG_A8H1.has(i)) {
                if(sign===1) wLongDiag++; else bLongDiag++;
            }

            // Mobilidade para frente
            const fDirs = sign===1 ? [[1,1],[1,-1]] : [[-1,1],[-1,-1]];
            let freeF = 0;
            for (const [dr,dc] of fDirs) {
                const nr=r+dr, nc=c+dc;
                if (nr>=0&&nr<8&&nc>=0&&nc<8&&state.board[nr*8+nc]===EMPTY) {
                    if(sign===1) wMob++; else bMob++;
                    freeF++;
                }
            }
            if (freeF === 0) {
                if(sign===1) wBlocked++; else bBlocked++;
                // [EVAL-V29-TRAP] Pedra presa na borda com zero mobilidade frontal
                if (c===0||c===7) { if(sign===1) score-=6; else score+=6; }
            }

            // [EVAL-V22-BREAK] Breakthrough: man near crown with clear forward diagonal
            if (rank >= 5) {
                let fwdFree = 0;
                for (const [dr2,dc2] of fDirs) {
                    const nr2=r+dr2, nc2=c+dc2;
                    if (nr2>=0&&nr2<8&&nc2>=0&&nc2<8&&state.board[nr2*8+nc2]===EMPTY) fwdFree++;
                }
                if (fwdFree > 0) {
                    if (rank === 6) { if(sign===1) wBreak1++; else bBreak1++; }
                    else            { if(sign===1) wBreak2++; else bBreak2++; }
                }
            }

            // Proteção por pedra amiga atrás
            const bRow = sign===1 ? r-1 : r+1;
            if (bRow>=0&&bRow<8) {
                if (c>0 && state.board[bRow*8+(c-1)]===p) { if(sign===1) wProt++; else bProt++; }
                else if (c<7 && state.board[bRow*8+(c+1)]===p) { if(sign===1) wProt++; else bProt++; }
            }

            // [EVAL-V16-CH] Cadeias: pedra tem amiga diagonal (qualquer direção)
            for (const [dr,dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
                const nr=r+dr, nc=c+dc;
                if (nr>=0&&nr<8&&nc>=0&&nc<8&&state.board[nr*8+nc]===p) {
                    if(sign===1) wChain++; else bChain++;
                    break; // conta uma vez por pedra
                }
            }

        } else {
            if (sign===1) { wKingPositions.push(i); }
            else          { bKingPositions.push(i); }

            if(sign===1) wKCtr+=KING_CTR[i]; else bKCtr+=KING_CTR[i];

            // [EVAL-V16-KS] Dama nas diagonais longas
            if (LONG_DIAG_A1H8.has(i) || LONG_DIAG_A8H1.has(i)) {
                if(sign===1) wKingOnLong++; else bKingOnLong++;
            }

            // Mobilidade da dama
            for (const [dr,dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
                for (let s=1;s<8;s++) {
                    const nr=r+dr*s, nc=c+dc*s;
                    if(nr<0||nr>7||nc<0||nc>7) break;
                    if(state.board[nr*8+nc]!==EMPTY) break;
                    if(sign===1) wKMob++; else bKMob++;
                }
            }
        }
    }

    const wK=wKingPositions.length, bK=bKingPositions.length;
    const totalPieces = wK+wP+bK+bP;
    // [EVAL-V16-1] Valor de dama escala com fase do jogo
    const phase = Math.min(totalPieces, 24);
    const kingVal = 285 + Math.round((24 - phase) * 6);
    const isEG    = totalPieces <= 8 || state.isEndgame;
    const mgFactor = phase / 24; // 1.0 = abertura, 0.0 = final

    // ── Material ─────────────────────────────────────────────────────────────
    score = (wP-bP)*100 + (wK-bK)*kingVal; // [FIX-V31-TDZ] reassign (declared above)
    const wTot = wP+wK, bTot = bP+bK;
    if (wTot !== bTot) score += (wTot-bTot)*22;

    // ── Posicional ───────────────────────────────────────────────────────────
    score += (wAdv-bAdv);
    score += (wMaxRank-bMaxRank)*4;
    score += (wMob-bMob)*3;
    score -= (wEdge-bEdge)*7;
    score -= (Math.abs(wLft-wRgt)-Math.abs(bLft-bRgt))*3;
    score += (wProt-bProt)*5;
    score -= (wBlocked-bBlocked)*7;
    if (!isEG) score += (wBack-bBack)*5;

    // [EVAL-V16-CH] Bônus de cadeia (estrutura defensiva sólida)
    score += Math.round((wChain-bChain) * 3 * mgFactor);

    // Corrida para promoção
    score += (wRush-bRush)*13;

    // [EVAL-V22-BREAK] Breakthrough bonus
    // [EVAL-V28-BREAK] Breakthrough reforçado: +38cp/+18cp
    score += (wBreak1-bBreak1)*38 + (wBreak2-bBreak2)*18;

    // Squares centrais primários e secundários
    let wCentPri=0, bCentPri=0;
    for (const sq of CENTER_PRIMARY) {
        const pp=state.board[sq];
        if (pp>0) wCentPri++; else if (pp<0) bCentPri++;
    }
    score += (wCentPri-bCentPri)*11;
    let wCentSec=0, bCentSec=0;
    for (const sq of CENTER_SECONDARY) {
        const pp=state.board[sq];
        if (pp>0) wCentSec++; else if (pp<0) bCentSec++;
    }
    score += (wCentSec-bCentSec)*5;

    // [EVAL-V16-D] Controle das diagonais longas (pedras)
    score += (wLongDiag-bLongDiag)*6;

    // ── Atividade de damas ───────────────────────────────────────────────────
    score += Math.round((wKMob-bKMob)*3);
    // [EVAL-V16-KS] Dama nas diagonais longas
    score += (wKingOnLong-bKingOnLong)*8;

    // ── Endgame específico ────────────────────────────────────────────────────
    if (isEG) {
        score += (wKCtr-bKCtr)*6;

        if (wP>0 && wK>=bK) score += wAdv*2;
        if (bP>0 && bK>=wK) score -= bAdv*2;
        if (wTot>bTot) score += totalPieces<6 ? 100 : 52;
        else if (bTot>wTot) score -= totalPieces<6 ? 100 : 52;

        // Dois reis atacantes em sinergia
        if (wK>=2 && bK===1 && wP===0 && bP===0 && bKingPositions.length>0) {
            const br=bKingPositions[0]>>3, bc=bKingPositions[0]&7;
            let synergy=0;
            for (let a=0;a<wKingPositions.length;a++)
              for (let b2=a+1;b2<wKingPositions.length;b2++) {
                const wr1=wKingPositions[a]>>3, wc1=wKingPositions[a]&7;
                const wr2=wKingPositions[b2]>>3, wc2=wKingPositions[b2]&7;
                const d1=Math.max(Math.abs(br-wr1),Math.abs(bc-wc1));
                const d2=Math.max(Math.abs(br-wr2),Math.abs(bc-wc2));
                if (d1<=3 && d2<=3) synergy+=12;
            }
            score += synergy;
        }
        if (bK>=2 && wK===1 && bP===0 && wP===0 && wKingPositions.length>0) {
            const wr=wKingPositions[0]>>3, wc2=wKingPositions[0]&7;
            let synergy=0;
            for (let a=0;a<bKingPositions.length;a++)
              for (let b2=a+1;b2<bKingPositions.length;b2++) {
                const br1=bKingPositions[a]>>3, bc1=bKingPositions[a]&7;
                const br2=bKingPositions[b2]>>3, bc2=bKingPositions[b2]&7;
                const d1=Math.max(Math.abs(wr-br1),Math.abs(wc2-bc1));
                const d2=Math.max(Math.abs(wr-br2),Math.abs(wc2-bc2));
                if (d1<=3 && d2<=3) synergy+=12;
            }
            score -= synergy;
        }

        // Perseguição: aproximação ao rei solitário
        if (wK===1 && bK>=2 && wKingPositions.length>0 && bKingPositions.length>0) {
            const wr=wKingPositions[0]>>3, wc=wKingPositions[0]&7;
            let minDist=14;
            for (const bk of bKingPositions) {
                const br=bk>>3, bc=bk&7;
                minDist=Math.min(minDist,Math.max(Math.abs(wr-br),Math.abs(wc-bc)));
            }
            score -= (7-minDist)*12;
        } else if (bK===1 && wK>=2 && bKingPositions.length>0 && wKingPositions.length>0) {
            const br=bKingPositions[0]>>3, bc=bKingPositions[0]&7;
            let minDist=14;
            for (const wk of wKingPositions) {
                const wr=wk>>3, wc=wk&7;
                minDist=Math.min(minDist,Math.max(Math.abs(br-wr),Math.abs(bc-wc)));
            }
            score += (7-minDist)*12;
        }

        // [EVAL-V22-EGKING] Corner-confinement: push lone king to corner/edge
        if (wK>=2 && bK===1 && wP===0 && bP===0 && bKingPositions.length>0) {
            const kr=bKingPositions[0]>>3, kc=bKingPositions[0]&7;
            const distCenter = Math.max(Math.abs(kr-3.5), Math.abs(kc-3.5));
            score += Math.round(distCenter*42);
            if (kr===0||kr===7||kc===0||kc===7) score += 25;
            if ((kr===0||kr===7)&&(kc===0||kc===7)) score += 40;
        }
        if (bK>=2 && wK===1 && wP===0 && bP===0 && wKingPositions.length>0) {
            const kr=wKingPositions[0]>>3, kc=wKingPositions[0]&7;
            const distCenter = Math.max(Math.abs(kr-3.5), Math.abs(kc-3.5));
            score -= Math.round(distCenter*42);
            if (kr===0||kr===7||kc===0||kc===7) score -= 25;
            if ((kr===0||kr===7)&&(kc===0||kc===7)) score -= 40;
        }

        // [EVAL-V22-EGKING] Confinement 3×1 king endgame
        if (wK===3 && bK===1 && wP===0 && bP===0 && bKingPositions.length>0) {
            const kr=bKingPositions[0]>>3, kc=bKingPositions[0]&7;
            const distCenter = Math.max(Math.abs(kr-3.5), Math.abs(kc-3.5));
            score += Math.round(distCenter*28);
        }
        if (bK===3 && wK===1 && wP===0 && bP===0 && wKingPositions.length>0) {
            const kr=wKingPositions[0]>>3, kc=wKingPositions[0]&7;
            const distCenter = Math.max(Math.abs(kr-3.5), Math.abs(kc-3.5));
            score -= Math.round(distCenter*28);
        }

        // 2D vs 1P
        if (wK===2 && bP===1 && wP===0 && bK===0) score += 140;
        if (bK===2 && wP===1 && bP===0 && wK===0) score -= 140;

        // Oposição de damas (Chebyshev)
        if (wK>=1 && bK>=1 && wP===0 && bP===0) {
            for (const wk of wKingPositions) {
                for (const bk of bKingPositions) {
                    const wr=wk>>3,wc=wk&7,br=bk>>3,bc=bk&7;
                    const rd=wr-br, cd=wc-bc;
                    if (Math.abs(rd)===2&&Math.abs(cd)===2) score+=state.turn===1?-12:12;
                    if (Math.abs(rd)===1&&Math.abs(cd)===1) score+=state.turn===1?-6:6;
                }
            }
        }

        // [EVAL-V16-KM] Mobilidade de dama mais valiosa no final
        score += Math.round((wKMob-bKMob)*2);
    }

    // [EVAL-V21-PHASE] Phase-based bonuses computed from LOCAL position only.
    const localPhase = totalPieces >= 18 ? 'opening'
                     : totalPieces >= 8  ? 'middlegame'
                     :                     'endgame';
    if (localPhase === 'opening') {
        score += Math.round((wProt - bProt) * 2);
        score += Math.round((wChain - bChain) * 2 * mgFactor);
        score += Math.min(wBack, 2) * 4;
        score -= Math.min(bBack, 2) * 4;
    } else if (localPhase === 'middlegame') {
        score += Math.round((wMob - bMob) * 2);
        if (wTot !== bTot) score += (wTot - bTot) * 6;
        score += Math.min(wBack, 1) * 3;
        score -= Math.min(bBack, 1) * 3;
    } else {
        score += Math.round((wKMob - bKMob) * 3);
        score += (wKingOnLong - bKingOnLong) * 5;
    }

    // [EVAL-V28-FORK] Detecção de garfo: pedra que ataca duas peças inimigas
    {
        for (let i = 0; i < 64; i++) {
            const p = state.board[i]; if (p === EMPTY) continue;
            const r = i>>3, c = i&7, sign = Math.sign(p);
            const isKing2 = (p===W_KING||p===B_KING);
            if (!isKing2) {
                const fDirs2 = sign===1 ? [[1,1],[1,-1]] : [[-1,1],[-1,-1]];
                let threats = 0;
                for (const [dr,dc] of fDirs2) {
                    const nr=r+dr, nc=c+dc;
                    if (nr>=0&&nr<8&&nc>=0&&nc<8) {
                        const tp=state.board[nr*8+nc];
                        if (tp!==EMPTY && Math.sign(tp)!==sign) threats++;
                    }
                }
                if (threats >= 2) { if(sign===1) score+=12; else score-=12; }
            }
        }
    }

    // [EVAL-V28-CONN] Pedras conectadas na mesma linha
    {
        let wConn=0, bConn=0;
        for (let i = 0; i < 64; i++) {
            const p = state.board[i]; if (p===EMPTY) continue;
            const sign = Math.sign(p);
            const r = i>>3, c = i&7;
            if ((p===W_MAN||p===B_MAN)) {
                if (c<7 && state.board[i+1]===p) { if(sign===1) wConn++; else bConn++; }
            }
        }
        score += (wConn-bConn)*3;
    }

    // [EVAL-V24-TEMPO] +4 cp bias for human games (0 for AvA)
    const bias = (mode === 3) ? 0 : 4;
    return score * state.turn + bias;
}
