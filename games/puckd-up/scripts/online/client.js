import { PROTOCOL_VERSION, RECONNECT_MS, validSnapshot } from './protocol.js';
export const GAME_ID = 'puckd-up';
const SETTINGS = Object.freeze({ protocolVersion: PROTOCOL_VERSION, targetScore: 7 });
const clean = (value, max = 80) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export function resolveWebSocketUrl(location = globalThis.location) {
    const host = location?.hostname;
    if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
        return `${location?.protocol === 'https:' ? 'wss:' : 'ws:'}//${host.includes(':') ? '[::1]' : host}:3000`;
    }
    return 'wss://factory-network-server-production.up.railway.app';
}

// One request/socket generation at a time. Leaving invalidates pending account
// lookups AND socket callbacks; an old connection cannot resurrect a lobby.
export function createOnlineClient({ WebSocketCtor = globalThis.WebSocket, resolveIdentity, wsUrl = resolveWebSocketUrl(), requestTimeoutMs = 12000 } = {}) {
    const listeners = new Set();
    let socket = null, pending = null, generation = 0, timer = null, disposed = false;
    let session = null, retryTimer = null, watchdog = null;
    let state = { status: 'idle', clientId: '', identity: null, lobby: null, match: null, error: '' };
    const getSnapshot = () => structuredClone(state);
    function emit(patch) {
        state = { ...state, ...patch };
        for (const listener of listeners) listener(getSnapshot());
    }
    function clearTimer() { clearTimeout(timer); timer = null; }
    function send(payload) {
        try {
            if (socket?.readyState === WebSocketCtor.OPEN) { socket.send(JSON.stringify(payload)); return true; }
        } catch { /* The close handler owns reconnection. */ }
        return false;
    }
    const message = (messageType, value) => send({ type: 'lobby_message', messageType, value: JSON.stringify(value) });
    function leave(error = '') {
        generation++;
        clearTimer(); pending = null;
        clearTimeout(retryTimer); clearTimeout(watchdog); session = null;
        const old = socket; socket = null;
        if (old?.readyState === WebSocketCtor.OPEN) {
            try { old.send(JSON.stringify({ type: 'leave_lobby' })); } catch { /* Closing still releases the seat. */ }
        }
        try { old?.close(); } catch { /* A connection attempt may already have failed. */ }
        emit({ status: 'idle', clientId: '', identity: null, lobby: null, match: null, error });
    }
    function acceptMatch(snapshot, starting = false) {
        if (!validSnapshot(snapshot) || !snapshot.seats.includes(state.clientId)) return false;
        if (!starting && (!state.match || state.match.matchId !== snapshot.matchId || snapshot.tick < state.match.tick)) return false;
        clearTimeout(watchdog);
        if (snapshot.phase !== 'finished') watchdog = setTimeout(() => broken(), 3500);
        emit({ match: snapshot, status: state.status === 'reconnecting' ? 'reconnecting' : snapshot.phase === 'finished' ? 'result' : 'playing', error: '' });
        return true;
    }
    function broken() {
        const old = socket; socket = null;
        clearTimeout(watchdog);
        try { old?.close(); } catch { /* Already closed. */ }
        if (!state.match || !session) { leave('Connection lost. Search again or rejoin with the room code.'); return; }
        const retrying = state.status === 'reconnecting';
        if (!retrying) {
            clearTimer();
            timer = setTimeout(() => leave('Reconnect timed out. Return to the lobby to play again.'), RECONNECT_MS);
            emit({ status: 'reconnecting', error: '' });
            connect();
        } else retryTimer = setTimeout(connect, 500);
    }
    function connect() {
        if (disposed) return;
        const current = generation;
        let connection;
        try { connection = new WebSocketCtor(wsUrl); } catch { broken(); return; }
        socket = connection;
        const active = () => !disposed && generation === current && socket === connection;
        connection.addEventListener('message', event => {
            if (!active()) return;
            let data;
            try { data = JSON.parse(event.data); } catch { return; }
            receive(data);
        });
        connection.addEventListener('error', () => { if (active()) broken(); });
        connection.addEventListener('close', () => { if (active()) broken(); });
    }
    function receive(data) {
        if (!data || typeof data !== 'object') return;
        if (data.event === 'connected') {
            if (state.status === 'reconnecting') { send({ type: 'resume_lobby', ...session }); return; }
            if (clean(data.sessionToken)) session = { clientId: clean(data.clientId), sessionToken: clean(data.sessionToken, 200) };
            emit({ clientId: clean(data.clientId) });
            if (pending) { const request = pending; pending = null; send(request); }
        } else if (data.event === 'lobby_joined' || data.event === 'lobby_updated') {
            if (data.gameId !== GAME_ID) { leave('That code belongs to a different game.'); return; }
            if (!Array.isArray(data.members) || !data.members.includes(state.clientId)) return;
            clearTimer();
            emit({ status: state.match ? state.status : 'lobby', error: '', lobby: {
                roomCode: clean(data.roomCode, 5), ownerId: clean(data.ownerId), isPrivate: data.isPrivate === true,
                players: data.members.slice(0, 2).map((id, index) => ({ id: clean(id), name: clean(data.players?.find(p => p?.id === id)?.name, 24) || `Player ${index + 1}`, ready: data.players?.find(p => p?.id === id)?.ready === true })),
            } });
        } else if (data.event === 'lobby_started') {
            if (data.gameId !== GAME_ID || data.roomCode !== state.lobby?.roomCode || data.authorityMode !== 'server' || !acceptMatch(data.matchState, true))
                leave('Incompatible multiplayer server. Update the server and reload the game.');
        } else if (data.event === 'puck_state' && data.roomCode === state.lobby?.roomCode) {
            acceptMatch(data.snapshot);
        } else if (data.event === 'session_resumed' && data.clientId === session?.clientId && data.roomCode === state.lobby?.roomCode) {
            clearTimer();
            emit({ status: state.match?.phase === 'finished' ? 'result' : 'playing', error: '' });
        } else if (data.event === 'lobby_left' || data.event === 'lobby_closed') {
            leave(data.event === 'lobby_closed' ? 'The lobby was closed.' : '');
        } else if (data.event === 'error') {
            if (state.status === 'reconnecting') { leave(clean(data.message, 160) || 'Could not reconnect.'); return; }
            clearTimer(); pending = null;
            emit({ status: state.match ? state.status : state.lobby ? 'lobby' : 'idle', error: clean(data.message, 160) || 'Unable to join the lobby. Please try again.' });
        }
    }
    async function request(type, roomCode) {
        if (disposed || state.status !== 'idle') return false;
        const code = clean(roomCode).toUpperCase();
        if (type === 'join_lobby' && !/^[A-HJ-NP-Z2-9]{5}$/.test(code)) {
            emit({ error: 'Enter the five-character room code.' }); return false;
        }
        // Dispose an idle failed socket before starting another request.
        leave();
        const current = generation;
        emit({ status: 'authenticating', error: '' });
        timer = setTimeout(() => leave('Connection timed out. Please try again.'), requestTimeoutMs);
        try {
            const identity = await resolveIdentity();
            if (generation !== current || disposed) return false;
            if (!clean(identity?.playerId) || !clean(identity?.displayName)) throw new Error('Sign in to your Player Factory account.');
            pending = { type, gameId: GAME_ID,
                ...(type === 'join_lobby' ? { roomCode: code } : { minPlayers: 2, maxPlayers: 2, settings: { ...SETTINGS }, ...(type === 'create_lobby' ? { private: true } : {}) }),
                identity: { playerId: clean(identity.playerId, 64), displayName: clean(identity.displayName, 24) },
            };
            emit({ status: type === 'find_lobby' ? 'searching' : type === 'create_lobby' ? 'creating' : 'joining', identity: pending.identity });
            connect();
            return true;
        } catch (error) {
            if (generation === current && !disposed) leave(error?.message || 'Could not open the online lobby.');
            return false;
        }
    }
    return {
        getSnapshot,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        findQuickMatch: () => request('find_lobby'),
        createPrivateRoom: () => request('create_lobby'),
        joinPrivateRoom: code => request('join_lobby', code),
        setReady(ready) { if (state.status === 'lobby') return message('puck_ready', { protocolVersion: PROTOCOL_VERSION, ready: ready === true }); return false; },
        sendInput({ seq, x, z }) { if (state.status !== 'playing') return false; return message('puck_input', { matchId: state.match.matchId, seq, x, z }); },
        rematch() { if (state.status === 'result') return message('puck_rematch', { matchId: state.match.matchId }); return false; },
        leave: () => leave(),
        dispose() { disposed = true; leave(); listeners.clear(); },
    };
}
