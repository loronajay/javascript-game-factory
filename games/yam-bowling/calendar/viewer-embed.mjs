// The embeddable viewer page: mounts the calendar viewer and nothing else. No account, no
// price lookup, no buy button -- the Arcade Room shows this in an overlay and a shopper who
// wants the real thing follows the link to the preorder page in its own tab.

import { CALENDAR_PAGES } from "./calendar-manifest.mjs";
import { createCalendarViewer } from "./calendar-viewer.mjs";

function prefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

const viewer = createCalendarViewer({
  mount: document.getElementById("calendarViewer"),
  pages: CALENDAR_PAGES,
  reducedMotion: prefersReducedMotion(),
});

// The room hands focus to this frame when it opens; put it on the calendar so the arrow
// keys page straight away without a click.
document.querySelector(".cal-object")?.focus({ preventScroll: true });

// Left/right anywhere in the frame page the calendar, so focus landing on the shop link
// does not strand the keyboard.
window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLElement && event.target.closest(".cal-object")) return;
  if (event.key === "ArrowLeft") viewer.prev();
  else if (event.key === "ArrowRight") viewer.next();
  else return;
  event.preventDefault();
});
