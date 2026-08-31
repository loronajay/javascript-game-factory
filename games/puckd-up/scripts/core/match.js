import { normalizeSettings } from '../settings.js';
// Owns screens, score and round timing. No DOM, browser timers, physics or audio.
// Consumers observe events; only these commands may transition match state.
export function createMatch({ config = {}, emit = () => {
} } = {}) {
    const settings = normalizeSettings(config);
    const state = { screen: 'menu', phase: 'idle', playerScore: 0, cpuScore: 0, servingPlayer: true, remaining: 0 };
    function screen(value) {
        state.screen = value;
        emit({ type: 'screen', screen: value });
    }
    function faceoff(servingPlayer) {
        Object.assign(state, { phase: 'faceoff', servingPlayer, remaining: .65 });
        emit({ type: 'round-reset', servingPlayer });
    }
    return {
        state, config: settings,
        online() {
            if (state.screen === 'menu')
                screen('online');
        },
        setup() {
            if (state.screen === 'menu')
                screen('setup');
        },
        start() {
            Object.assign(state, { playerScore: 0, cpuScore: 0 });
            screen('playing');
            emit({ type: 'match-start' });
            faceoff(true);
        },
        menu() {
            Object.assign(state, { phase: 'idle', playerScore: 0, cpuScore: 0, remaining: 0 });
            screen('menu');
            emit({ type: 'match-reset' });
        },
        pause() {
            if (state.screen === 'playing')
                screen('paused');
        },
        resume() {
            if (state.screen === 'paused')
                screen('playing');
        },
        score(playerScored) {
            if (state.screen !== 'playing' || state.phase !== 'live')
                return false;
            state[playerScored ? 'playerScore' : 'cpuScore']++;
            Object.assign(state, { phase: 'goal', remaining: 1.05, servingPlayer: !playerScored });
            emit({ type: 'goal', playerScored });
            if (state.playerScore >= settings.targetScore || state.cpuScore >= settings.targetScore) {
                state.phase = 'finished';
                state.remaining = 0;
                screen('result');
                emit({ type: 'match-end', winner: state.playerScore > state.cpuScore ? 'player' : 'cpu' });
            }
            return true;
        },
        tick(dt) {
            if (state.screen !== 'playing' || !['faceoff', 'goal'].includes(state.phase))
                return;
            state.remaining = Math.max(0, state.remaining - dt);
            if (state.remaining > 1e-9)
                return;
            if (state.phase === 'goal')
                faceoff(state.servingPlayer);
            else {
                state.phase = 'live';
                emit({ type: 'serve', servingPlayer: state.servingPlayer });
            }
        },
    };
}
