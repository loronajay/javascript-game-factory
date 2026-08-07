// The vocabulary the folder layer and the display share.
//
// These live on their own because they belong to neither side exclusively:
// `library.js` produces them and is unavoidably browser-shaped, while
// `ui/radio-panel.js` consumes them and must stay pure. A pure module importing
// the file-system module just to reach five strings would drag the browser half
// into every test that touches the display.

/** No folder has ever been chosen. */
export const LIBRARY_IDLE = "idle";
/** Walking the folder now. */
export const LIBRARY_SCANNING = "scanning";
/** A playlist is loaded — possibly an empty one, if the folder had no audio. */
export const LIBRARY_READY = "ready";
/** A folder is remembered but the browser wants a gesture before re-reading it. */
export const LIBRARY_LOCKED = "locked";
export const LIBRARY_ERROR = "error";

export const LIBRARY_STATUSES = [
  LIBRARY_IDLE,
  LIBRARY_SCANNING,
  LIBRARY_READY,
  LIBRARY_LOCKED,
  LIBRARY_ERROR,
];
