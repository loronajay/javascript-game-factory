// The painted campaign map, and where its nodes actually are — pure.
//
// **The map is art, not a layout.** `assets/campaign-map.png` is a painted
// aerial of the city with the whole campaign already on it: node bases, the
// dashed routes between them, the region names, the boss plates and a legend.
// Nothing here draws any of that. The only job of this module is to say where
// each *painted* base sits, so a UI token can be placed on top of it — the
// Tactical Arena pattern, where a mission carries an authored `point` as a
// percentage of the map image and the renderer positions the token there.
//
// Two consequences worth protecting:
//
// - **Positions are percentages of the image, never screen pixels.** The map is
//   drawn to fit whatever box it is given, so a percentage is the only
//   coordinate that survives the fit. Anything that turns one into pixels has to
//   go through the *drawn rect*, which is why `mapRect` exists.
// - **The trails are painted, so nothing draws them.** The routes between nodes
//   are part of the artwork. Drawing a second set of lines over them is how you
//   end up with two maps disagreeing about where the road goes.
//
// The points below were **measured off the shipped PNG**, not typed, by
// `tools/measure-map-nodes.py` — re-run it if the art is re-authored and paste
// what it prints. It fits a circle to each icon's *outer edge*, which is a more
// awkward measurement than it sounds and is worth knowing why:
//
//   - **A blob centroid is wrong.** The painted dashed route runs *into* every
//     ring, so the bright component is the ring plus a length of trail and its
//     centroid is dragged a few pixels along the road.
//   - **A Hough-style vote is wrong too**, which is how the first pass at this
//     left five nodes ~5px out. The icons are near-solid inside the outer ring,
//     so a great many (centre, radius) pairs score a perfect circle and the peak
//     is a plateau rather than a point — the answer you get back is wherever the
//     search happened to start looking.
//   - So the tool casts 720 rays from a provisional centre, takes the outermost
//     bright sample on each, **discards every ray more than 2.5px off the median
//     radius** — that is the trail, and the boss plates' flourishes — and
//     least-squares fits a circle to what is left, feeding the new centre back
//     in until it settles. It lands inside half a pixel on all 21.
//
// Half a pixel is the standard because these are 941px-tall coordinates drawn
// into a ~700px box: an error of five is small on paper and unmissable on
// screen, as a token sitting off the side of its own icon.
//
// That is the same "measured, not typed" rule the car atlas and the track
// geometry follow — re-measure with the same method rather than nudging a
// number if the art is ever re-authored.

/** The art's own dimensions. Used to fit it, and to place percentages on it. */
export const MAP_IMAGE = { src: "assets/campaign-map.png", width: 1672, height: 941 };

/**
 * The kinds of node the legend paints, and what each one means.
 *
 * These are the art's own words. A node's kind is a fact about the picture — it
 * is which base was painted there — so an event does not get to choose one; it
 * attaches to a node and inherits it.
 */
export const NODE_RACE = "race";
export const NODE_RIVAL = "rival";
export const NODE_BONUS = "bonus";
export const NODE_BOSS = "boss";
export const NODE_START = "start";

/**
 * Every painted base on the map, west to east, with the region it sits in.
 *
 * All 21 are listed even though only the first few carry events yet, because
 * **they are already on the screen**: the player can see them whether or not
 * this file mentions them. A node with no event reads as "coming soon" rather
 * than being ignored, which is the honest description — the road is painted,
 * the race is not written.
 *
 * Ids are stable and must never be renamed: an id is stored on every event row
 * and in every save, the same rule the car models and the boards follow.
 */
export const MAP_NODES = [
  { id: "start", kind: NODE_START, region: "Street Circuit", point: { x: 8.59, y: 83.40 } },
  { id: "street-1", kind: NODE_RACE, region: "Street Circuit", point: { x: 15.87, y: 74.82 } },
  { id: "street-2", kind: NODE_RACE, region: "Street Circuit", point: { x: 23.96, y: 69.58 } },
  { id: "street-3", kind: NODE_BONUS, region: "Street Circuit", point: { x: 29.27, y: 76.77 } },
  { id: "street-4", kind: NODE_RIVAL, region: "Street Circuit", point: { x: 32.16, y: 64.51 } },
  { id: "street-5", kind: NODE_BONUS, region: "Street Circuit", point: { x: 37.57, y: 74.36 } },
  { id: "street-6", kind: NODE_RACE, region: "Street Circuit", point: { x: 39.20, y: 57.62 } },
  { id: "street-7", kind: NODE_RIVAL, region: "Street Circuit", point: { x: 44.49, y: 66.47 } },
  { id: "street-boss", kind: NODE_BOSS, region: "Street Circuit", label: "STREET BOSS", point: { x: 46.15, y: 50.95 } },
  { id: "downtown-1", kind: NODE_RACE, region: "Downtown", point: { x: 55.21, y: 46.95 } },
  { id: "downtown-2", kind: NODE_BONUS, region: "Downtown", point: { x: 59.03, y: 58.56 } },
  { id: "downtown-3", kind: NODE_RIVAL, region: "Downtown", point: { x: 63.80, y: 41.64 } },
  { id: "docks-1", kind: NODE_RIVAL, region: "Docklands", point: { x: 67.01, y: 67.62 } },
  { id: "downtown-4", kind: NODE_RACE, region: "Downtown", point: { x: 70.75, y: 36.02 } },
  { id: "downtown-5", kind: NODE_BONUS, region: "Downtown", point: { x: 73.83, y: 47.84 } },
  { id: "dock-boss", kind: NODE_BOSS, region: "Docklands", label: "DOCK BOSS", point: { x: 75.22, y: 71.52 } },
  { id: "city-boss", kind: NODE_BOSS, region: "Downtown", label: "CITY BOSS", point: { x: 78.28, y: 30.85 } },
  { id: "kuroda-1", kind: NODE_RIVAL, region: "Kuroda Territory", point: { x: 82.91, y: 42.77 } },
  { id: "kuroda-2", kind: NODE_RACE, region: "Kuroda Territory", point: { x: 84.29, y: 23.83 } },
  { id: "kuroda-3", kind: NODE_RIVAL, region: "Kuroda Territory", point: { x: 88.19, y: 17.22 } },
  { id: "kuroda", kind: NODE_BOSS, region: "Kuroda Territory", label: "KURODA", point: { x: 91.15, y: 10.08 } },
];

export function mapNodeById(id) {
  return MAP_NODES.find((node) => node.id === id) ?? null;
}

/**
 * Where the map image lands inside a box, letterboxed.
 *
 * **Contain, never cover.** A cover fit crops, and a cropped map moves every
 * authored percentage off the base it was measured against — the tokens would
 * drift toward the edges and nobody would be able to say why. The art is within
 * a rounding error of 16:9 so the bars are a pixel at most, but the fit has to
 * be the honest one regardless.
 */
export function mapRect(box) {
  const scale = Math.min(box.width / MAP_IMAGE.width, box.height / MAP_IMAGE.height);
  const width = MAP_IMAGE.width * scale;
  const height = MAP_IMAGE.height * scale;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
    scale,
  };
}

/** An authored percentage, as a point inside a drawn map rect. */
export function pointOnMap(rect, point) {
  return {
    x: rect.x + (point.x / 100) * rect.width,
    y: rect.y + (point.y / 100) * rect.height,
  };
}
