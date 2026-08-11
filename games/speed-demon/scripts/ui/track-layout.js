// Top-down track geometry — pure, no canvas.
//
// Every number here was measured off the art rather than guessed: lane centres
// and edges from a paint-coverage scan across the image, the dashed-line rhythm
// from a run-length scan down it. Re-measure rather than nudge these if the art
// is ever re-authored.
//
// The view is genuinely top-down: the road scrolls straight down the screen at
// a constant width, with no perspective projection. The art is an aerial image,
// so anything painted into it (barriers, kerbs, drains) is already flat and
// projects correctly — which is exactly what a perspective camera could not do
// with it.
//
// The split below is the important part. All five tracks are the same road
// photographed in five settings, so the painted geometry is shared (`ROAD`) and
// only what genuinely differs is per-track (`TRACKS`). That was checked, not
// assumed: the left edge line spans source x 262-269 on every track, and the
// lane lines, divider and flanking lines all agree within a pixel. What does
// *not* agree is the dash rhythm — see the note on `TRACKS`.

export const ROAD = {
  width: 941,
  height: 1672,

  // Painted road edges and the double-yellow centre divider, in source pixels.
  // These are line *centres*: the edge line is about eight pixels wide.
  roadEdges: { left: 266, right: 672 },
  centreDivider: 471,

  // Lane centres, left to right. Lanes 1 and 2 straddle the divider and are the
  // pair a two-car drag race uses.
  laneCentres: [313, 403, 539, 627],
  laneWidth: 90.5,
  laneWidthMetres: 3.5,

  /**
   * The horizontal slice actually shown on screen. It reaches beyond both road
   * edges so the shoulders and scenery frame the strip, while still cropping
   * enough of the outer image for the cars to read clearly.
   */
  view: { sx: 111, sw: 720 },

  /**
   * How many rows past the tile window get cross-faded over the top to hide the
   * asphalt seam — the raw asphalt does not tile on its own. Shared because it
   * is a property of the blend, not of any one photograph.
   */
  blend: 60,
};

export const LANE_COUNT = ROAD.laneCentres.length;

/**
 * The five authored settings.
 *
 * Only the dashed-line rhythm differs between them, and it genuinely does:
 * track-d's dashes run at a 456px pitch where the rest sit near 301. That is
 * also why `tilePeriods` is per-track — four of d's periods would overrun the
 * image, so its tile is three. Do not collapse these into one shared dash
 * constant; measure a new track's rhythm the same way and give it its own entry.
 */
export const TRACKS = [
  {
    id: "track-a",
    label: "Grasslands",
    blurb: "Open meadow, mid-afternoon",
    src: "assets/tracks/track-a.png",
    dash: { firstY: 289, period: 300.75, length: 38 },
    tilePeriods: 4,
  },
  {
    id: "track-b",
    label: "Dust Bowl",
    blurb: "Desert scrub and hot tarmac",
    src: "assets/tracks/track-b.png",
    dash: { firstY: 288, period: 301, length: 39 },
    tilePeriods: 4,
  },
  {
    id: "track-c",
    label: "Cape Run",
    blurb: "Coast road above the breakers",
    src: "assets/tracks/track-c.png",
    dash: { firstY: 289, period: 301, length: 38 },
    tilePeriods: 4,
  },
  {
    id: "track-d",
    label: "Pine Cut",
    blurb: "Cut through dense forest",
    src: "assets/tracks/track-d.png",
    dash: { firstY: 154, period: 456.33, length: 42 },
    tilePeriods: 3,
  },
  {
    id: "track-e",
    label: "Night Shift",
    blurb: "Industrial outskirts after dark",
    src: "assets/tracks/track-e.png",
    dash: { firstY: 289, period: 301.5, length: 34 },
    tilePeriods: 4,
  },
  {
    // The first of the descriptively-named art. The lettered ids above are kept
    // exactly as they are — a track id is stored on every record row, so
    // renaming one orphans the metadata on every time already set — but there is
    // nothing stopping a *new* track from being named after the place it is.
    //
    // Measured the same way as the rest, off the shipped file: the double-yellow
    // divider lands on the same column as every other track (465-474 against a
    // shared centre of 471) and the lane dashes start at y=290 on a 300.0px
    // pitch, so this is the same road in a sixth setting rather than new
    // geometry.
    id: "street-race",
    label: "Old Town",
    blurb: "Two lanes through the old quarter, after closing",
    src: "assets/tracks/street-race.png",
    dash: { firstY: 290, period: 300, length: 38 },
    tilePeriods: 4,
  },
];

export const DEFAULT_TRACK_ID = "track-a";

export function trackById(id) {
  return TRACKS.find((track) => track.id === id) ?? null;
}

/**
 * How far the world moves per metre travelled.
 *
 * Deliberately a chosen constant rather than the track image's own scale. Drawn
 * at its native scale the road is about 51 px/m here, which at 116 mph moves the
 * surface ~45 px per frame — fast enough to strobe the lane markings and to flick
 * the finish line past in a fifth of a second. Pulling it back to 32 renders the
 * world at roughly 1.6x real size: an ordinary arcade zoom, uniform across the
 * car and the road, so nothing looks out of proportion with anything else.
 *
 * Everything world-anchored — road scroll and the finish line — must use this,
 * or they will drift apart. The speedometer and the distance readout are
 * unaffected; those report the sim's real metres.
 */
export const WORLD_PIXELS_PER_METRE = 32;

/** The visible slice of the track image is scaled to exactly fill the screen. */
export function trackScale(worldWidth) {
  return worldWidth / ROAD.view.sw;
}

export function screenPixelsPerMetre() {
  return WORLD_PIXELS_PER_METRE;
}

/** Screen x of a source-image column, accounting for the cropped view window. */
export function sourceScreenX(worldWidth, sourceX) {
  return (sourceX - ROAD.view.sx) * trackScale(worldWidth);
}

export function laneScreenX(worldWidth, laneIndex) {
  const centre = ROAD.laneCentres[laneIndex];
  if (centre === undefined) {
    throw new Error(`Track has no lane ${laneIndex}`);
  }
  return sourceScreenX(worldWidth, centre);
}

/**
 * Wraps a running scroll distance into [0, height). Written as a double modulo
 * because a bare `%` returns a negative for negative input, which would leave a
 * one-frame gap at the top of the screen.
 */
export function wrapScroll(scroll, height) {
  return ((scroll % height) + height) % height;
}

/** A tile window of whole dash periods, starting on a dash. */
export function dashAlignedTile(dash, periods) {
  return { sy: dash.firstY, sh: Math.round(periods * dash.period) };
}

/**
 * The tileable source window for a track: whole dash periods, starting on a
 * dash, plus the blend strip's row count.
 *
 * Derived rather than stored so a track's dash rhythm and its tile cannot
 * disagree — with five tracks that is a mistake waiting to be made by hand.
 */
export function trackTile(track) {
  const { sy, sh } = dashAlignedTile(track.dash, track.tilePeriods);
  return { sy, sh, blend: ROAD.blend };
}

export function tileScreenHeight(worldWidth, track) {
  return trackTile(track).sh * trackScale(worldWidth);
}
