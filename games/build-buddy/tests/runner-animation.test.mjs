import test from 'node:test';
import assert from 'node:assert/strict';
import { RunnerAnimation } from '../js/render/runner-animation.js';
import { createStateSyncMessage } from '../js/online-gameplay.js';
import { APP_SCREENS } from '../js/app-shell.js';
import { AppController } from '../js/app-controller.js';

const runner = (extra = {}) => ({ grounded: true, vx: 0, vy: 0, climbing: false, dead: false, ...extra });
test('run animation cycles through distinct frames with speed-sensitive timing', () => {
  const animation = new RunnerAnimation();
  const frames = new Set();
  for (let i = 0; i < 60; i++) { animation.update(runner({ vx: 400 }), 1/60); frames.add(animation.frame); }
  assert.deepEqual([...frames].sort(), [4,5,6,7]);
});
test('jump, fall and landing use their own poses before returning to idle', () => {
  const animation = new RunnerAnimation();
  animation.update(runner(), 1/60);
  animation.update(runner({ grounded: false, vy: -600 }), 1/60);
  assert.equal(animation.frame, 8);
  animation.update(runner({ grounded: false, vy: -300 }), .12);
  assert.equal(animation.frame, 9);
  animation.update(runner({ grounded: false, vy: 300 }), .1);
  assert.equal(animation.frame, 10);
  animation.update(runner(), 1/60);
  assert.equal(animation.frame, 11);
  animation.update(runner(), .2);
  assert.equal(animation.state, 'idle');
});
test('climbing freezes when holding still and resumes when moving', () => {
  const animation = new RunnerAnimation();
  animation.update(runner({ climbing: true, vy: -220 }), .2);
  const frame = animation.frame;
  animation.update(runner({ climbing: true }), 1);
  assert.equal(animation.frame, frame);
  animation.update(runner({ climbing: true, vy: -220 }), .15);
  assert.notEqual(animation.frame, frame);
});
test('animation frame advancement is independent of display rate', () => {
  const results = [30,60,144].map(fps => {
    const animation = new RunnerAnimation();
    for(let i=0;i<fps;i++) animation.update(runner({ vx: 320 }),1/fps);
    return animation.frame;
  });
  assert.equal(new Set(results).size, 1);
});

test('descending reverses the climbing cycle and holds the last grip when stopped', () => {
  const up = new RunnerAnimation(), down = new RunnerAnimation();
  up.update(runner({ climbing: true, vy: -180 }), .14);
  down.update(runner({ climbing: true, vy: 180 }), .14);
  assert.equal(up.frame, 13);
  assert.equal(down.frame, 15);
  down.update(runner({ climbing: true, vy: 0 }), .5);
  assert.equal(down.frame, 15);
});
test('online runner messages retain animation-driving motion flags', () => {
  const value = { x: 10, y: 20, facing: -1, grounded: true, climbing: false };
  for(const result of [createStateSyncMessage({ runner: value }).value.runner]) {
    assert.equal(result.facing, -1);
    assert.equal(result.grounded, true);
    assert.equal(result.climbing, false);
  }
});
test('only local setup renders two player pickers; online renders one', () => {
  const created = [];
  function element(tag) {
    const node = { tag, children: [], setAttribute(){}, addEventListener(){}, append(...items){ this.children.push(...items); } };
    created.push(node); return node;
  }
  const previous = globalThis.document;
  globalThis.document = { createElement: element, createElementNS: (_,tag) => element(tag) };
  try {
    const app = Object.assign(Object.create(AppController.prototype), {
      state: { players: [{ displayName:'A', characterId:'fox' },{ displayName:'B', characterId:'bear' }] },
      shellRoot: element('root'), pendingRoomCode: '',
    });
    app.renderModeSelect();
    assert.equal(created.filter(n => n.tag === 'fieldset').length,0);
    created.length = 0;
    app.renderLocalSetup();
    assert.equal(created.filter(n => n.tag === 'fieldset').length,2);
    created.length = 0;
    app.renderOnlineMenu();
    assert.equal(created.filter(n => n.tag === 'fieldset').length,1);
    assert.equal(APP_SCREENS.LOCAL_SETUP, 'local_setup');
  } finally { globalThis.document = previous; }
});
