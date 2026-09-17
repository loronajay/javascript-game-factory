const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const url = require('node:url');

// Fullscreen is a toggle on the title and pause screens. The buttons say what they will do rather
// than what the state is, they follow the browser's own `fullscreenchange` (Esc leaves fullscreen
// without ever touching the button), and they disappear where the API does not exist rather than
// sitting there doing nothing.

function button() {
  const listeners = new Map();
  return {
    textContent: '',
    classList: { set: new Set(), add(n) { this.set.add(n); }, remove(n) { this.set.delete(n); }, contains(n) { return this.set.has(n); }, toggle(n, on) { if (on) this.set.add(n); else this.set.delete(n); } },
    addEventListener(name, handler) { listeners.set(name, [...(listeners.get(name) || []), handler]); },
    fire(name, event = { preventDefault() {} }) { for (const handler of listeners.get(name) || []) handler(event); },
  };
}

function browser({ supported = true } = {}) {
  const buttons = [button(), button()];
  const calls = [];
  const listeners = new Map();
  const root = {
    requestFullscreen: supported ? () => { calls.push('enter'); document.fullscreenElement = root; return Promise.resolve(); } : undefined,
  };
  const document = {
    fullscreenElement: null,
    fullscreenEnabled: supported,
    documentElement: root,
    exitFullscreen: supported ? () => { calls.push('exit'); document.fullscreenElement = null; return Promise.resolve(); } : undefined,
    querySelectorAll: (selector) => (selector === '[data-fullscreen]' ? buttons : []),
    addEventListener(name, handler) { listeners.set(name, [...(listeners.get(name) || []), handler]); },
    fire(name) { for (const handler of listeners.get(name) || []) handler({}); },
  };
  return { document, buttons, calls, root };
}

async function load() {
  const file = path.join(__dirname, '..', 'modules', 'fullscreen.js');
  return import(url.pathToFileURL(file).href);
}

test('the button enters fullscreen on the page root, then offers to leave it', async () => {
  const { createFullscreen } = await load();
  const env = browser();
  createFullscreen({ document: env.document });
  assert.equal(env.buttons[0].textContent, 'Fullscreen');
  env.buttons[0].fire('click');
  await Promise.resolve();
  assert.deepEqual(env.calls, ['enter']);
  env.document.fire('fullscreenchange');
  assert.equal(env.buttons[0].textContent, 'Exit Fullscreen');
  assert.equal(env.buttons[1].textContent, 'Exit Fullscreen', 'every button shows the same state');
  env.buttons[1].fire('click');
  await Promise.resolve();
  assert.deepEqual(env.calls, ['enter', 'exit']);
  env.document.fire('fullscreenchange');
  assert.equal(env.buttons[0].textContent, 'Fullscreen');
});

test('leaving fullscreen with Esc relabels the buttons without a click', async () => {
  const { createFullscreen } = await load();
  const env = browser();
  createFullscreen({ document: env.document });
  env.document.fullscreenElement = env.root;
  env.document.fire('fullscreenchange');
  assert.equal(env.buttons[0].textContent, 'Exit Fullscreen');
  env.document.fullscreenElement = null;
  env.document.fire('fullscreenchange');
  assert.equal(env.buttons[0].textContent, 'Fullscreen');
});

test('where the browser has no fullscreen API the buttons are hidden', async () => {
  const { createFullscreen } = await load();
  const env = browser({ supported: false });
  const api = createFullscreen({ document: env.document });
  assert.equal(api.supported, false);
  assert.ok(env.buttons.every((b) => b.classList.contains('hidden')));
});
