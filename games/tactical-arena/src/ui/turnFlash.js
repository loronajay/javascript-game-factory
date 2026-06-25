// Turn-change announcer (ported from Mini-Tactics). Fires a brief faction-tinted
// sweep across the board stage whenever the squad turn passes, so each hand-off
// reads as a deliberate beat — most useful in hot-seat ("pass the device"). It is
// also reused for the victory banner. Presentation only: never blocks input/rules.
const VISIBLE_MS = 1150;

export class TurnAnnouncer {
  constructor(root) {
    this.root = root;
    this.titleEl = root.querySelector(".turn-flash-title");
    this.subEl = root.querySelector(".turn-flash-sub");
    this.timer = 0;
  }

  // Show "<title>" / "<sub>" tinted by `color` for a beat, then clear. A new
  // announcement during the window restarts the entrance cleanly. `hold` keeps it
  // on screen (used for the victory banner, which should linger).
  announce({ title, sub = "", color, hold = false }) {
    this.titleEl.textContent = title;
    this.subEl.textContent = sub;
    if (color) this.root.style.setProperty("--team", color);
    else this.root.style.removeProperty("--team");

    this.root.classList.remove("show");
    void this.root.offsetWidth; // force reflow so the transition replays
    this.root.classList.add("show");

    window.clearTimeout(this.timer);
    if (!hold) this.timer = window.setTimeout(() => this.root.classList.remove("show"), VISIBLE_MS);
  }

  clear() {
    window.clearTimeout(this.timer);
    this.root.classList.remove("show");
  }
}
