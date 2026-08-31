import { normalizeSettings, saveSettings } from '../settings.js';
// Owns DOM lookup, presentation and user actions. Reads match state; never moves bodies.
export function createUI({ doc, match, metrics, audio, controls, view, storage, onlineClient }) {
    const abort = new AbortController(), options = { signal: abort.signal };
    const ids = ['app', 'game', 'gamewrap', 'pScore', 'cScore', 'scoreboard', 'speed', 'shot', 'powerFill',
        'gameState', 'message', 'pause', 'restart', 'fullscreen', 'menuFullscreen', 'difficultyLabel',
        'serveLabel', 'menuScreen', 'setupScreen', 'pauseScreen', 'resultScreen', 'matchHud', 'matchControls',
        'cpuModeBtn', 'setupBack', 'startMatch', 'setupDifficulty', 'playerColor', 'colorPreview',
        'resumeMatch', 'pauseRestart', 'pauseMenu', 'rematch', 'resultMenu', 'resultTitle', 'resultP', 'resultC', 'arenaGrid', 'soundToggle', 'opponentName', 'resultNote'];
    const el = Object.fromEntries(ids.map(id => {
        const node = doc.getElementById(id);
        if (!node)
            throw new Error(`Missing cabinet element: ${id}`);
        return [id, node];
    }));
    const swatches = [...doc.querySelectorAll('.swatch')], arenas = [...el.arenaGrid.querySelectorAll('.arenaCard')];
    let previousScreen = null;
    const on = (node, event, fn) => node.addEventListener(event, fn, options);
    function write(node, text) {
        if (node.textContent !== String(text))
            node.textContent = String(text);
    }
    function applyConfig(patch = {}) {
        Object.assign(match.config, normalizeSettings({ ...match.config, ...patch }));
        const { playerColor, arenaId, cpuDifficulty, muted } = match.config;
        view.configure(match.config);
        doc.documentElement.style.setProperty('--player-accent', playerColor);
        el.playerColor.value = playerColor;
        el.colorPreview.style.background = playerColor;
        el.setupDifficulty.value = String(cpuDifficulty);
        for (const swatch of swatches) {
            const selected = swatch.dataset.color.toLowerCase() === playerColor;
            swatch.classList.toggle('selected', selected);
            swatch.setAttribute('aria-pressed', String(selected));
        }
        for (const card of arenas) {
            const selected = card.dataset.arena === arenaId;
            card.classList.toggle('selected', selected);
            card.setAttribute('aria-pressed', String(selected));
        }
        write(el.soundToggle, muted ? 'Sound: Off' : 'Sound: On');
        el.soundToggle.setAttribute('aria-pressed', String(muted));
        el.soundToggle.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
        audio.setMuted(muted);
    }
    function focusMatch() {
        el.game.focus();
        controls.requestLock();
    }
    function start() {
        applyConfig({ cpuDifficulty: Number(el.setupDifficulty.value), playerColor: el.playerColor.value });
        saveSettings(storage, match.config);
        match.start();
        focusMatch();
    }
    function restart() {
        if (match.state.mode === 'online') { onlineClient?.rematch(); return; }
        match.start();
        focusMatch();
    }
    async function fullscreen() {
        try {
            if (doc.fullscreenElement) {
                controls.releaseLock();
                await doc.exitFullscreen();
            }
            else {
                await doc.documentElement.requestFullscreen();
                controls.requestLock();
            }
        }
        catch { /* Fullscreen is optional in embedded cabinets. */
        }
    }
    // Capture gesture before target handlers emit face-off/game sounds.
    el.app.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (button && !button.disabled) {
            audio.unlock();
            audio.handle({ type: 'button-click' });
        }
    }, { ...options, capture: true });
    on(el.cpuModeBtn, 'click', () => match.setup());
    on(el.setupBack, 'click', () => match.menu());
    on(el.startMatch, 'click', start);
    on(el.restart, 'click', restart);
    on(el.pauseRestart, 'click', restart);
    on(el.rematch, 'click', restart);
    on(el.pause, 'click', () => match.state.mode === 'online' ? match.menu() : match.pause());
    on(el.resumeMatch, 'click', () => {
        match.resume();
        focusMatch();
    });
    on(el.pauseMenu, 'click', () => match.menu());
    on(el.resultMenu, 'click', () => match.menu());
    on(el.playerColor, 'input', () => applyConfig({ playerColor: el.playerColor.value }));
    on(el.setupDifficulty, 'change', () => applyConfig({ cpuDifficulty: Number(el.setupDifficulty.value) }));
    for (const swatch of swatches)
        on(swatch, 'click', () => applyConfig({ playerColor: swatch.dataset.color }));
    for (const arena of arenas)
        on(arena, 'click', () => applyConfig({ arenaId: arena.dataset.arena }));
    on(el.fullscreen, 'click', fullscreen);
    on(el.menuFullscreen, 'click', fullscreen);
    on(el.soundToggle, 'click', () => {
        applyConfig({ muted: !match.config.muted });
        saveSettings(storage, match.config);
    });
    on(doc, 'fullscreenchange', () => {
        const text = doc.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
        write(el.fullscreen, text);
        write(el.menuFullscreen, text);
        if (doc.fullscreenElement)
            controls.requestLock();
        else
            controls.releaseLock();
        view.resize();
    });
    function render() {
        const { screen, phase, playerScore, cpuScore, servingPlayer } = match.state;
        el.app.dataset.screen = screen;
        const isOnline = match.state.mode === 'online';
        const opponent = isOnline ? match.state.opponentName || 'Opponent' : 'CPU';
        const inMatch = ['playing', 'paused', 'result'].includes(screen), won = isOnline ? match.state.winner === 0 : playerScore > cpuScore;
        for (const name of ['menu', 'setup', 'pause', 'result'])
            el[`${name}Screen`].hidden = screen !== (name === 'pause' ? 'paused' : name);
        el.matchHud.hidden = el.scoreboard.hidden = !inMatch;
        el.matchControls.hidden = screen !== 'playing';
        write(el.pScore, playerScore);
        write(el.cScore, cpuScore);
        write(el.resultP, playerScore);
        write(el.resultC, cpuScore);
        write(el.resultTitle, won ? 'MATCH WON' : 'MATCH LOST');
        write(el.opponentName, opponent);
        write(el.pause, isOnline ? 'Leave match' : 'Pause');
        el.restart.hidden = isOnline;
        el.rematch.disabled = isOnline && (match.state.rematchPending || match.state.reason === 'forfeit');
        write(el.rematch, isOnline && match.state.rematchPending ? 'Waiting for opponent…' : 'Rematch');
        write(el.resultNote, isOnline ? match.state.networkError || (match.state.reason === 'forfeit' ? 'Opponent disconnected or left. Match decided by forfeit.' : 'Casual match · no ratings recorded. Both players must request a rematch.') : '');
        const status = screen === 'result' ? (won ? 'YOU WIN' : `${opponent} WINS`) : isOnline && match.state.disconnected ? 'RECONNECTING' : screen === 'playing' ? ({ faceoff: 'FACE-OFF', goal: 'GOAL', live: 'PLAY' }[phase] || 'PLAY') : screen.toUpperCase();
        write(el.gameState, status);
        write(el.difficultyLabel, isOnline ? 'ONLINE · CASUAL' : `CPU: ${['CASUAL', 'ARCADE', 'EXPERT'][match.config.cpuDifficulty]}`);
        write(el.serveLabel, isOnline && match.state.disconnected ? 'Waiting for connection · 10s grace' : servingPlayer ? 'YOUR SERVE' : `${opponent} SERVE`);
        write(el.speed, metrics.speed.toFixed(1));
        write(el.shot, metrics.lastShot.toFixed(1));
        el.powerFill.style.width = `${metrics.power.toFixed(0)}%`;
        const goal = screen === 'playing' && phase === 'goal';
        el.message.style.display = goal ? 'inline-block' : 'none';
        if (goal)
            write(el.message, servingPlayer ? `${opponent} GOAL` : 'PLAYER GOAL');
        if (previousScreen !== screen) {
            previousScreen = screen;
            const focus = { menu: el.cpuModeBtn, setup: el.startMatch, paused: el.resumeMatch, result: el.rematch }[screen];
            focus?.focus();
            if (screen === 'playing' && isOnline) el.game.focus();
        }
    }
    applyConfig();
    render();
    return { render, handle: render, dispose: () => abort.abort() };
}
