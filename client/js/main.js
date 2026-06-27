import { MODE_PVP, MODE_PVA, MODE_AVA, move2Str } from './game/constants.js';
import { State } from './game/state.js';
import { loadBook } from './game/book.js';
import { getBestMove } from './game/search.js';
import {
    initDOM, render, setMoveCallback, updateCoords, setFlipped, getFlipped
} from './ui/board.js';
import {
    getState, setState, resetState, clearSelection, selectSquare, applyMove as applyGameMove
} from './game/gameState.js';
import { initControls, getMode, getDepth, isAnalysisOn } from './ui/controls.js';
import { addMove, clearHistory, getHistory, getPDN, renderHistory } from './ui/history.js';
import {
  initClock, resetClocks, startClock, stopClock,
  debitThinkingTime, checkTimeout, getTimeLimit
} from './ui/clock.js';

let gameStarted = false;
let gameEnded = false;
let isComputing = false;
let currentMatchId = null;

// ── Piece count + CPU stats ────────────────────────────────────────────────

function updatePieceCounts() {
    const state = getState();
    let wP = 0, wK = 0, bP = 0, bK = 0;
    for (let i = 0; i < 64; i++) {
        const p = state.board[i];
        if (p === 1) wP++; else if (p === 2) wK++;
        else if (p === -1) bP++; else if (p === -2) bK++;
    }
    document.getElementById('white-count').textContent = `⚪ ${wP + wK}`;
    document.getElementById('black-count').textContent = `⚫ ${bP + bK}`;
}

const cpuStats = { wWins: 0, bWins: 0, draws: 0, games: 0 };

function updateCpuStats(result) {
    cpuStats.games++;
    if (result === 'white') cpuStats.wWins++;
    else if (result === 'black') cpuStats.bWins++;
    else cpuStats.draws++;
    const el = document.getElementById('cpu-stats');
    if (el) {
        el.style.display = 'block';
        el.innerHTML = `<span style="color:#4a9;">⚪${cpuStats.wWins}</span> `
            + `<span style="color:#888;">½${cpuStats.draws}</span> `
            + `<span style="color:#e76;">⚫${cpuStats.bWins}</span> `
            + `<span style="color:#aaa;">(${cpuStats.games} jg)</span>`;
    }
}

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

// ── CPU turn detection ──────────────────────────────────────────────────────

function isCPUTurn() {
    const mode = getMode();
    const state = getState();
    if (mode === MODE_PVP) return false;
    if (mode === MODE_PVA) return state.turn === -1;
    if (mode === MODE_AVA) return true;
    return false;
}

// ── Real-time analysis ───────────────────────────────────────────────────────

function runAna() {
    const t0 = Date.now();
    document.getElementById('analysis-text').textContent = `Avaliando profundidade ${getDepth()}...`;
    setTimeout(() => {
        const res = getBestMove(getState(), getDepth(), 0);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        const sc = res.score;
        const scStr = sc > 9000 ? 'Mate' : sc < -9000 ? '-Mate' : (sc >= 0 ? '+' : '') + (sc / 100).toFixed(2);
        const pvStr = res.pv && res.pv.length > 0 ? res.pv.slice(0, 5).map(move2Str).join(' ') : '-';
        document.getElementById('analysis-text').textContent = `P:${res.depth} Eval:${scStr} T:${elapsed}s PV:${pvStr}`;
        if (res.move) {
            clearSelection();
            selectSquare(res.move.from);
            render();
        }
    }, 10);
}

// ── Game flow ───────────────────────────────────────────────────────────────

function startNewGame() {
    resetState();
    clearHistory();
    stopClock();
    resetClocks(getTimeLimit());
    currentMatchId = null;
    gameStarted = true;
    gameEnded = false;
    isComputing = false;
    document.getElementById('modal').style.display = 'none';
    document.getElementById('resume-modal').style.display = 'none';
    updatePieceCounts();
    render();
    renderHistory();
    loop();
}

function loop() {
    if (!gameStarted || gameEnded || isComputing) return;
    const timeout = checkTimeout(getState().turn);
    if (timeout) {
        const winner = timeout === 'white' ? 'Pretas' : 'Brancas';
        popModal('Fim de Jogo', `${winner} vencem! (Tempo esgotado)`);
        finalizeMatch(timeout);
        stopClock();
        return;
    }
    if (isCPUTurn()) triggerCPU();
    else if (isAnalysisOn() && !isCPUTurn()) runAna();
}

function triggerCPU() {
    if (isComputing || gameEnded) return;
    isComputing = true;
    const txtStatus = document.getElementById('status-text');
    const barStatus = document.getElementById('status-container');
    txtStatus.innerText = 'Calculando...';
    barStatus.classList.add('computing');

    setTimeout(() => {
        const state = getState();
        const thinkStart = Date.now();
        const res = getBestMove(state, getDepth(), 0);
        const elapsed = (Date.now() - thinkStart) / 1000;
        isComputing = false;
        barStatus.classList.remove('computing');
        debitThinkingTime(state.turn, elapsed);

        const sc = res.score;
        const scStr = sc > 9000 ? 'Mate' : sc < -9000 ? '-Mate' : (sc >= 0 ? '+' : '') + (sc / 100).toFixed(2);
        const pvStr = res.pv && res.pv.length > 0
            ? res.pv.slice(0, 3).map(move2Str).join(' ')
            : '-';
        const bookTag = res.isBook ? ' [Livro]' : '';
        const analysisEl = document.getElementById('analysis-text');
        analysisEl.textContent = '';
        const parts = [
            ['P:', res.depth], [' Eval:', scStr], [' N:', res.nodes], [' PV:', pvStr]
        ];
        for (const [label, value] of parts) {
            analysisEl.appendChild(document.createTextNode(label));
            const b = document.createElement('strong');
            b.textContent = String(value);
            analysisEl.appendChild(b);
        }
        if (bookTag) {
            const span = document.createElement('span');
            span.textContent = bookTag;
            analysisEl.appendChild(span);
        }

        if (res.move) executeMove(res.move);
        else render();
    }, 10);
}

function executeMove(m) {
    applyGameMove(m);
    updatePieceCounts();
    addMove(m, move2Str(m));
    render();
    renderHistory();
    saveMatch();
    checkGameEnd();
    if (!gameEnded && gameStarted) {
        if (getTimeLimit() > 0) startClock();
        setTimeout(loop, 50);
    }
}

function checkGameEnd() {
    const state = getState();
    const moves = state.getMoves();
    const draw = state.checkDraw();
    if (moves.length === 0) {
        const winner = state.turn === 1 ? 'Pretas' : 'Brancas';
        popModal('Fim de Jogo', `${winner} vencem! (Sem lances legais)`);
        finalizeMatch(state.turn === 1 ? 'black' : 'white');
        if (getMode() === MODE_AVA) updateCpuStats(state.turn === 1 ? 'black' : 'white');
    } else if (draw) {
        popModal('Fim de Jogo', draw);
        finalizeMatch('draw');
        if (getMode() === MODE_AVA) updateCpuStats('draw');
    } else {
        document.getElementById('status-text').innerText =
            `Vez das ${state.turn === 1 ? 'Brancas' : 'Pretas'}`;
    }
}

function popModal(title, desc) {
    gameEnded = true;
    document.getElementById('status-text').innerText = 'Fim de Jogo';
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').textContent = desc;
    document.getElementById('modal').style.display = 'flex';
}

// ── Match persistence ───────────────────────────────────────────────────────

const MODE_NAMES = ['pvp', 'pva', 'ava'];

async function saveMatch() {
    const state = getState();
    const mode = MODE_NAMES[getMode()];

    if (!currentMatchId) {
        const res = await apiPost('/api/matches', { mode });
        currentMatchId = res.id;
    }

    await apiPut(`/api/matches/${currentMatchId}`, {
        board: Array.from(state.board),
        turn: state.turn,
        history: getHistory(),
        pdn: getPDN(),
        mode
    });
}

async function finalizeMatch(result) {
    if (!currentMatchId) return;
    const mode = MODE_NAMES[getMode()];
    await apiPut(`/api/matches/${currentMatchId}`, {
        result,
        pdn: getPDN(),
        mode
    });
    currentMatchId = null;
}

async function deleteMatch(id) {
    try {
        await fetch(`/api/matches/${id}`, { method: 'DELETE' });
    } catch (_) { /* ignore */ }
}

async function checkForResume() {
    try {
        const res = await apiGet('/api/matches');
        const inProgress = Array.isArray(res) ? res.find(m => !m.result) : null;
        if (inProgress) {
            document.getElementById('resume-modal').style.display = 'flex';
            document.getElementById('resume-yes').onclick = () => {
                document.getElementById('resume-modal').style.display = 'none';
                resumeMatch(inProgress.id);
            };
            document.getElementById('resume-no').onclick = () => {
                document.getElementById('resume-modal').style.display = 'none';
                deleteMatch(inProgress.id);
                startNewGame();
            };
        }
    } catch (_) {
        // Server unavailable — start fresh
    }
}

async function resumeMatch(id) {
    try {
        const res = await apiGet(`/api/matches/${id}`);
        if (!res.state) {
            startNewGame();
            return;
        }

        currentMatchId = id;
        const state = new State();
        const boardData = JSON.parse(res.state.board);
        state.board = new Int8Array(boardData);
        state.turn = res.state.turn;
        state.hash = state.computeHash();
        state.hashHist = [state.hash];

        setState(state);

        clearHistory();
        const histData = JSON.parse(res.state.history || '[]');
        for (const h of histData) addMove(h.move, h.str);

        gameStarted = true;
        gameEnded = false;
        isComputing = false;

        document.getElementById('modal').style.display = 'none';
        render();
        renderHistory();
        loop();
    } catch (_) {
        startNewGame();
    }
}

// ── Load modal ──────────────────────────────────────────────────────────────

const MODE_LABELS = { pvp: 'PvP', pva: 'PvA', ava: 'AvA' };

async function showLoadModal() {
    const modal = document.getElementById('load-modal');
    const list = document.getElementById('load-list');
    list.innerHTML = '';
    try {
        const res = await apiGet('/api/matches');
        const matches = Array.isArray(res) ? res : [];
        if (matches.length === 0) {
            list.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Nenhuma partida salva.</p>';
        } else {
            for (const m of matches) {
                const div = document.createElement('div');
                div.className = 'load-item';
                const left = document.createElement('div');
                const modeLabel = MODE_LABELS[m.mode] || m.mode;
                const resultText = m.result ? ` — ${m.result}` : ' (em andamento)';
                left.innerHTML = `<div class="load-item-mode">${modeLabel}</div><div class="load-item-info">${new Date(m.updated_at || m.created_at).toLocaleString('pt-BR')}${resultText}</div>`;
                const delBtn = document.createElement('button');
                delBtn.className = 'load-item-delete';
                delBtn.textContent = '✕';
                delBtn.onclick = async (e) => {
                    e.stopPropagation();
                    await deleteMatch(m.id);
                    showLoadModal();
                };
                div.appendChild(left);
                div.appendChild(delBtn);
                div.onclick = async () => {
                    modal.style.display = 'none';
                    await resumeMatch(m.id);
                };
                list.appendChild(div);
            }
        }
    } catch (_) {
        list.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Erro ao carregar partidas.</p>';
    }
    modal.style.display = 'flex';
}

// ── PDN Import ──────────────────────────────────────────────────────────────

function numToIdx(num) {
    if (num < 1 || num > 32) return -1;
    const r = 7 - Math.floor((num - 1) / 4), offset = (num - 1) % 4;
    const c = r % 2 === 0 ? offset * 2 : offset * 2 + 1;
    return r * 8 + c;
}

function tryMatchMove(state, tk) {
    const moves = state.getMoves();
    let found = moves.find(m => move2Str(m).toLowerCase() === tk.toLowerCase());
    if (found) return found;
    if (/^\d+([-x:]\d+)+$/i.test(tk)) {
        const pts = tk.split(/[-x:]/i).map(Number), isCapture = /[x:]/i.test(tk);
        const sIdx = numToIdx(pts[0]), eIdx = numToIdx(pts[pts.length - 1]);
        if (sIdx < 0 || eIdx < 0) return null;
        let poss = moves.filter(m => m.from === sIdx && m.to === eIdx);
        if (poss.length > 1 && pts.length > 2) {
            const ep = pts.slice(1).map(numToIdx);
            const nw = poss.filter(m => m.path.length === ep.length && m.path.every((sq, i) => sq === ep[i]));
            if (nw.length > 0) poss = nw;
        }
        if (poss.length > 1 && isCapture) { const c = poss.filter(m => m.captured.length > 0); if (c.length > 0) poss = c; }
        if (poss.length > 0) return poss[0];
    }
    return null;
}

function importPDN(str) {
    str = str.replace(/^%[^\r\n]*/gm, ' ');
    str = str.replace(/^\[[^\]]*\][ \t]*/gm, ' ');
    let prev;
    do { prev = str; str = str.replace(/\{[^{}]*\}/g, ' '); } while (str !== prev);
    str = str.replace(/\r?\n/g, ' ');
    str = str.replace(/\$\d{1,3}/g, ' ').replace(/[?!]+/g, ' ');
    str = str.replace(/\b(1\/2-1\/2|2-0|0-2|1-1|1-0|0-1)\b/g, ' ').replace(/\*/g, ' ');
    str = str.replace(/\d+\.+/g, ' ');
    str = str.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ');

    const tokens = str.split(/\s+/).filter(t => t.length > 0);

    resetState();
    clearHistory();

    const state = getState();
    const skipped = [];

    for (const tk of tokens) {
        if (tk === '(' || tk === ')') continue;
        const found = tryMatchMove(state, tk);
        if (!found) { skipped.push(tk); continue; }
        state.applyMove(found);
        addMove(found, move2Str(found));
    }

    gameStarted = true;
    gameEnded = false;
    isComputing = false;
    currentMatchId = null;

    document.getElementById('modal').style.display = 'none';
    render();
    renderHistory();

    const analysisEl = document.getElementById('analysis-text');
    if (skipped.length > 0) {
        const uniq = [...new Set(skipped)];
        const safe = uniq.slice(0, 6).join(', ');
        analysisEl.textContent = `Importado com ${skipped.length} token(s) desconhecido(s): ${safe}${uniq.length > 6 ? '…' : ''}`;
    } else {
        analysisEl.textContent = `✓ Importação concluída. ${getHistory().length} lance(s) carregados.`;
    }
}

// ── Initialization ──────────────────────────────────────────────────────────

async function init() {
    await loadBook();
    initDOM();
    initClock({ onTimeout: () => {} });
    initControls({
        onNewGame: startNewGame,
        onModeChange: (mode) => {
            // Auto-flip: MVH → black view, others → white view
            const flipped = mode === MODE_AVA;
            setFlipped(flipped);
            const viewSel = document.getElementById('cfg-view');
            if (viewSel) viewSel.value = flipped ? 'B' : 'W';
            updateCoords(flipped);
            render();
        },
        onDepthChange: () => {}
    });
    updateCoords(false);

    // Save / Load buttons
    document.getElementById('btn-save').onclick = saveMatch;
    document.getElementById('btn-load').onclick = showLoadModal;

    // PDN import button
    document.getElementById('btn-pdn').onclick = () => {
        document.getElementById('pdn-input').value = '';
        document.getElementById('pdn-modal').style.display = 'flex';
    };
    document.getElementById('pdn-import').onclick = () => {
        const txt = document.getElementById('pdn-input').value.trim();
        if (!txt) return;
        document.getElementById('pdn-modal').style.display = 'none';
        importPDN(txt);
    };

    // View selector (board flip)
    document.getElementById('cfg-view').onchange = (e) => {
        const flipped = e.target.value === 'B';
        setFlipped(flipped);
        updateCoords(flipped);
        render();
    };

    setMoveCallback((m) => {
        if (isCPUTurn() || !gameStarted || gameEnded || isComputing) return;
        executeMove(m);
    });

    startNewGame();
    checkForResume();
}

init();
