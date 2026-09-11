import test from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from '../js/app-controller.js';
import { APP_SCREENS } from '../js/app-shell.js';

test('local pause stops simulation ticks but online menu keeps the match running', () => {
  let ticks = 0;
  const app = Object.assign(Object.create(AppController.prototype), {
    state: { screen: APP_SCREENS.GAMEPLAY }, game: { update: () => ticks++ },
    pauseMenu: { opened: true },
  });
  app.updateGameplayTick();
  assert.equal(ticks, 0);
  app.pauseMenu.opened = false;
  app.updateGameplayTick();
  assert.equal(ticks, 1);
  app.pauseMenu.opened = true;
  app.state.onlineGameplay = { isHost: true };
  app.onlineTick = 0; app.onlineSnapshotTick = 0;
  app.updateGameplayTick();
  assert.equal(ticks, 2);
});

import { PauseMenu } from '../js/pause-menu.js';
import { Input } from '../js/input.js';

test('pause resumes the same game and Main Menu leaves an online match', () => {
  const element = () => ({ hidden: false, handlers: {}, children: {},
    addEventListener(type, fn) { this.handlers[type] = fn; },
    setAttribute() {}, append() {}, focus() {},
    querySelector(key) { return this.children[key] ??= element(); },
  });
  globalThis.document = { createElement: element };
  globalThis.window = { addEventListener() {} };
  const enabled = [];
  let left = 0;
  const app = {
    state: { screen: APP_SCREENS.GAMEPLAY },
    canvas: { parentElement: element() }, mobileControls: {}, viewModeControls: {},
    game: { input: { setEnabled: value => enabled.push(value) } },
    onlineClient: { leaveLobby: () => left++ },
    setState(state) { this.pauseMenu.close(); this.state = state; },
  };
  app.pauseMenu = new PauseMenu(app);
  const game = app.game;
  app.pauseMenu.open();
  assert.equal(app.pauseMenu.overlay.hidden, false);
  app.pauseMenu.resume.handlers.click();
  assert.equal(app.game, game);
  assert.equal(app.pauseMenu.opened, false);
  assert.deepEqual(enabled, [false, true]);
  app.state.onlineGameplay = { isHost: true };
  app.pauseMenu.open();
  app.pauseMenu.menu.handlers.click();
  assert.equal(app.state.screen, APP_SCREENS.MAIN_MENU);
  assert.equal(left, 1);
});

test('input disabling clears held actions and disposal removes listeners', () => {
  const handlers = new Map();
  const target = { addEventListener(type, fn) { handlers.set(type, fn); }, removeEventListener(type) { handlers.delete(type); } };
  globalThis.window = target;
  globalThis.document = { querySelectorAll: () => [] };
  const input = new Input(target);
  handlers.get('keydown')({ code: 'KeyD' });
  assert.equal(input.axisX(), 1);
  input.taps.add('jump');
  input.setEnabled(false);
  handlers.get('keydown')({ code: 'KeyD' });
  assert.equal(input.axisX(), 0);
  assert.equal(input.consumeJumpPressed(), false);
  input.setEnabled(true);
  assert.equal(input.axisX(), 0);
  input.dispose();
  assert.equal(handlers.size, 0);
});
