import { MODE_PVP, MODE_PVA, MODE_AVA } from '../game/constants.js';

let currentMode = MODE_PVP;
let currentDepth = 8;
let callbacks = {};

export function initControls(cbs) {
    callbacks = cbs || {};

    const btns = document.querySelectorAll('.mode-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = parseInt(btn.dataset.mode);
            if (callbacks.onModeChange) callbacks.onModeChange(currentMode);
        });
    });

    const slider = document.getElementById('cfg-depth');
    const depthVal = document.getElementById('depth-val');
    if (slider) {
        slider.addEventListener('input', () => {
            currentDepth = parseInt(slider.value);
            if (depthVal) depthVal.textContent = currentDepth;
            if (callbacks.onDepthChange) callbacks.onDepthChange(currentDepth);
        });
    }

    const btnNew = document.getElementById('btn-new');
    if (btnNew) btnNew.addEventListener('click', () => {
        if (callbacks.onNewGame) callbacks.onNewGame();
    });

    const btnSave = document.getElementById('btn-save');
    if (btnSave) btnSave.addEventListener('click', () => {
        if (callbacks.onSave) callbacks.onSave();
    });

    const btnLoad = document.getElementById('btn-load');
    if (btnLoad) btnLoad.addEventListener('click', () => {
        if (callbacks.onLoad) callbacks.onLoad();
    });
}

export function getMode() {
    return currentMode;
}

export function getDepth() {
    return currentDepth;
}

export function isAnalysisOn() {
    const cb = document.getElementById('cfg-analysis');
    return cb ? cb.checked : false;
}
