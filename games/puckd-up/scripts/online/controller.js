import { createOnlineClient } from './client.js';
import { lobbyViewModel } from './view-model.js';

const unavailableAccount = {
    configured: false,
    isEligible: () => false,
    resolve: async () => { throw new Error('Serve from the platform root to use online lobbies.'); },
};

// Cabinet-owned lobby UI, shared-platform identity, Factory Network transport.
// Match state is owned by the separate sync adapter; no platform record writes.
export function createOnlineController({ doc, match, account = unavailableAccount, client = createOnlineClient({ resolveIdentity: () => account.resolve() }) }) {
    const abort = new AbortController(), options = { signal: abort.signal };
    const ids = ['onlineModeBtn', 'onlineScreen', 'onlineQuick', 'onlineCreate', 'onlineJoin', 'onlineCode', 'onlineLeave', 'onlineBack', 'onlineStatus', 'onlineRoster', 'onlineRoom', 'onlineKind', 'onlineIdentity', 'onlineSignIn', 'onlineStart', 'onlineAccountNote'];
    const el = Object.fromEntries(ids.map(id => [id, doc.getElementById(id)]));
    let wasOnline = false;
    let sessionKey = account.sessionKey?.();
    function render() {
        const snapshot = client.getSnapshot(), vm = lobbyViewModel(snapshot), eligible = account.isEligible();
        // Successful /auth/me calls may rotate the same account's token.
        sessionKey = account.sessionKey?.();
        el.onlineScreen.hidden = match.state.screen !== 'online';
        el.onlineModeBtn.disabled = !eligible;
        el.onlineModeBtn.title = eligible ? 'Online multiplayer' : 'Sign in to your Player Factory account to play online.';
        el.onlineAccountNote.textContent = eligible ? 'Quick Search / private rooms · casual 1v1' : 'Sign in to Player Factory to play online';
        el.onlineSignIn.hidden = eligible;
        el.onlineSignIn.disabled = account.configured === false;
        if (account.configured === false) el.onlineAccountNote.textContent = 'Serve from the platform root to enable online lobbies';
        el.onlineStatus.textContent = vm.status;
        el.onlineIdentity.textContent = snapshot.identity?.displayName || (eligible ? 'Account checked when joining' : 'Player Factory sign-in required');
        el.onlineRoom.textContent = vm.code || '—';
        el.onlineKind.textContent = vm.kind;
        for (const name of ['onlineQuick', 'onlineCreate', 'onlineJoin', 'onlineCode']) el[name].disabled = !eligible || vm.busy;
        el.onlineLeave.disabled = !vm.busy;
        el.onlineLeave.textContent = snapshot.lobby ? 'Leave lobby' : 'Cancel search';
        el.onlineStart.disabled = !vm.canStart;
        el.onlineStart.textContent = vm.startLabel;
        el.onlineRoster.replaceChildren(...vm.players.map(name => { const li = doc.createElement('li'); li.textContent = name; return li; }));
    }
    const on = (node, event, fn) => node.addEventListener(event, fn, options);
    on(el.onlineModeBtn, 'click', () => { if (account.isEligible()) { match.online(); el.onlineQuick.focus(); } });
    on(el.onlineSignIn, 'click', () => account.signIn());
    on(el.onlineQuick, 'click', () => client.findQuickMatch());
    on(el.onlineCreate, 'click', () => client.createPrivateRoom());
    on(el.onlineJoin, 'click', () => client.joinPrivateRoom(el.onlineCode.value));
    on(el.onlineCode, 'keydown', event => { if (event.key === 'Enter') { event.preventDefault(); client.joinPrivateRoom(el.onlineCode.value); } });
    on(el.onlineLeave, 'click', () => client.leave());
    on(el.onlineBack, 'click', () => match.menu());
    on(el.onlineStart, 'click', () => {
        const snapshot = client.getSnapshot();
        client.setReady(!snapshot.lobby?.players.find(player => player.id === snapshot.clientId)?.ready);
    });
    function refreshAccount() {
        // A sign-out in another tab must release any waiting seat.
        if (!account.isEligible() || sessionKey !== account.sessionKey?.()) client.leave();
        render();
    }
    on(doc.defaultView, 'focus', refreshAccount);
    on(doc.defaultView, 'storage', refreshAccount);
    on(doc.defaultView, 'pagehide', () => client.leave());
    const unsubscribe = client.subscribe(render);
    render();
    return {
        handle(event) {
            if (event.type !== 'screen') return;
            const online = match.state.screen === 'online' || match.state.mode === 'online';
            const leaving = wasOnline && !online;
            wasOnline = online;
            if (leaving) client.leave();
            render();
        },
        dispose() { abort.abort(); unsubscribe(); client.dispose(); },
    };
}
