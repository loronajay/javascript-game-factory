import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMatch } from '../scripts/core/match.js';
import { lobbyViewModel } from '../scripts/online/view-model.js';

test('online is a separate frozen screen and Back returns safely to CPU setup', () => {
    const match = createMatch();
    match.online();
    assert.equal(match.state.screen, 'online');
    match.tick(1);
    assert.equal(match.state.phase, 'idle');
    assert.equal(match.score(true), false);
    match.menu(); match.setup(); match.start();
    assert.equal(match.state.screen, 'playing');
});

test('lobby copy distinguishes search, private codes, readiness, roster and errors', () => {
    assert.match(lobbyViewModel({ status: 'searching' }).status, /Searching/);
    const ready = lobbyViewModel({ status: 'lobby', clientId: 'a', lobby: { roomCode: 'ABCDE', isPrivate: true, ownerId: 'a', players: [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }] } });
    assert.equal(ready.code, 'ABCDE');
    assert.match(ready.status, /Both players/);
    assert.equal(ready.canStart, true);
    assert.match(ready.players[0], /Host/);
    assert.equal(lobbyViewModel({ status: 'idle', error: 'No connection' }).status, 'No connection');
    assert.equal(lobbyViewModel({ status: 'lobby', clientId: 'a', lobby: { players: [{ id: 'a', ready: true }, { id: 'b' }] } }).startLabel, 'Not ready');
});

test('online markup identifies casual play and uses platform navigation', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    for (const id of ['onlineModeBtn', 'onlineScreen', 'onlineQuick', 'onlineCreate', 'onlineJoin', 'onlineCode', 'onlineLeave', 'onlineBack', 'onlineStatus', 'onlineRoster']) assert.ok(html.includes(`id="${id}"`), id);
    assert.match(html, /id="onlineStart"[^>]*disabled/);
    assert.match(html, /\.\.\/\.\.\/grid.html/);
    assert.match(html, /Casual/);
    assert.doesNotMatch(html, /ONLINE LOBBY PREVIEW|Match play coming next/);
});

test('optional platform imports cannot stop standalone CPU play from loading', () => {
    const controller = readFileSync(new URL('../scripts/online/controller.js', import.meta.url), 'utf8');
    assert.doesNotMatch(controller, /import .*account-access/);
    const boot = readFileSync(new URL('../game.js', import.meta.url), 'utf8');
    assert.match(boot, /import\('\.\/scripts\/platform\/account-access.js'\)/);
    assert.match(boot, /createCabinet\(\{ THREE, CANNON, account \}\)/);
});
