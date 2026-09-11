// Fullscreen, and the one fallback it needs.
//
// The Fullscreen API is asked first, on the DOCUMENT rather than on the canvas
// or the app shell: the pause modal, the result card and the front door are all
// siblings of `#app`, and a fullscreen element hides everything outside itself,
// so a match paused in fullscreen would have no visible way back. The document
// goes fullscreen and `body.fullscreen` is what lays the cabinet out for it.
//
// THE FALLBACK IS THE SAME CLASS. iPhone Safari has no element fullscreen at
// all, and any browser may refuse the request; either way the cabinet pins
// `#app` to the viewport with CSS and the player gets the same layout with the
// browser chrome still showing. The button reads the same in both, because to
// the player it is the same thing.

/** The button's label, from whether the cabinet is fullscreen now. */
export function fullscreenLabel(active) {
  return active ? "Exit fullscreen" : "Fullscreen";
}

export function createFullscreen({ doc = globalThis.document, onChange } = {}) {
  const root = doc?.documentElement;
  const supported = typeof root?.requestFullscreen === "function" && typeof doc?.exitFullscreen === "function";
  /** The CSS-only mode, entered when the API is missing or said no. */
  let pseudo = false;

  const isActive = () => pseudo || Boolean(doc?.fullscreenElement);

  function paint() {
    doc?.body?.classList.toggle("fullscreen", isActive());
    onChange?.(isActive());
  }

  async function enter() {
    if (supported) {
      try {
        await root.requestFullscreen({ navigationUI: "hide" });
      } catch {
        pseudo = true;
      }
    } else {
      pseudo = true;
    }
    paint();
  }

  async function exit() {
    pseudo = false;
    if (doc?.fullscreenElement) {
      try {
        await doc.exitFullscreen();
      } catch {
        /* already out; the change event will not fire, so paint below */
      }
    }
    paint();
  }

  // Escape, the browser's own gesture, and a tab switch all leave fullscreen
  // without asking this module. The class follows the document, not the button.
  doc?.addEventListener?.("fullscreenchange", paint);

  return {
    isActive,
    enter,
    exit,
    toggle: () => (isActive() ? exit() : enter()),
    destroy() {
      doc?.removeEventListener?.("fullscreenchange", paint);
    },
  };
}
