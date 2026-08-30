const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const url = require('node:url');

const logic = require('../menu-logic.js');

// A caught single-player round paints `#caughtOverlay` at its own z-index, above the menu overlay, so
// a pause menu behind it is unreachable. These tests pin down the way out: Esc and an explicit
// button on that screen both quit to the title.

const focusLog = [];

function element(id = null) {
  const listeners = new Map();
  const el = {
    textContent: '',
    dataset: {},
    firstChild: { textContent: '' },
    classList: {
      set: new Set(),
      add(n) { this.set.add(n); },
      remove(n) { this.set.delete(n); },
      contains(n) { return this.set.has(n); },
      toggle(n, force) { const on = force === undefined ? !this.set.has(n) : force; if (on) this.set.add(n); else this.set.delete(n); },
    },
    listeners,
    addEventListener(name, handler) { listeners.set(name, [...(listeners.get(name) || []), handler]); },
    fire(name, event = {}) { for (const handler of listeners.get(name) || []) handler(event); },
    id,
    querySelector() { return element(); },
    focus() { focusLog.push(el.id); },
  };
  return el;
}

function harness() {
  const elements = new Map();
  const getElementById = (id) => { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); };
  const winListeners = new Map();
  let reloads = 0;
  const window = {
    location: { reload() { reloads += 1; } },
    addEventListener(name, handler) { winListeners.set(name, [...(winListeners.get(name) || []), handler]); },
    fire(name, event = {}) { for (const handler of winListeners.get(name) || []) handler(event); },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    dispatchEvent(event) { this.fire(event.type, event); },
  };
  const document = { getElementById };
  return { elements, window, document, get reloads() { return reloads; } };
}

async function createMenu(env) {
  const moduleUrl = url.pathToFileURL(path.resolve(__dirname, '..', 'modules', 'menu.js')).href;
  const { createMenu } = await import(moduleUrl);
  return createMenu({ logic, document: env.document, window: env.window, onPlay: () => {}, onStartSingle: () => {} });
}

test('Esc on the end-of-round overlay quits to the title', async () => {
  const env = harness();
  const menu = await createMenu(env);
  menu.dispatch(logic.ACTIONS.SINGLE_PLAYER);
  menu.dispatch(logic.ACTIONS.PLAY);

  // The round ends: round.js shows the overlay and fires hotel:caught.
  env.elements.get('caughtOverlay').classList.add('visible');
  env.window.fire('hotel:caught', { detail: {} });
  assert.equal(menu.getScreen(), logic.SCREENS.CAUGHT);

  env.window.fire('keydown', { key: 'Escape' });
  assert.equal(env.reloads, 1);
});

test('the explicit QUIT TO TITLE button on the caught overlay leaves the round', async () => {
  const env = harness();
  const menu = await createMenu(env);
  menu.dispatch(logic.ACTIONS.SINGLE_PLAYER);
  menu.dispatch(logic.ACTIONS.PLAY);
  env.elements.get('caughtOverlay').classList.add('visible');
  env.window.fire('hotel:caught', { detail: {} });

  env.elements.get('caughtQuitBtn').fire('click');
  assert.equal(env.reloads, 1);
});

test('Esc does nothing destructive while the caught overlay is hidden', async () => {
  const env = harness();
  const menu = await createMenu(env);
  menu.dispatch(logic.ACTIONS.SINGLE_PLAYER);
  menu.dispatch(logic.ACTIONS.PLAY);

  env.window.fire('keydown', { key: 'Escape' });
  assert.equal(env.reloads, 0);
  assert.equal(menu.getScreen(), logic.SCREENS.PLAYING);
});

test('a hider eliminated mid-round keeps a working pause menu', async () => {
  const env = harness();
  const menu = await createMenu(env);
  menu.dispatch(logic.ACTIONS.SINGLE_PLAYER);
  menu.dispatch(logic.ACTIONS.PLAY);

  // The demon takes the local hider while other guests are still hiding: `modules/monster.js` reports
  // the catch, `modules/round.js` puts the player into spectator mode, and the round carries on. The
  // caught overlay is never shown, so the menu must not move to its CAUGHT screen either.
  env.window.fire('hotel:caught', { detail: { demon: 'The Bellhop', roundOver: false } });
  assert.equal(menu.getScreen(), logic.SCREENS.PLAYING);

  // Releasing the pointer is a pause, exactly as it is for a living player.
  menu.dispatch(logic.ACTIONS.PAUSE);
  assert.equal(menu.getScreen(), logic.SCREENS.PAUSE);
  assert.equal(env.elements.get('overlay').classList.contains('hidden'), false);
});

// Every setup and lobby screen opens with the back arrow as its first button. Focusing it meant a
// Space or an Enter pressed anywhere while reading the options was a click on "back to main menu" —
// the random kick to the title players hit while setting a match up.
test('a screen focuses its panel, never the back arrow on it', async () => {
  const env = harness();
  focusLog.length = 0;
  const menu = await createMenu(env);

  menu.dispatch(logic.ACTIONS.SINGLE_PLAYER);
  assert.equal(menu.getScreen(), logic.SCREENS.SOLO_SETUP);
  assert.equal(focusLog.at(-1), 'menuSoloSetup');
  assert.equal(env.elements.get('menuSoloSetup').tabIndex, -1, 'the panel has to be focusable to hold focus');

  // Space with nothing armed is not a menu action, so the screen stays put.
  env.elements.get('overlay').fire('click', { target: {}, preventDefault() {} });
  assert.equal(menu.getScreen(), logic.SCREENS.SOLO_SETUP);

  menu.dispatch(logic.ACTIONS.BACK);
  menu.dispatch(logic.ACTIONS.ONLINE);
  assert.equal(focusLog.at(-1), 'menuOnlineSetup');
});
