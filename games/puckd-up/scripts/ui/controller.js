import { normalizeSettings, saveSettings } from '../settings.js';
import { RIVALS, getRival } from '../physics/rivals.js';
import { CIRCUIT_STOPS, createCircuitProgress, loadCircuitProgress, recordCircuitResult, saveCircuitProgress, stopStatus } from '../core/circuit.js';
// Owns DOM lookup, presentation and user actions. Reads match state; never moves bodies.
export function createUI({ doc, match, metrics, audio, controls, view, stagePreview, storage, onlineClient }) {
    const abort = new AbortController(), options = { signal: abort.signal };
    const ids = ['app', 'game', 'gamewrap', 'pScore', 'cScore', 'scoreboard', 'speed', 'shot', 'powerFill',
        'gameState', 'message', 'pause', 'restart', 'fullscreen', 'menuFullscreen', 'difficultyLabel',
        'serveLabel', 'menuScreen', 'setupScreen', 'pauseScreen', 'resultScreen', 'matchHud', 'matchControls',
        'cpuModeBtn', 'circuitModeBtn', 'circuitScreen', 'circuitGrid', 'circuitBack', 'circuitProgress', 'circuitTitle',
        'setupBack', 'startMatch', 'setupRival', 'playerColor', 'colorPreview',
        'resumeMatch', 'pauseRestart', 'pauseMenu', 'rematch', 'resultMenu', 'resultTitle', 'resultP', 'resultC', 'arenaGrid', 'soundToggle', 'opponentName', 'resultNote',
        'stagePreviewNumber', 'stagePreviewName', 'stagePreviewDescription', 'rivalPortrait', 'rivalTitle', 'rivalName', 'rivalIntro', 'rivalRecord',
        'rivalPortraitMobile', 'rivalTitleMobile', 'rivalNameMobile', 'rivalIntroMobile', 'rivalRecordMobile'];
    const el = Object.fromEntries(ids.map(id => {
        const node = doc.getElementById(id);
        if (!node)
            throw new Error(`Missing cabinet element: ${id}`);
        return [id, node];
    }));
    const swatches = [...doc.querySelectorAll('.swatch')], arenas = [...el.arenaGrid.querySelectorAll('.arenaCard')];
    let previousScreen = null, circuitProgress = loadCircuitProgress(storage);
    const on = (node, event, fn) => node.addEventListener(event, fn, options);
    function write(node, text) {
        if (node.textContent !== String(text))
            node.textContent = String(text);
    }
    for (const rival of RIVALS) {
        const option = doc.createElement('option');
        option.value = rival.id;
        option.textContent = `${rival.name} — ${rival.title} / ${rival.style}`;
        el.setupRival.append(option);
    }
    const circuitButtons = CIRCUIT_STOPS.map((stop, index) => {
        const rival = getRival(stop.rivalId), button = doc.createElement('button');
        button.type = 'button';
        button.className = 'circuitStop';
        button.dataset.stop = String(index);
        button.style.setProperty('--portrait-focus', rival.portraitFocus);
        button.innerHTML = `<img src="${rival.portrait}" alt=""><span class="circuitStopCopy"><span class="circuitStopNo">${String(stop.number).padStart(2, '0')}</span><strong>${rival.name}</strong><span class="circuitStopState"></span><small>${stop.name} · ${rival.style}</small></span>`;
        el.circuitGrid.append(button);
        return button;
    });
    function rivalRecord(id) {
        return circuitProgress.records[id] || { wins: 0, losses: 0 };
    }
    function updateCircuit() {
        write(el.circuitProgress, `${circuitProgress.cleared.length} / ${CIRCUIT_STOPS.length} cleared`);
        write(el.circuitTitle, circuitProgress.complete ? 'Circuit conquered' : 'Own the tour');
        circuitButtons.forEach((button, index) => {
            const status = stopStatus(circuitProgress, index), record = rivalRecord(CIRCUIT_STOPS[index].rivalId);
            button.className = `circuitStop ${status}`;
            button.disabled = status === 'locked';
            button.querySelector('.circuitStopState').textContent = status === 'locked' ? 'LOCKED' : `${record.wins}W–${record.losses}L`;
        });
    }
    function applyConfig(patch = {}) {
        Object.assign(match.config, normalizeSettings({ ...match.config, ...patch }));
        const { playerColor, arenaId, rivalId, muted } = match.config;
        const rival = getRival(rivalId), record = rivalRecord(rival.id);
        view.configure(match.config);
        doc.documentElement.style.setProperty('--player-accent', playerColor);
        el.playerColor.value = playerColor;
        el.colorPreview.style.background = playerColor;
        el.setupRival.value = rival.id;
        el.rivalPortrait.src = rival.portrait;
        el.rivalPortrait.alt = `${rival.name}, ${rival.title}`;
        el.rivalPortrait.style.objectPosition = rival.portraitFocus;
        write(el.rivalTitle, `${rival.title} // ${rival.style}`);
        write(el.rivalName, rival.name);
        write(el.rivalIntro, rival.intro);
        write(el.rivalRecord, `Record ${record.wins}–${record.losses}`);
        el.rivalPortraitMobile.src = rival.portrait;
        el.rivalPortraitMobile.alt = `${rival.name}, ${rival.title}`;
        el.rivalPortraitMobile.style.objectPosition = rival.portraitFocus;
        write(el.rivalTitleMobile, `${rival.title} // ${rival.style}`);
        write(el.rivalNameMobile, rival.name);
        write(el.rivalIntroMobile, rival.intro);
        write(el.rivalRecordMobile, `Record ${record.wins}–${record.losses}`);
        doc.documentElement.style.setProperty('--rival-accent', rival.color);
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
        const selectedVenue = arenas.find(card => card.dataset.arena === arenaId);
        const venueIndex = arenas.indexOf(selectedVenue) + 1;
        write(el.stagePreviewNumber, `A${venueIndex} // Selected venue`);
        write(el.stagePreviewName, selectedVenue?.querySelector('b')?.textContent || 'Hyper Arcade');
        write(el.stagePreviewDescription, selectedVenue?.querySelector('small')?.textContent || 'Neon light tunnel');
        stagePreview.configure(match.config);
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
        applyConfig({ rivalId: el.setupRival.value, playerColor: el.playerColor.value });
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
    on(el.circuitModeBtn, 'click', () => match.circuit());
    on(el.circuitBack, 'click', () => match.menu());
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
    on(el.resultMenu, 'click', () => match.state.mode === 'campaign' ? match.circuit() : match.menu());
    on(el.playerColor, 'input', () => applyConfig({ playerColor: el.playerColor.value }));
    on(el.setupRival, 'change', () => applyConfig({ rivalId: el.setupRival.value }));
    for (const swatch of swatches)
        on(swatch, 'click', () => applyConfig({ playerColor: swatch.dataset.color }));
    for (const arena of arenas)
        on(arena, 'click', () => applyConfig({ arenaId: arena.dataset.arena }));
    circuitButtons.forEach((button, index) => on(button, 'click', () => {
        const stop = CIRCUIT_STOPS[index];
        if (stopStatus(circuitProgress, index) === 'locked') return;
        applyConfig({ rivalId: stop.rivalId, arenaId: stop.arenaId });
        saveSettings(storage, match.config);
        match.start();
        focusMatch();
    }));
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
        const isOnline = match.state.mode === 'online', isCampaign = match.state.mode === 'campaign';
        const rival = getRival(match.config.rivalId);
        const opponent = isOnline ? match.state.opponentName || 'Opponent' : rival.name;
        const inMatch = ['playing', 'paused', 'result'].includes(screen), won = isOnline ? match.state.winner === 0 : playerScore > cpuScore;
        for (const name of ['menu', 'setup', 'circuit', 'pause', 'result'])
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
        const record = rivalRecord(rival.id);
        write(el.resultNote, isOnline ? match.state.networkError || (match.state.reason === 'forfeit' ? 'Opponent disconnected or left. Match decided by forfeit.' : 'Casual match · no ratings recorded. Both players must request a rematch.') : isCampaign ? `${rival.name}: ${record.wins}W–${record.losses}L · Circuit ${circuitProgress.cleared.length}/${CIRCUIT_STOPS.length}` : `${rival.name}: ${record.wins}W–${record.losses}L`);
        write(el.resultMenu, isCampaign ? 'Circuit' : 'Main Menu');
        const status = screen === 'result' ? (won ? 'YOU WIN' : `${opponent} WINS`) : isOnline && match.state.disconnected ? 'RECONNECTING' : screen === 'playing' ? ({ faceoff: 'FACE-OFF', goal: 'GOAL', live: 'PLAY' }[phase] || 'PLAY') : screen.toUpperCase();
        write(el.gameState, status);
        write(el.difficultyLabel, isOnline ? 'ONLINE · CASUAL' : `${rival.title.toUpperCase()} · ${rival.style.toUpperCase()}`);
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
            const focus = { menu: el.circuitModeBtn, circuit: circuitButtons.find(button => !button.disabled), setup: el.startMatch, paused: el.resumeMatch, result: el.rematch }[screen];
            focus?.focus();
            if (screen === 'playing' && isOnline) el.game.focus();
        }
    }
    function handle(event) {
        if (event.type === 'match-end' && event.mode !== 'online') {
            if (event.mode === 'campaign') circuitProgress = recordCircuitResult(circuitProgress, { rivalId: event.rivalId, won: event.winner === 'player' });
            else {
                circuitProgress = createCircuitProgress(circuitProgress);
                const record = rivalRecord(event.rivalId);
                circuitProgress.records[event.rivalId] = { ...record, [event.winner === 'player' ? 'wins' : 'losses']: record[event.winner === 'player' ? 'wins' : 'losses'] + 1 };
            }
            saveCircuitProgress(storage, circuitProgress);
            updateCircuit();
            applyConfig();
        }
        render();
    }
    applyConfig();
    updateCircuit();
    render();
    return { render, handle, dispose: () => abort.abort() };
}
