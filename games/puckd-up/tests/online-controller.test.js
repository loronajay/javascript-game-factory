import test from 'node:test';
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { createOnlineController } from '../scripts/online/controller.js';

test('storage account changes release a waiting seat, but unrelated settings do not', () => {
    // Browser EventTargets allow the controller's shared AbortSignal listeners.
    setMaxListeners(20);
    const nodes = new Map();
    const node = () => Object.assign(new EventTarget(), { textContent: '', hidden: false, disabled: false, replaceChildren() {}, focus() {} });
    const win = new EventTarget();
    const doc = { defaultView: win, getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); }, createElement: node };
    let sessionKey = 'account-a', leaves = 0;
    const client = { getSnapshot: () => ({ status: 'lobby', lobby: { players: [] } }), subscribe: () => () => {}, leave() { leaves++; }, dispose() {} };
    const account = { isEligible: () => true, sessionKey: () => sessionKey };
    const controller = createOnlineController({ doc, match: { state: { screen: 'online' } }, account, client });
    win.dispatchEvent(new Event('storage'));
    assert.equal(leaves, 0);
    sessionKey = 'account-b';
    win.dispatchEvent(new Event('storage'));
    assert.equal(leaves, 1);
    controller.dispose();
});

test('ready button sends intent and entering a live online match keeps the seat', () => {
    const nodes = new Map();
    const node = () => Object.assign(new EventTarget(), { replaceChildren() {}, focus() {} });
    const doc = { defaultView: new EventTarget(), getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); }, createElement: node };
    let leaves = 0, ready = null;
    const state = { status: 'lobby', clientId: 'a', lobby: { players: [{ id: 'a', ready: false }, { id: 'b' }] } };
    const client = { getSnapshot: () => state, subscribe: () => () => {}, setReady(value) { ready = value; }, leave() { leaves++; }, dispose() {} };
    const match = { state: { screen: 'online', mode: 'cpu' } };
    const c = createOnlineController({ doc, match, account: { isEligible: () => true }, client });
    c.handle({ type: 'screen' });
    nodes.get('onlineStart').dispatchEvent(new Event('click')); assert.equal(ready, true);
    Object.assign(match.state, { screen: 'playing', mode: 'online' }); c.handle({ type: 'screen' }); assert.equal(leaves, 0);
    Object.assign(match.state, { screen: 'menu', mode: 'cpu' }); c.handle({ type: 'screen' }); assert.equal(leaves, 1);
    c.dispose();
});
