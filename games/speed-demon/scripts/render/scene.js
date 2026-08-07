// World rendering: the top-down road.
//
// The track art is an aerial photograph, so it is drawn exactly as authored —
// full width, scrolling straight down, no perspective projection. An earlier
// build projected it into a pseudo-3D ground plane; that was wrong for these
// assets. A top-down image paints vertical objects (guardrails, barriers, light
// poles) flat onto the ground, so projecting it laid the barriers down on the
// tarmac instead of standing them up. The car art is top-down too. Flat is the
// treatment both assets were made for.
//
// Canvas rendering only — no game state is advanced here.

import { ROAD, trackTile, trackScale, wrapScroll, screenPixelsPerMetre, sourceScreenX } from "../ui/track-layout.js";

export const WORLD = { width: 1280, height: 720 };
export const DASH_TOP = 500;
/** The road fills everything above the instrument cluster. */
export const ROAD_BOTTOM = DASH_TOP;

export const PIXELS_PER_METRE = screenPixelsPerMetre();

/**
 * Builds the seamless scrolling tile once, at load.
 *
 * The tile window is already aligned to the dashed-line rhythm, but the asphalt
 * itself does not tile — its vertical streaks do not repeat, so a hard loop shows
 * a horizontal discontinuity. This cross-fades the rows immediately past the
 * window over the top of the tile, so the last row flows into the first.
 *
 * The window comes from the track, because the dash rhythm it is aligned to is
 * per-track — one shared window would stutter the markings on the tracks whose
 * rhythm disagreed with it.
 *
 * Returns a canvas, or null if the source has not loaded yet.
 */
export function buildTrackTile(image, track) {
  if (!image || !image.complete || image.naturalWidth === 0) {
    return null;
  }

  const { sy, sh, blend } = trackTile(track);
  const width = ROAD.width;

  const tile = document.createElement("canvas");
  tile.width = width;
  tile.height = sh;
  const ctx = tile.getContext("2d");

  // Base: the aligned window.
  ctx.drawImage(image, 0, sy, width, sh, 0, 0, width, sh);

  // The continuation strip, faded out over `blend` rows.
  const strip = document.createElement("canvas");
  strip.width = width;
  strip.height = blend;
  const stripCtx = strip.getContext("2d");
  stripCtx.drawImage(image, 0, sy + sh, width, blend, 0, 0, width, blend);

  const ramp = stripCtx.createLinearGradient(0, 0, 0, blend);
  ramp.addColorStop(0, "rgba(0,0,0,0)");
  ramp.addColorStop(1, "rgba(0,0,0,1)");
  stripCtx.globalCompositeOperation = "destination-out";
  stripCtx.fillStyle = ramp;
  stripCtx.fillRect(0, 0, width, blend);

  ctx.drawImage(strip, 0, 0);
  return tile;
}

/**
 * Draws the scrolling road. `scroll` is a running distance in screen pixels; it
 * is wrapped here rather than by the caller so the caller never has to know the
 * tile height.
 *
 * The height is read off the tile canvas rather than looked up from the track,
 * so it cannot disagree with the tile actually being drawn.
 */
export function drawRoad(ctx, tile, scroll) {
  if (!tile) {
    ctx.fillStyle = "#2b2b2e";
    ctx.fillRect(0, 0, WORLD.width, ROAD_BOTTOM);
    return;
  }

  const tileHeight = tile.height * trackScale(WORLD.width);
  const offset = wrapScroll(scroll, tileHeight);
  const { sx, sw } = ROAD.view;

  for (let y = offset - tileHeight; y < ROAD_BOTTOM; y += tileHeight) {
    ctx.drawImage(tile, sx, 0, sw, tile.height, 0, y, WORLD.width, tileHeight);
  }
}

/**
 * Motion streaks over the verges. Sells speed and, more usefully, masks the
 * strobing the dashed lines would otherwise show at high scroll rates.
 */
export function drawSpeedStreaks(ctx, speed, tick) {
  const intensity = Math.min(1, Math.max(0, (speed - 18) / 40));
  if (intensity <= 0) {
    return;
  }

  // Just outside the painted road edges, over the shoulders.
  const leftVerge = sourceScreenX(WORLD.width, ROAD.roadEdges.left) - 34;
  const rightVerge = sourceScreenX(WORLD.width, ROAD.roadEdges.right) + 34;

  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${0.04 + intensity * 0.1})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i += 1) {
    const y = ((tick * (14 + intensity * 30) + i * 137) % (ROAD_BOTTOM + 160)) - 80;
    const length = 40 + intensity * 130;
    for (const x of [leftVerge, rightVerge]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + length);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Finish-line banner. Approaches down the screen at the same rate as the road,
 * so it is anchored to the world rather than animated separately.
 */
export function drawFinishLine(ctx, metresRemaining) {
  const y = ROAD_BOTTOM - metresRemaining * PIXELS_PER_METRE;
  const height = 26;
  if (y + height < 0 || y > ROAD_BOTTOM) {
    return;
  }

  const left = sourceScreenX(WORLD.width, ROAD.roadEdges.left);
  const right = sourceScreenX(WORLD.width, ROAD.roadEdges.right);
  const squares = 20;
  const squareWidth = (right - left) / squares;

  ctx.save();
  for (let row = 0; row < 2; row += 1) {
    for (let i = 0; i < squares; i += 1) {
      ctx.fillStyle = (i + row) % 2 === 0 ? "#f2f2f2" : "#16181c";
      ctx.fillRect(left + i * squareWidth, y + row * (height / 2), squareWidth, height / 2);
    }
  }
  ctx.restore();
}

/** Soft vignette so the road reads as a lit strip rather than a flat fill. */
export function drawRoadVignette(ctx) {
  const vignette = ctx.createRadialGradient(
    WORLD.width / 2,
    ROAD_BOTTOM * 0.5,
    ROAD_BOTTOM * 0.25,
    WORLD.width / 2,
    ROAD_BOTTOM * 0.5,
    WORLD.width * 0.72,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WORLD.width, ROAD_BOTTOM);
}
