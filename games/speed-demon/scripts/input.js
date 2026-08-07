// Keyboard input.
//
// Discrete actions are queued rather than applied immediately: the game loop
// drains them inside tick(), so input lands on a tick boundary and the sim stays
// deterministic. Held state (the throttle) is sampled instead, since it is a
// level rather than an event.
//
// The actions are deliberately named for what the key *is*, not for what the
// current screen does with it — CONFIRM, not "start", because the same key
// starts the game, picks a mode, stages the car and works the clutch. The screen
// decides; this file does not. An earlier version queued two actions for ENTER
// so that one key could mean two things, and every new screen had to remember to
// ignore one of them.

export const ACTION_CONFIRM = "confirm";
export const ACTION_CANCEL = "cancel";
export const ACTION_MOVE = "move";
export const ACTION_SHIFT = "shift";
export const ACTION_RESTART = "restart";
/** A stereo button. Carries which one in `control`. */
export const ACTION_STEREO = "stereo";

/**
 * The stereo row.
 *
 * These are the one group of keys that mean the same thing on every screen — a
 * car stereo does not stop being a car stereo because you are staging — so
 * unlike CONFIRM and MOVE they carry their meaning in the action rather than
 * leaving it to the screen. That is not a break with the naming rule above: the
 * key *is* the button, and there is nothing for a screen to reinterpret.
 *
 * **They are letters you can guess.** The first cut of this put the transport on
 * `[ ] \ ' ;` — contiguous on the keyboard, and completely undiscoverable. A
 * control nobody can find is a control that does not exist, and punctuation has
 * no mnemonic to fall back on. `B`ack, `P`lay, `N`ext, `L`oop, and `0` for back
 * to 0:00 can all be guessed from the button captions alone. `,` and `.` come
 * along as aliases because their keycaps carry the ◀◀ / ▶▶ glyphs and half the
 * world already skips tracks with them.
 *
 * Keyed by `event.code`, so they stay on the same physical keys whatever layout
 * the player types in.
 */
export const STEREO_KEYS = {
  KeyB: "previous",
  Comma: "previous",
  KeyP: "playPause",
  KeyN: "next",
  Period: "next",
  Digit0: "restartTrack",
  KeyL: "loop",
  Minus: "volumeDown",
  Equal: "volumeUp",
  KeyF: "folder",
};

const MOVE_KEYS = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
};

const CONFIRM_KEYS = new Set(["Enter"]);
const SHIFT_KEYS = new Set(["ShiftLeft", "ShiftRight"]);
const CANCEL_KEYS = new Set(["Escape"]);
const THROTTLE_KEYS = new Set(["Space"]);

export function createInput(target = window, onActivity = () => {}) {
  const held = new Set();
  let queue = [];

  const onKeyDown = (event) => {
    const code = event.code;
    // Ctrl/Alt/Cmd combinations belong to the browser — zoom is Ctrl+Minus, and
    // swallowing it here would be the game deciding it owns a shortcut it does
    // not. Shift is deliberately not checked: it is the clutch.
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    const stereo = STEREO_KEYS[code];
    const recognized = THROTTLE_KEYS.has(code)
      || CONFIRM_KEYS.has(code)
      || SHIFT_KEYS.has(code)
      || MOVE_KEYS[code]
      || CANCEL_KEYS.has(code)
      || stereo
      || code === "KeyR";

    if (recognized) {
      // Runs inside the trusted key event, which is where browsers allow the
      // audio layer to satisfy their autoplay policy.
      onActivity();
    }

    if (recognized && !CANCEL_KEYS.has(code)) {
      event.preventDefault(); // space scrolls the page, arrows scroll the strip
    }

    if (THROTTLE_KEYS.has(code)) {
      held.add(code);
    }

    if (event.repeat) {
      // Auto-repeat must never fake extra gate moves. Volume is the one
      // exception, because it is a level rather than an event and holding the
      // key to run it up is what a volume key is for.
      if (stereo === "volumeUp" || stereo === "volumeDown") {
        queue.push({ type: ACTION_STEREO, control: stereo });
      }
      return;
    }

    // Staging is deliberately NOT bound to the throttle key. If it were, holding
    // the throttle to stage would still be held when the tree ran down and every
    // launch would foul.
    if (CONFIRM_KEYS.has(code)) {
      queue.push({ type: ACTION_CONFIRM });
    }
    if (SHIFT_KEYS.has(code)) {
      queue.push({ type: ACTION_SHIFT });
    }
    if (MOVE_KEYS[code]) {
      queue.push({ type: ACTION_MOVE, direction: MOVE_KEYS[code] });
    }
    if (CANCEL_KEYS.has(code)) {
      queue.push({ type: ACTION_CANCEL });
    }
    if (code === "KeyR") {
      queue.push({ type: ACTION_RESTART });
    }
    if (stereo) {
      queue.push({ type: ACTION_STEREO, control: stereo });
    }
  };

  const onKeyUp = (event) => {
    held.delete(event.code);
  };

  const onBlur = () => {
    held.clear(); // never leave the throttle stuck on after an alt-tab
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);

  return {
    throttle() {
      return held.size > 0 ? 1 : 0;
    },
    drain() {
      const actions = queue;
      queue = [];
      return actions;
    },
    destroy() {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
    },
  };
}
