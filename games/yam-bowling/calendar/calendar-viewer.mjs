// The wall-calendar viewer. It paints one physical object -- a top-bound calendar hanging on
// a wall -- and turns its pages. It reads the ordered manifest and nothing else: it never
// builds an asset path, and it holds no commerce state.
//
// The open form is two stacked half-pages with the binding between them: artwork above, grid
// below, which is how the real 11x17 hangs. A page turn lifts the lower sheet up and over
// that binding, because that is the motion the real object makes.

import { CALENDAR_PAGES, pageImages, preloadTargets } from "./calendar-manifest.mjs";

const FLIP_MS = 620;

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

function sheetMarkup(entry) {
  if (!entry) return "";
  if (entry.kind === "month") {
    return `
      <div class="cal-half cal-half-art">
        <img src="${entry.artwork}" alt="${entry.label} ${entry.bowlerName} artwork" draggable="false">
      </div>
      <div class="cal-binding" aria-hidden="true"></div>
      <div class="cal-half cal-half-grid">
        <img src="${entry.grid}" alt="${entry.label} 2027 calendar grid" draggable="false">
      </div>`;
  }
  return `
    <div class="cal-half cal-half-single">
      <img src="${entry.image}" alt="${entry.label}" draggable="false">
    </div>`;
}

const preloaded = new Set();

function preload(index) {
  for (const src of preloadTargets(index)) {
    if (preloaded.has(src)) continue;
    preloaded.add(src);
    const image = new Image();
    image.decoding = "async";
    image.src = src;
  }
}

export function createCalendarViewer({
  mount,
  pages = CALENDAR_PAGES,
  startIndex = 0,
  reducedMotion = false,
  onChange = () => {},
} = {}) {
  if (!mount) throw new Error("calendar viewer needs a mount element");

  let index = Math.min(Math.max(0, startIndex), pages.length - 1);
  let turning = false;
  const listeners = [];

  mount.classList.add("cal-viewer");
  mount.innerHTML = `
    <div class="cal-wall">
      <div class="cal-hanger" aria-hidden="true"></div>
      <div class="cal-object" id="cal-object" tabindex="0" role="group"
           aria-label="Yam Bowling 2027 calendar preview" aria-live="polite">
        <div class="cal-stack"></div>
        <div class="cal-flip" aria-hidden="true"></div>
      </div>
    </div>
    <div class="cal-controls">
      <button type="button" class="cal-step" data-step="-1" aria-label="Previous page">
        <span aria-hidden="true">&#8592;</span>
      </button>
      <p class="cal-readout"><strong class="cal-title"></strong><span class="cal-sub"></span></p>
      <button type="button" class="cal-step" data-step="1" aria-label="Next page">
        <span aria-hidden="true">&#8594;</span>
      </button>
    </div>
    <div class="cal-rail" role="tablist" aria-label="Jump to a month"></div>`;

  const object = mount.querySelector(".cal-object");
  const stack = mount.querySelector(".cal-stack");
  const flip = mount.querySelector(".cal-flip");
  const title = mount.querySelector(".cal-title");
  const sub = mount.querySelector(".cal-sub");
  const rail = mount.querySelector(".cal-rail");
  const steps = [...mount.querySelectorAll(".cal-step")];

  rail.append(...pages.map((entry, position) => {
    const button = el("button", "cal-chip");
    button.type = "button";
    button.dataset.index = String(position);
    button.setAttribute("role", "tab");
    button.textContent = entry.shortLabel;
    button.title = entry.label;
    return button;
  }));
  const chips = [...rail.querySelectorAll(".cal-chip")];

  function paint() {
    const entry = pages[index];
    stack.innerHTML = sheetMarkup(entry);
    object.classList.toggle("is-open", entry.kind === "month");
    title.textContent = entry.kind === "month" ? `${entry.label} 2027` : entry.label;
    sub.textContent = entry.kind === "month" ? entry.bowlerName : "Yam Bowling 2027";
    steps[0].disabled = index === 0;
    steps[1].disabled = index === pages.length - 1;
    chips.forEach((chip, position) => {
      const active = position === index;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-selected", String(active));
    });
    preload(index);
    onChange({ index, page: entry });
  }

  // Turn to `next`. The outgoing sheet is painted into the flip layer and rotated over the
  // binding; the incoming page is already underneath, so the reveal needs no second paint.
  function goTo(next, { animate = true } = {}) {
    const target = Math.min(Math.max(0, next), pages.length - 1);
    if (turning || target === index) return false;
    const forward = target > index;
    const outgoing = pages[index];
    index = target;

    if (!animate || reducedMotion) {
      paint();
      return true;
    }

    turning = true;
    flip.innerHTML = sheetMarkup(outgoing);
    // The outgoing sheet's own geometry decides where the hinge is: a cover is the whole
    // closed object and lifts from its top binding, a month sheet is the lower half and
    // lifts over the mid binding.
    flip.dataset.kind = outgoing.kind;
    flip.className = `cal-flip is-turning ${forward ? "turn-forward" : "turn-back"}`;
    paint();
    window.setTimeout(() => {
      flip.className = "cal-flip";
      flip.innerHTML = "";
      turning = false;
    }, FLIP_MS);
    return true;
  }

  function on(node, type, handler, options) {
    node.addEventListener(type, handler, options);
    listeners.push(() => node.removeEventListener(type, handler, options));
  }

  steps.forEach((button) => on(button, "click", () => {
    goTo(index + Number(button.dataset.step));
  }));
  chips.forEach((chip) => on(chip, "click", () => goTo(Number(chip.dataset.index))));

  on(object, "keydown", (event) => {
    const back = event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "PageUp";
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "PageDown";
    if (!back && !forward && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (event.key === "Home") goTo(0);
    else if (event.key === "End") goTo(pages.length - 1);
    else goTo(index + (forward ? 1 : -1));
  });

  // Clicking the object advances, which is how a curious visitor opens the cover without
  // reading any instructions. The buttons stay the guaranteed path.
  on(object, "click", () => goTo(index + 1));

  // Swipe supplements the buttons and is never the only way through: a horizontal drag pages
  // like a book, a vertical one lifts the sheet the way the real calendar moves.
  let start = null;
  on(object, "touchstart", (event) => {
    const touch = event.changedTouches[0];
    start = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  on(object, "touchend", (event) => {
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    start = null;
    const primary = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    if (Math.abs(primary) < 40) return;
    goTo(index + (primary < 0 ? 1 : -1));
  }, { passive: true });

  paint();

  return {
    goTo,
    next: () => goTo(index + 1),
    prev: () => goTo(index - 1),
    getState: () => ({ index, page: pages[index] }),
    destroy() {
      listeners.forEach((off) => off());
      listeners.length = 0;
      mount.innerHTML = "";
      mount.classList.remove("cal-viewer");
    },
  };
}
