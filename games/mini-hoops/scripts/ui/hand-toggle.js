// The shooting-hand switch.
//
// Sideways, the court and the shot panel sit side by side, so the ball cannot be
// in the middle of the screen — it is about 104px to one side, which is the
// difference between shooting with the thumb you shoot with and the one you do
// not. This switch says which side the court goes.
//
// Written as the sibling of `sound-toggle.js` and for the same reasons: there is
// more than one copy of the button in the markup, the click still goes through
// the one delegated `[data-intent]` listener, and adding a third copy is markup
// and nothing else.
//
// It owns ONE thing this file's sibling does not: the `data-hand` attribute the
// stylesheet keys the landscape layout off. That belongs here rather than in the
// composition root because it is the whole of what the setting does — there is
// no game state behind it, and nothing under `sim/` is ever told about it.

const SELECTOR = '[data-intent="toggle-hand"]';

const LABELS = {
  right: "Shoot: Right",
  left: "Shoot: Left",
};

export function createHandToggle(root, target = root) {
  const buttons = [...root.querySelectorAll(SELECTOR)];

  return {
    /** Put the current hand on every copy of the switch, and on the layout. */
    render(hand) {
      const resolved = hand === "left" ? "left" : "right";
      // The attribute is what actually moves the court. Set before the labels so
      // a stylesheet that has not loaded yet still lands on the right side.
      target?.setAttribute?.("data-hand", resolved);
      for (const button of buttons) {
        button.textContent = LABELS[resolved];
        // `aria-pressed` tracks LEFT-handed, the non-default, so a screen reader
        // hears "not pressed" for the layout most players never change.
        button.setAttribute("aria-pressed", String(resolved === "left"));
      }
    },
  };
}
