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
 * A typed character, or a backspace. Only ever queued while text capture is on.
 *
 * This is the one deliberate exception to "the stereo row means the same thing
 * everywhere". A room code is five characters from an alphabet containing B, N,
 * L, P and F, so typing one without suppressing the transport would pause the
 * music, skip a track and open a folder picker. The rule is worth keeping
 * precisely because breaking it is this visible — so it is broken in one narrow
 * mode, entered explicitly, rather than eroded screen by screen.
 */
export const ACTION_TEXT = "text";

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
  const heldMoves = new Set();
  let circuitShift = 0;
  let queue = [];
  // While a text field has focus, letters are letters. See ACTION_TEXT.
  let capturingText = false;

  const onKeyDown = (event) => {
    const code = event.code;

    // Text capture is checked before anything else, because its whole job is to
    // stop the keys below from meaning what they usually mean.
    if (capturingText && handleTextKey(event)) {
      return;
    }

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
    if (MOVE_KEYS[code]) heldMoves.add(MOVE_KEYS[code]);

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
      circuitShift = 1;
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

  /**
   * The keyboard while a field has focus. Returns true when the key has been
   * dealt with here and must not fall through to the game bindings.
   *
   * ENTER and ESC deliberately fall *through*: submitting and cancelling a field
   * are the same two keys they are everywhere else, and a field that swallowed
   * them would need its own way out.
   */
  function handleTextKey(event) {
    if (CONFIRM_KEYS.has(event.code) || CANCEL_KEYS.has(event.code)) {
      return false;
    }
    onActivity();
    if (event.code === "Backspace") {
      event.preventDefault();
      if (!event.repeat) queue.push({ type: ACTION_TEXT, backspace: true });
      return true;
    }
    // One printable character. `event.key` rather than `event.code`, because
    // here the player means the letter they see on the keycap, not the physical
    // key — the opposite of every other binding in this file.
    if (event.key && event.key.length === 1) {
      event.preventDefault();
      if (!event.repeat) queue.push({ type: ACTION_TEXT, char: event.key });
      return true;
    }
    // Everything else — arrows, function keys, modifiers — is swallowed so a
    // stray key cannot reach the stereo or move a cursor behind the field.
    return true;
  }

  const onKeyUp = (event) => {
    held.delete(event.code);
    if (MOVE_KEYS[event.code]) heldMoves.delete(MOVE_KEYS[event.code]);
  };

  const onBlur = () => {
    held.clear(); // never leave the throttle stuck on after an alt-tab
    heldMoves.clear();
    circuitShift = 0;
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);

  return {
    /**
     * Puts the keyboard into (or out of) text capture. The throttle is released
     * on the way in: a field cannot be typed into with a foot on the gas, and a
     * key held down when the mode changed would otherwise stay held forever.
     */
    setTextCapture(enabled) {
      capturingText = !!enabled;
      if (capturingText) held.clear();
      if (capturingText) heldMoves.clear();
      if (capturingText) circuitShift = 0;
    },
    capturingText() {
      return capturingText;
    },
    throttle() {
      return held.size > 0 ? 1 : 0;
    },
    circuitControls() {
      const forward = held.size > 0 || heldMoves.has("up");
      const braking = heldMoves.has("down");
      const shift = circuitShift;
      circuitShift = 0;
      return {
        throttle: forward && !braking ? 1 : 0,
        brake: braking ? 1 : 0,
        steer: heldMoves.has("left") === heldMoves.has("right")
          ? 0
          : heldMoves.has("left") ? -1 : 1,
        shift,
      };
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
