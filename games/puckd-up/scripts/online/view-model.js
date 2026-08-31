// Pure presentation contract; networking and DOM actions live elsewhere.
export function lobbyViewModel(snapshot = {}) {
    const { lobby, clientId, error } = snapshot;
    const players = lobby?.players || [];
    const busy = snapshot.status !== 'idle' && snapshot.status !== undefined;
    const messages = {
        idle: 'Choose Quick Search or create/join a private lobby.',
        authenticating: 'Checking your Player Factory account…',
        searching: 'Searching for another player…',
        creating: 'Creating your private lobby…',
        joining: 'Joining the private lobby…',
        lobby: players.length === 2 ? 'Both players are here. Online match play is coming next.'
            : lobby?.isPrivate ? 'Share this code with your opponent.' : 'Searching for another player…',
    };
    return {
        status: error || messages[snapshot.status || 'idle'],
        busy, canStart: false,
        code: lobby?.roomCode || '',
        kind: lobby?.isPrivate ? 'Private lobby' : 'Quick Search',
        players: players.map(player => `${player.name}${player.id === clientId ? ' (You)' : ''}${player.id === lobby.ownerId ? ' · Host' : ''}`),
    };
}
