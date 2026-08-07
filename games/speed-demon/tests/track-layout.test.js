import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import {
  ROAD,
  TRACKS,
  DEFAULT_TRACK_ID,
  LANE_COUNT,
  trackById,
  trackScale,
  laneScreenX,
  screenPixelsPerMetre,
  sourceScreenX,
  tileScreenHeight,
  wrapScroll,
  dashAlignedTile,
  trackTile,
} from "../scripts/ui/track-layout.js";

suite("track-layout — top-down road geometry");

const WORLD_WIDTH = 1280;
const TRACK_A = trackById("track-a");

// ---------------------------------------------------------------------------
// The measured asset
// ---------------------------------------------------------------------------

test("the road declares four lanes", () => {
  assertEqual(ROAD.laneCentres.length, 4);
  assertEqual(LANE_COUNT, 4);
});

test("lane centres ascend left to right", () => {
  for (let i = 1; i < ROAD.laneCentres.length; i += 1) {
    assert(ROAD.laneCentres[i] > ROAD.laneCentres[i - 1], "lanes must be ordered");
  }
});

test("every lane sits between the road edges", () => {
  for (const centre of ROAD.laneCentres) {
    assert(centre > ROAD.roadEdges.left, `lane ${centre} is off the left edge`);
    assert(centre < ROAD.roadEdges.right, `lane ${centre} is off the right edge`);
  }
});

test("two lanes fall either side of the centre divider", () => {
  const left = ROAD.laneCentres.filter((x) => x < ROAD.centreDivider);
  const right = ROAD.laneCentres.filter((x) => x > ROAD.centreDivider);
  assertEqual(left.length, 2);
  assertEqual(right.length, 2);
});

test("lanes are evenly spaced", () => {
  const gaps = ROAD.laneCentres.slice(1).map((x, i) => x - ROAD.laneCentres[i]);
  // The middle gap straddles the divider so it is wider; the outer two match.
  assertClose(gaps[0], gaps[2], 4, "the two in-carriageway lane gaps should match");
});

// ---------------------------------------------------------------------------
// The track catalog
// ---------------------------------------------------------------------------

test("the catalog holds five tracks with unique ids", () => {
  assertEqual(TRACKS.length, 5);
  assertEqual(new Set(TRACKS.map((t) => t.id)).size, 5);
});

test("the default track is one of them", () => {
  assert(trackById(DEFAULT_TRACK_ID), "the default must exist in the catalog");
  assertEqual(trackById("track-z"), null);
});

test("every track carries its art and its measured dash rhythm", () => {
  for (const track of TRACKS) {
    assert(track.src.endsWith(".png"), `${track.id} has no art`);
    assert(track.label && track.blurb, `${track.id} is missing its copy`);
    assert(track.dash.period > 0 && track.dash.firstY >= 0, `${track.id} has no dash rhythm`);
    assert(track.tilePeriods >= 1, `${track.id} has no tile periods`);
  }
});

test("dash rhythms are per-track because they genuinely differ", () => {
  // track-d's dashes run at a much longer pitch than the rest. If this ever
  // collapses to one shared value, the markings will stutter on whichever
  // tracks disagree with it.
  const periods = TRACKS.map((t) => t.dash.period);
  assert(Math.max(...periods) - Math.min(...periods) > 100, "the catalog lost its per-track rhythm");
});

// ---------------------------------------------------------------------------
// Screen mapping
// ---------------------------------------------------------------------------

test("the visible slice scales to exactly fill the screen width", () => {
  assertClose(trackScale(WORLD_WIDTH) * ROAD.view.sw, WORLD_WIDTH, 0.001);
});

test("the view window stays inside the source image", () => {
  assert(ROAD.view.sx >= 0);
  assert(ROAD.view.sx + ROAD.view.sw <= ROAD.width);
});

test("the view window keeps both barriers and the whole road in frame", () => {
  assert(ROAD.view.sx < ROAD.roadEdges.left, "the left road edge is cropped off");
  assert(ROAD.view.sx + ROAD.view.sw > ROAD.roadEdges.right, "the right road edge is cropped off");
});

test("the centre divider lands in the middle of the screen", () => {
  const dividerX = sourceScreenX(WORLD_WIDTH, ROAD.centreDivider);
  assertClose(dividerX, WORLD_WIDTH / 2, 4, "the road should be centred in frame");
});

test("lane screen positions stay on screen and stay ordered", () => {
  let previous = -Infinity;
  for (let i = 0; i < LANE_COUNT; i += 1) {
    const x = laneScreenX(WORLD_WIDTH, i);
    assert(x > 0 && x < WORLD_WIDTH, `lane ${i} at ${x} is off screen`);
    assert(x > previous, "screen lanes must stay ordered");
    previous = x;
  }
});

test("the two racing lanes straddle screen centre", () => {
  // Lanes 1 and 2 are the pair either side of the divider — the drag-race pair.
  assert(laneScreenX(WORLD_WIDTH, 1) < WORLD_WIDTH / 2);
  assert(laneScreenX(WORLD_WIDTH, 2) > WORLD_WIDTH / 2);
});

test("an out-of-range lane is rejected rather than drawn off screen", () => {
  let threw = false;
  try {
    laneScreenX(WORLD_WIDTH, 9);
  } catch {
    threw = true;
  }
  assert(threw, "lane 9 does not exist");
});

test("the world is drawn at a sane arcade zoom, not a wild one", () => {
  // The world scale is chosen for readability rather than taken from the track
  // image, so this pins the zoom to a believable range instead of an exact
  // figure: a lane should still read as a lane, not a runway or a footpath.
  const laneWidthPx = ROAD.laneWidth * trackScale(WORLD_WIDTH);
  const laneMetres = laneWidthPx / screenPixelsPerMetre();
  assert(laneMetres > ROAD.laneWidthMetres, `zoom should magnify, lane reads ${laneMetres}m`);
  assert(laneMetres < ROAD.laneWidthMetres * 2.5, `zoom is too aggressive, lane reads ${laneMetres}m`);
});

test("a whole car length of road stays visible at the top zoom", () => {
  // Guards against zooming in so far that the finish line appears and is gone
  // inside a couple of frames.
  const roadHeightPx = 500;
  assert(roadHeightPx / screenPixelsPerMetre() > 12, "less than 12m of road is in frame");
});

test("more speed means more scroll", () => {
  const pxPerMetre = screenPixelsPerMetre();
  assert(pxPerMetre > 0);
  assert(30 * pxPerMetre > 10 * pxPerMetre);
});

// ---------------------------------------------------------------------------
// Seamless tiling
// ---------------------------------------------------------------------------

test("every track's tile is a whole number of its own dash periods", () => {
  for (const track of TRACKS) {
    const tile = trackTile(track);
    assertClose(
      tile.sh / track.dash.period,
      track.tilePeriods,
      0.01,
      `${track.id}: a partial period would stutter the dashes`,
    );
  }
});

test("every track's tile starts on a dash so the rhythm carries across the loop", () => {
  for (const track of TRACKS) {
    assertEqual(trackTile(track).sy, track.dash.firstY, `${track.id} starts mid-gap`);
  }
});

test("every track's tile plus its blend strip stays inside the source image", () => {
  // This is what forces track-d down to three periods: a fourth would overrun.
  for (const track of TRACKS) {
    const tile = trackTile(track);
    assert(
      tile.sy + tile.sh + tile.blend <= ROAD.height,
      `${track.id}: the cross-fade needs real pixels past the tile to blend with`,
    );
  }
});

test("one more period would not fit any track, so no tile is needlessly short", () => {
  // The counterpart to the test above: together they pin `tilePeriods` to the
  // largest value the art actually supports rather than a cautious guess.
  for (const track of TRACKS) {
    const greedy = dashAlignedTile(track.dash, track.tilePeriods + 1);
    assert(
      greedy.sy + greedy.sh + ROAD.blend > ROAD.height,
      `${track.id} could tile ${track.tilePeriods + 1} periods but only claims ${track.tilePeriods}`,
    );
  }
});

test("tile screen height scales with the world", () => {
  assertClose(
    tileScreenHeight(WORLD_WIDTH, TRACK_A),
    trackTile(TRACK_A).sh * trackScale(WORLD_WIDTH),
    0.001,
  );
});

test("track A's tile is unchanged by the catalog split", () => {
  // The browser-verified numbers from the single-track build.
  const tile = trackTile(TRACK_A);
  assertEqual(tile.sy, 289);
  assertEqual(tile.sh, 1203);
  assertEqual(tile.blend, 60);
});

// ---------------------------------------------------------------------------
// Scroll wrapping
// ---------------------------------------------------------------------------

test("scroll wraps into the tile instead of growing without bound", () => {
  const height = 500;
  assertEqual(wrapScroll(0, height), 0);
  assertEqual(wrapScroll(120, height), 120);
  assertEqual(wrapScroll(500, height), 0);
  assertEqual(wrapScroll(620, height), 120);
  assertEqual(wrapScroll(1620, height), 120);
});

test("a negative scroll still wraps to a positive offset", () => {
  // Guards the classic % bug that leaves a one-frame gap at the top of frame.
  assertEqual(wrapScroll(-20, 500), 480);
  assertEqual(wrapScroll(-520, 500), 480);
});

test("wrapping is stable for very large scroll values", () => {
  const offset = wrapScroll(1e9 + 137, 500);
  assert(offset >= 0 && offset < 500, `offset ${offset} escaped the tile`);
});

finish();
