const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadOnlineClient() {
  const sockets = [];

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      this.sent = [];
      this.listeners = {};
      sockets.push(this);
    }

    addEventListener(type, listener) {
      this.listeners[type] ||= [];
      this.listeners[type].push(listener);
    }

    send(payload) {
      this.sent.push(JSON.parse(payload));
    }

    open() {
      this.readyState = FakeWebSocket.OPEN;
      this.emit('open', {});
    }

    message(value) {
      this.emit('message', { data: JSON.stringify(value) });
    }

    close() {
      this.readyState = FakeWebSocket.CLOSED;
      this.emit('close', {});
    }

    emit(type, event) {
      for (const listener of this.listeners[type] || []) listener(event);
    }
  }

  const context = {
    WebSocket: FakeWebSocket,
    console,
  };
  vm.createContext(context);

  const source = fs.readFileSync(path.join(__dirname, 'scripts', 'online.js'), 'utf8');
  vm.runInContext(`${source}\nglobalThis.__exports = { buildCbGameId, createCbOnlineClient };`, context);

  return { ...context.__exports, sockets };
}

test('findMatch sent before socket open is delivered after connect', () => {
  const { createCbOnlineClient, sockets } = loadOnlineClient();
  const client = createCbOnlineClient();

  client.connect();
  client.findMatch('blind', 'any', 'p1', 'Trainer One');

  assert.equal(sockets.length, 1);
  assert.deepEqual(sockets[0].sent, []);

  sockets[0].open();

  assert.deepEqual(sockets[0].sent, [
    {
      type: 'find_match',
      gameId: 'creature-battler-blind-any',
      playerId: 'p1',
      displayName: 'Trainer One',
    },
  ]);
});

test('private room commands sent before socket open are delivered in order', () => {
  const { createCbOnlineClient, sockets } = loadOnlineClient();
  const client = createCbOnlineClient();

  client.connect();
  client.createRoom('host-id', 'Host');
  client.send('match_settings', { levelCap: 30 });

  sockets[0].open();

  assert.deepEqual(sockets[0].sent, [
    { type: 'create_room', side: 'alpha', playerId: 'host-id', displayName: 'Host' },
    {
      type: 'room_message',
      messageType: 'match_settings',
      value: JSON.stringify({ levelCap: 30 }),
    },
  ]);
});

test('server error events surface through onError callback', () => {
  const { createCbOnlineClient, sockets } = loadOnlineClient();
  const client = createCbOnlineClient();
  const errors = [];
  client.cb.onError = (code, message) => errors.push({ code, message });

  client.connect();
  sockets[0].message({ event: 'error', code: 'room_not_found', message: 'Room not found.' });

  assert.deepEqual(errors, [{ code: 'room_not_found', message: 'Room not found.' }]);
});
