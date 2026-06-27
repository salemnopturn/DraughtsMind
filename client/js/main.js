import { MODE_PVP, MODE_PVA, MODE_AVA, move2Str } from './game/constants.js';
import { State } from './game/state.js';
import { loadBook } from './game/book.js';
import { getBestMove } from './game/search.js';
import {
    initDOM, render, setMoveCallback, getGameState, setGameState,
    applyMove, resetBoard as resetBoardUI, updateCoords
} from './ui/board.js';
import { initControls, getMode, getDepth } from './ui/controls.js';
import { addMove, clearHistory, getHistory, getPDN, renderHistory } from './ui/history.js';

let gameStarted = false;
let gameEnded = false;
let isComputing = false;
let currentMatchId = null;

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
    const state = getGameState();
    if (mode === MODE_PVP) return false;
    if (mode === MODE_PVA) return state.turn === -1;
    if (mode === MODE_AVA) return true;
    return false;
}

// ── Game flow ───────────────────────────────────────────────────────────────

function startNewGame() {
    resetBoardUI();
    clearHistory();
    currentMatchId = null;
    gameStarted = true;
    gameEnded = false;
    isComputing = false;
    document.getElementById('modal').style.display = 'none';
    document.getElementById('resume-modal').style.display = 'none';
    render();
    renderHistory();
    loop();
}

function loop() {
    if (!gameStarted || gameEnded || isComputing) return;
    if (isCPUTurn()) triggerCPU();
}

function triggerCPU() {
    if (isComputing || gameEnded) return;
    isComputing = true;
    const txtStatus = document.getElementById('status-text');
    const barStatus = document.getElementById('status-container');
    txtStatus.innerText = 'Calculando...';
    barStatus.classList.add('computing');

    setTimeout(() => {
        const state = getGameState();
        const res = getBestMove(state, getDepth(), 0);
        isComputing = false;
        barStatus.classList.remove('computing');

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
    applyMove(m);
    addMove(m, move2Str(m));
    render();
    renderHistory();
    saveMatch();
    checkGameEnd();
    if (!gameEnded && gameStarted) setTimeout(loop, 50);
}

function checkGameEnd() {
    const state = getGameState();
    const moves = state.getMoves();
    const draw = state.checkDraw();
    if (moves.length === 0) {
        const winner = state.turn === 1 ? 'Pretas' : 'Brancas';
        popModal('Fim de Jogo', `${winner} vencem! (Sem lances legais)`);
        finalizeMatch(state.turn === 1 ? 'black' : 'white');
    } else if (draw) {
        popModal('Fim de Jogo', draw);
        finalizeMatch('draw');
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
    const state = getGameState();
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
        state.hashHist = [state.hash()];

        setGameState(state);

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

// ── Initialization ──────────────────────────────────────────────────────────

async function init() {
    await loadBook();
    initDOM();
    initControls({
        onNewGame: startNewGame,
        onModeChange: () => {},
        onDepthChange: () => {}
    });
    updateCoords(false);

    setMoveCallback((m) => {
        if (isCPUTurn() || !gameStarted || gameEnded || isComputing) return;
        executeMove(m);
    });

    startNewGame();
    checkForResume();
}

init();
