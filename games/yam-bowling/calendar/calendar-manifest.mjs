// The ordered calendar. Every surface that names a calendar page -- the viewer, the month
// rail, the preloader, the product thumbnails -- reads it from here, so a page is described
// once and nothing else builds an asset path.
//
// A page is a *month*, not a printed side. The real object is one 11x17 hanging spread per
// month (artwork above the binding, grid below); the sheet/duplex construction behind that
// is a manufacturing concern and deliberately never reaches the buyer.

const ART_DIR = "../assets/calendar";

// Month -> the canon bowler featured on that page. Slugs match animation-core.js's roster.
const MONTHS = [
  ["january", "January", "Lumi Vega", "lumi-vega"],
  ["february", "February", "Marisol Cruz", "marisol-cruz"],
  ["march", "March", "Hazel Ward", "hazel-ward"],
  ["april", "April", "Amara Reed", "amara-reed"],
  ["may", "May", "Daisy Monroe", "daisy-monroe"],
  ["june", "June", "Skye Bennett", "skye-bennett"],
  ["july", "July", "Roxy Chen", "roxy-chen"],
  ["august", "August", "Zuri Banks", "zuri-banks"],
  ["september", "September", "Claire Rowan", "claire-rowan"],
  ["october", "October", "Scarlett Voss", "scarlett-voss"],
  ["november", "November", "Talia Dodson", "talia-dodson"],
  ["december", "December", "Reina Sato", "reina-sato"],
];

export const CALENDAR_YEAR = 2027;
export const CALENDAR_TITLE = "Yam Bowling 2027 Pinup Calendar";

/** Closed on the wall: 11in wide x 8.5in tall. */
export const CLOSED_ASPECT = Object.freeze({ width: 11, height: 8.5 });
/** Open and hanging: 11in wide x 17in tall, bound across the 11in edge. */
export const OPEN_ASPECT = Object.freeze({ width: 11, height: 17 });

function page(entry) {
  return Object.freeze(entry);
}

export const CALENDAR_PAGES = Object.freeze([
  page({
    id: "cover",
    kind: "cover",
    label: "Front cover",
    shortLabel: "Cover",
    image: `${ART_DIR}/cover.webp`,
    thumb: `${ART_DIR}/thumbs/cover.webp`,
  }),
  ...MONTHS.map(([id, label, bowlerName, bowlerSlug], index) => page({
    id,
    kind: "month",
    label,
    shortLabel: label.slice(0, 3),
    monthNumber: index + 1,
    bowlerName,
    bowlerSlug,
    artwork: `${ART_DIR}/${id}-art.webp`,
    grid: `${ART_DIR}/${id}-grid.webp`,
    thumb: `${ART_DIR}/thumbs/${id}-art.webp`,
  })),
  page({
    id: "back-cover",
    kind: "back",
    label: "Back cover",
    shortLabel: "Back",
    image: `${ART_DIR}/back-cover.webp`,
    thumb: `${ART_DIR}/thumbs/back-cover.webp`,
  }),
]);

export const MONTH_PAGES = Object.freeze(CALENDAR_PAGES.filter((entry) => entry.kind === "month"));

export function pageIndexById(id) {
  return CALENDAR_PAGES.findIndex((entry) => entry.id === id);
}

export function pageById(id) {
  return CALENDAR_PAGES.find((entry) => entry.id === id) || null;
}

/**
 * Every image a page paints, in paint order. A cover is one sheet; a month is the artwork
 * above the binding and the grid below it.
 */
export function pageImages(entry) {
  if (!entry) return [];
  return entry.kind === "month" ? [entry.artwork, entry.grid] : [entry.image];
}

/**
 * The images worth having in cache to render `index` and step either way from it. Adjacent
 * only -- the full set is ~5MB and eagerly loading it would cost more than it saves.
 */
export function preloadTargets(index, radius = 1) {
  const targets = [];
  for (let offset = -radius; offset <= radius; offset += 1) {
    const entry = CALENDAR_PAGES[index + offset];
    if (entry) targets.push(...pageImages(entry));
  }
  return [...new Set(targets)];
}
