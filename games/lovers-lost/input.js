// input.js — keyboard input mapping for Lovers Lost
// No DOM wiring here — attach keydown/keyup to window in game.js.
// For online mode use injectAction / clearAction instead.
'use strict';

// ─── Key map ──────────────────────────────────────────────────────────────────
// boy:  W=jump  S=crouch  D=attack  A=block
// girl: ArrowUp=jump  ArrowDown=crouch  ArrowLeft=attack  ArrowRight=block

const KEY_MAP = {
  w:          { side: 'boy',  action: 'jump'   },
  s:          { side: 'boy',  action: 'crouch' },
  d:          { side: 'boy',  action: 'attack' },
  a:          { side: 'boy',  action: 'block'  },
  ArrowUp:    { side: 'girl', action: 'jump'   },
  ArrowDown:  { side: 'girl', action: 'crouch' },
  ArrowLeft:  { side: 'girl', action: 'attack' },
  ArrowRight: { side: 'girl', action: 'block'  },
};

// ─── keyToAction ─────────────────────────────────────────────────────────────
// Pure function. Normalises single-character keys to lowercase.
// Returns { side, action } or null.

function keyToAction(key) {
  if (!key) return null;
  const normalised = key.length === 1 ? key.toLowerCase() : key;
  return KEY_MAP[normalised] || null;
}

// ─── createInput ─────────────────────────────────────────────────────────────
// Factory that tracks held and pressed state per (side, action) pair.
//
//   inp.keydown(key)               — call from keydown event handler
//   inp.keyup(key)                 — call from keyup event handler
//   inp.tick()                     — call once per game frame; clears pressed
//   inp.isHeld(side, action)       — true while key is physically down
//   inp.isPressed(side, action)    — true for the single frame the key was pressed
//   inp.injectAction(side, action) — online mode: set as if remote player pressed
//   inp.clearAction(side, action)  — online mode: clear as if remote player released

function createInput() {
  // held[side][action] = bool
  // pressed[side][action] = bool
  const held    = { boy: {}, girl: {} };
  const pressed = { boy: {}, girl: {} };

  function keydown(key) {
    const mapping = keyToAction(key);
    if (!mapping) return;
    const { side, action } = mapping;
    if (!held[side][action]) {
      // Only mark pressed on the initial keydown, not on browser key-repeat
      pressed[side][action] = true;
    }
    held[side][action] = true;
  }

  function keyup(key) {
    const mapping = keyToAction(key);
    if (!mapping) return;
    const { side, action } = mapping;
    held[side][action] = false;
  }

  function tick() {
    held.boy.jump    && (pressed.boy.jump    = false);
    held.boy.crouch  && (pressed.boy.crouch  = false);
    held.boy.attack  && (pressed.boy.attack  = false);
    held.boy.block   && (pressed.boy.block   = false);
    held.girl.jump   && (pressed.girl.jump   = false);
    held.girl.crouch && (pressed.girl.crouch = false);
    held.girl.attack && (pressed.girl.attack = false);
    held.girl.block  && (pressed.girl.block  = false);
    // Clear pressed for released keys too
    for (const side of ['boy', 'girl']) {
      for (const action of ['jump', 'crouch', 'attack', 'block']) {
        if (!held[side][action]) pressed[side][action] = false;
      }
    }
  }

  function isHeld(side, action) {
    return !!held[side][action];
  }

  function isPressed(side, action) {
    return !!pressed[side][action];
  }

  function injectAction(side, action) {
    held[side][action]    = true;
    pressed[side][action] = true;
  }

  function clearAction(side, action) {
    held[side][action] = false;
  }

  return { keydown, keyup, tick, isHeld, isPressed, injectAction, clearAction };
}

// ─── Export ───────────────────────────────────────────────────────────────────
if (typeof module !== 'undefined') {
  module.exports = { keyToAction, createInput };
} else {
  window.keyToAction = keyToAction;
  window.createInput = createInput;
}
