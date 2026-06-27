// Shared penalty gamepad — the controller half's physical shell for every QD
// penalty (ported from penalty-game-controller-reference.html). Renders a landscape
// pad and calls back with a standard input token on each press. Penalties decide
// which buttons are lit and what the overlay says; the pad itself never changes.
//
// Input tokens: Up Down Left Right · A B X Y · L R · Start Select
import { escapeHtml } from "../../jaybox-client-model.mjs";

const KEY_MAP = {
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
  w: "Up", s: "Down", a: "Left", d: "Right",
  j: "A", k: "B", u: "X", i: "Y",
  q: "L", e: "R",
  Enter: "Start", Shift: "Select",
};

// One window-level keyboard listener for the lifetime of the page; it routes to
// whichever gamepad is currently mounted (or nothing). Pointer listeners live on
// the rendered buttons, so they are garbage-collected when the shell re-renders.
let activeOnPress = null;
let keyboardBound = false;

function button(input, label, classes = "") {
  return `<button class="qd-pad-key ${classes}" data-pad-input="${escapeHtml(input)}" type="button"><span>${escapeHtml(label)}</span></button>`;
}

export function renderGamepad(litButtons = []) {
  const lit = new Set(litButtons);
  const k = (input, label, classes = "") => button(input, label, `${classes} ${lit.has(input) ? "lit" : ""}`);
  return `<div class="qd-gamepad" aria-label="Penalty controller">
    <div class="qd-grip qd-grip-left">
      ${k("L", "L", "qd-shoulder")}
      <div class="qd-dpad">
        ${k("Up", "▲", "qd-d up")}
        ${k("Left", "◀", "qd-d left")}
        ${k("Right", "▶", "qd-d right")}
        ${k("Down", "▼", "qd-d down")}
      </div>
    </div>
    <div class="qd-mid">
      ${k("Select", "Select", "qd-system")}
      <div class="qd-logo">QD</div>
      ${k("Start", "Start", "qd-system")}
    </div>
    <div class="qd-grip qd-grip-right">
      ${k("R", "R", "qd-shoulder")}
      <div class="qd-faces">
        ${k("Y", "Y", "qd-face y")}
        ${k("X", "X", "qd-face x")}
        ${k("A", "A", "qd-face a")}
        ${k("B", "B", "qd-face b")}
      </div>
    </div>
  </div>`;
}

function flash(el) {
  if (!el) return;
  el.classList.add("pressed");
  setTimeout(() => el.classList.remove("pressed"), 130);
}

function buzz(input) {
  if (!navigator.vibrate) return;
  const face = input === "A" || input === "B" || input === "X" || input === "Y";
  navigator.vibrate(face ? 16 : 9);
}

// Attach the mounted gamepad to onPress. Idempotent per render: pointer handlers
// bind to the freshly rendered buttons; the keyboard handler binds once globally.
export function wireGamepad(app, onPress) {
  const root = app.querySelector(".qd-gamepad");
  if (!root) { activeOnPress = null; return; }
  activeOnPress = onPress;

  root.querySelectorAll("[data-pad-input]").forEach((el) => {
    el.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const input = el.dataset.padInput;
      flash(el);
      buzz(input);
      activeOnPress?.(input);
    });
    el.addEventListener("contextmenu", (event) => event.preventDefault());
  });

  if (!keyboardBound) {
    keyboardBound = true;
    window.addEventListener("keydown", (event) => {
      if (event.repeat || !activeOnPress) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const input = KEY_MAP[key];
      if (!input) return;
      event.preventDefault();
      flash(document.querySelector(`.qd-gamepad [data-pad-input="${CSS.escape(input)}"]`));
      buzz(input);
      activeOnPress(input);
    }, { passive: false });
  }
}

// Stop routing keyboard input to a now-unmounted gamepad.
export function unwireGamepad() {
  activeOnPress = null;
}
