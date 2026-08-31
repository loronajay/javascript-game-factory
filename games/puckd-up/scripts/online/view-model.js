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
        lobby: players.length === 2 ? 'Both players are here. Ready up to start a casual match.'
            : lobby?.isPrivate ? 'Share this code with your opponent.' : 'Searching for another player…',
        playing: 'Match in progress.', result: 'Match finished. Both players can request a rematch.', reconnecting: 'Reconnecting to your match…',
    };
    return {
        status: error || messages[snapshot.status || 'idle'],
        busy, canStart: snapshot.status === 'lobby' && players.length === 2,
        startLabel: players.find(player => player.id === clientId)?.ready ? 'Not ready' : 'Ready to play',
        code: lobby?.roomCode || '',
        kind: lobby?.isPrivate ? 'Private lobby' : 'Quick Search',
        players: players.map(player => `${player.name}${player.id === clientId ? ' (You)' : ''}${player.id === lobby.ownerId ? ' · Host' : ''}${player.ready ? ' · Ready' : ''}`),
    };
}
