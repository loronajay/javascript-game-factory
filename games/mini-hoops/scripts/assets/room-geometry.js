// How each painted room lines up with the camera, and what in it stands in
// front of the ball.
//
// PRESENTATION ONLY, AND THAT IS A CONTRACT. Nothing under `sim/` may import
// this file — `tests/modules.test.js` enforces it. A room still cannot change
// the shot, which is what keeps one leaderboard comparable across eight rooms.
// What a room *can* do is say where its own paint is, so the one camera in
// `sim/projection.js` draws onto it correctly.
//
// It is deliberately a separate file from `location-catalog.js`. That catalog is
// the player-facing registry — an id, a label, a blurb — and it is guarded by a
// test that says a location carries nothing else. Numbers measured off a JPEG
// are not what that registry is for, and mixing them would blunt the guard.
//
// ---------------------------------------------------------------------------
// ALIGNMENT
//
// The rooms were painted independently and their back walls do not meet the
// floor on the same scanline: the cubicle's does at y=478, the bedroom's at
// y=546 — 68px apart, which at this scale is most of a metre of room depth. The
// camera is one camera, so the art moves to it rather than the other way round:
// each room declares the row its own skirting sits on, and the renderer slides
// the backdrop so that row lands on `WALL_BASE_SCREEN_Y`.
//
// The slide exposes a strip at the top or the bottom, which the renderer fills
// by stretching the art's own edge band. Every strip lands on plain ceiling or
// plain floor, which is why a shift of this size is invisible; a room whose art
// runs to something detailed at the very edge would need re-cutting instead.
//
// ---------------------------------------------------------------------------
// OCCLUDERS
//
// An occluder is a piece of the room that stands between the camera and the
// ball: the bed, the counter, the racking. It is not new art — it is a polygon
// cut out of the backdrop the room already ships, re-drawn over the top of
// anything deeper than it. That is what lets a ball fly *behind* the furniture
// instead of skating across the front of the picture, and it costs nothing but
// the coordinates below.
//
// `z` is the depth the object stands at, in the same world units the ball flies
// through: 0 is the camera plane and 1 is the back wall. Anything at a greater
// depth is covered. The polygons are in SOURCE-IMAGE coordinates — the same
// space the JPEG was measured in — so the alignment shift above carries them
// along with the paint they were traced from, and re-measuring a room's wall
// base never invalidates its silhouettes.
//
// They are traced coarsely on purpose. A silhouette only has to be right where
// the ball can actually reach it, and the ball lives in the middle of the room;
// pixel-accurate edges out at x=0 would be work nobody can see.

import { CANVAS_HEIGHT, WALL_BASE_SCREEN_Y } from "../sim/constants.js";

/** How much of the art's own edge is stretched to cover the strip a shift exposes. */
export const EDGE_FILL_SOURCE_BAND = 10;

const ROOMS = Object.freeze({
  bedroom: {
    // White skirting runs to y=545; the boards start at 546.
    wallBaseY: 546,
    occluders: [
      // The bed and the nightstand beside it, one silhouette because they touch.
      { z: 0.06, polygon: [[0, 388], [142, 392], [142, 452], [166, 452], [248, 458], [248, 566], [160, 596], [0, 606]] },
      // Desk, dresser and chair down the right-hand wall.
      { z: 0.1, polygon: [[766, 396], [960, 390], [960, 760], [858, 708], [858, 604], [766, 598]] },
      // The bag propped against the dresser, which sticks out past it.
      { z: 0.12, polygon: [[728, 478], [790, 478], [790, 570], [728, 570]] },
    ],
  },
  cubicle: {
    // Dark skirting ends at y=477; carpet from 478.
    wallBaseY: 478,
    occluders: [
      // Partition, desk and the filing cabinet under it.
      { z: 0.05, polygon: [[0, 254], [234, 254], [234, 512], [186, 512], [186, 440], [0, 440]] },
      // The chair in front of that desk, traced round the base rather than
      // boxed: a rectangle would swallow the carpet between the wheels, and a
      // ball rolling into carpet that hides it reads as a bug, not as furniture.
      { z: 0.03, polygon: [[92, 370], [190, 372], [190, 600], [178, 656], [62, 660], [52, 600], [92, 540]] },
      // The mirrored bay on the right, partition down through desk to plant.
      { z: 0.05, polygon: [[828, 254], [960, 254], [960, 760], [848, 760], [848, 648], [788, 566], [788, 398], [828, 398]] },
      // The water cooler, which stands right against the back wall — it can
      // only ever hide a ball at the wall itself, and that is the point of it.
      { z: 0.88, polygon: [[688, 266], [762, 266], [762, 472], [688, 472]] },
    ],
  },
  detention: {
    // Skirting ends at y=539; tile from 540.
    wallBaseY: 540,
    occluders: [
      // The bench bolted along the left-hand wall.
      { z: 0.12, polygon: [[0, 476], [205, 453], [205, 538], [0, 658]] },
      // The table slab, and the near leg under it.
      { z: 0.14, polygon: [[746, 452], [960, 448], [960, 486], [746, 482]] },
      { z: 0.14, polygon: [[752, 482], [772, 482], [772, 700], [752, 700]] },
      // The chair back only. Its legs are traced out deliberately: the floor
      // between them is floor, and covering it would make a ball vanish there.
      { z: 0.1, polygon: [[856, 460], [936, 466], [936, 590], [856, 590]] },
    ],
  },
  police: {
    // Blue wainscot ends at y=495; boards from 496.
    wallBaseY: 496,
    occluders: [
      // Desk, lamp and the chair pulled up to it.
      { z: 0.08, polygon: [[0, 408], [178, 420], [178, 598], [112, 648], [36, 636], [0, 614]] },
      // The counter along the right-hand wall.
      { z: 0.1, polygon: [[788, 398], [960, 390], [960, 600], [788, 600]] },
      // The evidence crate in the near corner, which is the closest thing in
      // the room to the camera.
      { z: 0.02, polygon: [[900, 498], [960, 492], [960, 760], [896, 760]] },
    ],
  },
  warehouse: {
    // Blue band ends at y=497; concrete from 498.
    wallBaseY: 498,
    occluders: [
      // Pallet racking down the left aisle, floor to ceiling, with the stacked
      // boxes at its foot.
      { z: 0.05, polygon: [[0, 0], [110, 0], [110, 412], [135, 432], [135, 540], [80, 566], [0, 572]] },
      // The same down the right, running forward into the crate and pallet jack.
      { z: 0.05, polygon: [[900, 0], [960, 0], [960, 626], [898, 612], [878, 556], [878, 452], [900, 436]] },
    ],
  },
  "rec-hall": {
    // Black skirting ends at y=489; maple boards start at 490.
    wallBaseY: 490,
    occluders: [
      // Stacked folding chairs and the narrow ball cart at the left edge.
      { z: 0.05, polygon: [[0, 292], [116, 310], [159, 328], [159, 492], [108, 512], [108, 536], [0, 514]] },
      // Trophy cabinet, plant and rolled mats along the right wall.
      { z: 0.06, polygon: [[817, 362], [860, 362], [860, 383], [960, 382], [960, 532], [824, 532], [824, 406]] },
    ],
  },
  "school-gym": {
    // Black skirting ends at y=460; maple boards start at 461.
    wallBaseY: 461,
    occluders: [
      // Folded bleachers stay entirely outside the moving-hoop lane.
      { z: 0.05, polygon: [[0, 172], [105, 207], [105, 462], [0, 485]] },
      // Crash mats and the rolling equipment cage at the opposite edge.
      { z: 0.06, polygon: [[798, 270], [889, 263], [889, 283], [960, 276], [960, 486], [798, 466]] },
    ],
  },
  fieldhouse: {
    // The recessed black base ends at y=484; maple boards start at 485.
    wallBaseY: 485,
    occluders: [
      // A short bank of folded retractable seating.
      { z: 0.05, polygon: [[0, 344], [99, 365], [151, 387], [151, 487], [104, 505], [104, 526], [0, 528]] },
      // Equipment trunks and their railings on the right.
      { z: 0.06, polygon: [[808, 369], [873, 367], [873, 386], [960, 374], [960, 524], [808, 493]] },
    ],
  },
});

const EMPTY_OCCLUDERS = Object.freeze([]);

/**
 * The scanline a room's own skirting is painted on, or the canonical one for a
 * room with no measurements — an unmeasured room then draws untouched, which is
 * the honest fallback: slightly out of register beats sliding art by a guess.
 */
export function roomWallBaseY(locationId) {
  return ROOMS[locationId]?.wallBaseY ?? WALL_BASE_SCREEN_Y;
}

/**
 * How far down the canvas this room's backdrop is drawn, so its painted wall
 * base lands on the camera's. Negative slides the art up.
 */
export function roomBackdropOffsetY(locationId) {
  return WALL_BASE_SCREEN_Y - roomWallBaseY(locationId);
}

/**
 * The foreground pieces of a room, in whatever order they are authored.
 *
 * Order carries no meaning and callers must not read one into it: the renderer
 * clips to the UNION of the polygons it selects, so a nearer piece drawn after a
 * further one changes nothing. They are grouped by where they are in the room
 * rather than by depth, because that is how they are read and edited.
 */
export function roomOccluders(locationId) {
  return ROOMS[locationId]?.occluders ?? EMPTY_OCCLUDERS;
}

/**
 * The occluders that cover something at depth `z`.
 *
 * The test everything else is written against: an object stands at a depth, and
 * it hides whatever is further away than it is.
 */
export function occludersInFrontOf(locationId, z) {
  return roomOccluders(locationId).filter((occluder) => occluder.z < z);
}

/**
 * The strip of bare canvas a room's shift exposes, as `{ y, height }`, or null
 * when the art covers the frame on its own.
 *
 * Returned rather than drawn so it can be asserted without a canvas: a room
 * whose shift grew past the edge band it is filled from would otherwise smear
 * silently.
 */
export function roomEdgeGap(locationId) {
  const offset = roomBackdropOffsetY(locationId);
  if (offset > 0) return { y: 0, height: offset, edge: "top" };
  if (offset < 0) return { y: CANVAS_HEIGHT + offset, height: -offset, edge: "bottom" };
  return null;
}
