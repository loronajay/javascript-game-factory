// The sound switch.
//
// There is more than one of these in the markup — one on the setup screen and
// one in the pause card — because the two moments a player reaches for a mute
// are "before I start" and "not right now". Both are the same setting, so this
// file exists to keep every copy of the button telling the same story.
//
// It does NOT handle the click. That still goes through the one delegated
// `[data-intent]` listener like every other button in the cabinet, so adding a
// third copy of the switch is markup and nothing else. This is a label, and
// labels are all it owns.

const SELECTOR = '[data-intent="toggle-sound"]';

export function createSoundToggle(root) {
  const buttons = [...root.querySelectorAll(SELECTOR)];

  return {
    /** Show the current state on every copy of the switch. */
    render(muted) {
      for (const button of buttons) {
        button.textContent = muted ? "Sound: Off" : "Sound: On";
        // `aria-pressed` tracks MUTED, so a screen reader hears the state of the
        // thing the button is for rather than the state of the button.
        button.setAttribute("aria-pressed", String(Boolean(muted)));
      }
    },
  };
}
