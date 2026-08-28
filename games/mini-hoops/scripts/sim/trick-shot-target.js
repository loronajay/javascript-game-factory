// What a trick shot is aimed AT: the wall hoop, or a bin placed on the floor.
//
// The Lab used to have exactly one target — a still hoop, nailed to the wall,
// built once at boot — so a layout could only ever end one way. This module is
// the seam that makes the target part of the shot: which kind of target, where
// it stands, and how it moves.
//
// TWO MOTION CATALOGS, AND THEY ARE DELIBERATELY NOT ONE. The hoop's modes are
// authored in SCREEN space (`sim/hoop.js`) because the hoop sits at one fixed
// depth forever and "left" means left on the canvas. A placed bin's are authored
// in WORLD space (`sim/bin-placement.js`) because its depth is the player's
// choice — a 100px screen sweep is a much longer walk through the room at the
// back than at the front, so the same named motion would be a different shot
// depending on where the bin was standing. Merging them would have to break one
// of those two facts.
//
// A consequence worth stating: the ids do not cross. "horizontal" is a hoop mode
// and "sideways" is a bin motion, and they mean the same thing to a player and
// nothing to each other. `normalizeTrickShotTarget` therefore resolves the id
// through the catalog for the kind it was handed, and an id from the wrong
// catalog falls back to that kind's default rather than being mapped across. The
// Lab keeps a remembered motion PER KIND above this file, so flipping the target
// back and forth does not quietly reset either one.
//
// Pure. No DOM, no storage, no rendering — the same contract `sim/hoop.js` and
// `sim/bin-placement.js` are held to.

import { DEFAULT_HOOP_MODE, HOOP_MODES, hoopAt, hoopModeById } from "./hoop.js";
import {
  BIN_MOTIONS,
  DEFAULT_BIN_MOTION,
  binMotionById,
  clampPlacement,
  defaultPlacement,
  placedBinAt,
} from "./bin-placement.js";

export const HOOP_TARGET = "hoop";
export const BIN_TARGET = "bin";
export const TRICK_SHOT_TARGET_KINDS = Object.freeze([HOOP_TARGET, BIN_TARGET]);
export const DEFAULT_TRICK_SHOT_TARGET_KIND = HOOP_TARGET;

/**
 * The player-facing description of each target kind.
 *
 * `label` names it, `blurb` says what it costs the shot. Kept here rather than
 * in the view for the reason every other catalog in this cabinet is: the picker
 * is built from the catalog, so there is no second list in the markup to forget.
 */
export const TRICK_SHOT_TARGETS = Object.freeze([
  Object.freeze({
    kind: HOOP_TARGET,
    label: "Wall Hoop",
    blurb: "The cabinet's rim, on the back wall. Through the net to finish.",
  }),
  Object.freeze({
    kind: BIN_TARGET,
    label: "Floor Bin",
    blurb: "HORSE's bin, stood anywhere the room allows. Drop into the mouth.",
  }),
]);

export function trickShotTargetKind(kind) {
  return TRICK_SHOT_TARGET_KINDS.includes(kind) ? kind : DEFAULT_TRICK_SHOT_TARGET_KIND;
}

/** The motion catalog a target kind may choose from. One shape, two sources. */
export function trickShotTargetMotions(kind) {
  return trickShotTargetKind(kind) === BIN_TARGET
    ? BIN_MOTIONS.map(({ id, label, blurb }) => ({ id, label, blurb }))
    : HOOP_MODES.map(({ id, label, blurb }) => ({ id, label, blurb }));
}

export function defaultTrickShotMotion(kind) {
  return trickShotTargetKind(kind) === BIN_TARGET ? DEFAULT_BIN_MOTION : DEFAULT_HOOP_MODE;
}

/**
 * A storage-safe, physically legal target record.
 *
 * The bin's placement goes through `clampPlacement` with its own motion, so
 * every point the bin will VISIT is inside the legal volume — not merely the
 * point it was placed at. That is HORSE's rule and it is inherited whole: the
 * Lab does not get to invent a bin outside the volume HORSE proved was
 * reachable, because the reticle's reach is what defines that volume.
 *
 * `placement` is null for a hoop target rather than carried and ignored, so a
 * saved record cannot describe a hoop standing in the middle of the floor.
 */
export function normalizeTrickShotTarget(input = {}) {
  const kind = trickShotTargetKind(input?.kind);
  if (kind === BIN_TARGET) {
    const motionId = binMotionById(input.motionId).id;
    return { kind, motionId, placement: clampPlacement(input.placement || input, motionId) };
  }
  return { kind, motionId: hoopModeById(input.motionId).id, placement: null };
}

export function defaultTrickShotTarget(kind = DEFAULT_TRICK_SHOT_TARGET_KIND) {
  const safe = trickShotTargetKind(kind);
  return normalizeTrickShotTarget({
    kind: safe,
    motionId: defaultTrickShotMotion(safe),
    placement: safe === BIN_TARGET ? defaultPlacement() : null,
  });
}

/**
 * The target at a moment on the Lab's motion clock.
 *
 * A pure function of elapsed seconds, exactly like `hoopAt` and `placedBinAt`:
 * it reads no clock, so a layout replayed tick-for-tick puts the target in
 * exactly the same place. Both fields are always present and exactly one of them
 * is ever non-null, so a caller branches on `kind` and never on truthiness.
 */
export function trickShotTargetAt(target, elapsedSeconds = 0) {
  const safe = normalizeTrickShotTarget(target);
  const seconds = Math.max(0, Number(elapsedSeconds) || 0);
  if (safe.kind === BIN_TARGET) {
    return {
      kind: BIN_TARGET,
      motionId: safe.motionId,
      hoop: null,
      bin: placedBinAt({ ...safe.placement, motionId: safe.motionId }, seconds),
    };
  }
  return {
    kind: HOOP_TARGET,
    motionId: safe.motionId,
    hoop: hoopAt(safe.motionId, seconds),
    bin: null,
  };
}
