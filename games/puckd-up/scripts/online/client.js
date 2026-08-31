export const GAME_ID = 'puckd-up';
const SETTINGS = Object.freeze({ protocolVersion: 1, targetScore: 7 });
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
    let state = { status: 'idle', clientId: '', identity: null, lobby: null, error: '' };
    const getSnapshot = () => structuredClone(state);
    function emit(patch) {
        state = { ...state, ...patch };
        for (const listener of listeners) listener(getSnapshot());
    }
    function clearTimer() { clearTimeout(timer); timer = null; }
    function send(payload) {
        if (socket?.readyState === WebSocketCtor.OPEN) socket.send(JSON.stringify(payload));
    }
    function leave(error = '') {
        generation++;
        clearTimer(); pending = null;
        const old = socket; socket = null;
        if (old?.readyState === WebSocketCtor.OPEN) {
            try { old.send(JSON.stringify({ type: 'leave_lobby' })); } catch { /* Closing still releases the seat. */ }
        }
        try { old?.close(); } catch { /* A connection attempt may already have failed. */ }
        emit({ status: 'idle', clientId: '', identity: null, lobby: null, error });
    }
    function receive(data) {
        if (!data || typeof data !== 'object') return;
        if (data.event === 'connected') {
            emit({ clientId: clean(data.clientId) });
            if (pending) { const request = pending; pending = null; send(request); }
        } else if (data.event === 'lobby_joined' || data.event === 'lobby_updated') {
            if (data.gameId !== GAME_ID) { leave('That code belongs to a different game.'); return; }
            if (!Array.isArray(data.members) || !data.members.includes(state.clientId)) return;
            clearTimer();
            emit({ status: 'lobby', error: '', lobby: {
                roomCode: clean(data.roomCode, 5), ownerId: clean(data.ownerId), isPrivate: data.isPrivate === true,
                players: data.members.slice(0, 2).map((id, index) => ({ id: clean(id), name: clean(data.players?.find(p => p?.id === id)?.name, 24) || `Player ${index + 1}` })),
            } });
        } else if (data.event === 'lobby_started') {
            leave('Online matches are not available yet. Lobby preparation only.');
        } else if (data.event === 'lobby_left' || data.event === 'lobby_closed') {
            leave(data.event === 'lobby_closed' ? 'The lobby was closed.' : '');
        } else if (data.event === 'error') {
            clearTimer(); pending = null;
            emit({ status: state.lobby ? 'lobby' : 'idle', error: clean(data.message, 160) || 'Unable to join the lobby. Please try again.' });
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
            const connection = new WebSocketCtor(wsUrl);
            socket = connection;
            const active = () => !disposed && generation === current && socket === connection;
            connection.addEventListener('message', event => {
                if (!active()) return;
                let data;
                try { data = JSON.parse(event.data); } catch { return; }
                receive(data);
            });
            connection.addEventListener('error', () => { if (active()) leave('Unable to reach Factory Network. Please try again.'); });
            connection.addEventListener('close', () => { if (active()) leave('Connection lost. Search again or rejoin with the room code.'); });
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
        leave: () => leave(),
        dispose() { disposed = true; leave(); listeners.clear(); },
    };
}
