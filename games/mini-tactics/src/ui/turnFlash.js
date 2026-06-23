// Turn-change announcer. Fires a brief faction-tinted sweep across the board
// stage whenever the squad turn passes, so each hand-off reads as a deliberate
// beat — most useful in hot-seat ("pass the device"), but it punctuates CPU and
// online hand-offs too. Presentation only: it never blocks input or rules.
//
// Kept as a tiny injected service (like MessageController) rather than folded
// into the HUD renderer, because it is event-driven, not state-derived.
const VISIBLE_MS = 1150;

export class TurnAnnouncer {
  constructor(root) {
    this.root = root;
    this.titleEl = root.querySelector(".turn-flash-title");
    this.subEl = root.querySelector(".turn-flash-sub");
    this.timer = 0;
  }

  // Show "<title>" / "<sub>" tinted by `color` for a beat, then clear. A new
  // announcement during the window restarts cleanly.
  announce({ title, sub = "", color }) {
    this.titleEl.textContent = title;
    this.subEl.textContent = sub;

    if (color) {
      this.root.style.setProperty("--team", color);
    } else {
      this.root.style.removeProperty("--team");
    }

    // Re-trigger the entrance even if already showing.
    this.root.classList.remove("show");
    // Force reflow so removing then adding `show` replays the transition.
    void this.root.offsetWidth;
    this.root.classList.add("show");

    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.root.classList.remove("show");
    }, VISIBLE_MS);
  }
}
