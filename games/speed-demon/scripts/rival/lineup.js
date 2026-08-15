// Who you can line up against, and how any of them becomes a car on the strip.
//
// PURE. This is the seam that makes a CPU rival and a ghost the same thing
// everywhere downstream: both come out of `buildRival` as an input log plus the
// identity to draw beside it, and nothing past this point asks which it got.
// The mode is not "race a CPU *or* race a ghost", it is "race a log".

import { rebaseToStart } from "../sim/input-log.js";
import { boardUnit, formatValue } from "../records/records.js";
import { createLivery } from "../garage/livery.js";
import { avatarById, avatarSrc, avatarThumbSrc } from "../profile/avatars.js";
import { driveRace } from "./cpu-driver.js";
import { RIVALS, DEFAULT_RIVAL_ID, rivalById, rivalCardSrc, rivalThumbSrc } from "./rivals.js";

export { DEFAULT_RIVAL_ID };

/** The ghost's id. Fixed, because there is at most one per board. */
export const GHOST_ID = "ghost";

export const KIND_GHOST = "ghost";
export const KIND_CPU = "cpu";

/**
 * The lineup for a board: the player's own ghost if they have set a time on it,
 * then the roster.
 *
 * **The ghost comes first, and it is the default when it exists.** The run a
 * player most wants to beat is their own last one, and putting it at the head of
 * the strip means the common case — "go again, but with the last one alongside"
 * — costs no cursor movement at all.
 *
 * The board is what decides whether there is a ghost, not the mode: a best set
 * over a quarter mile is not a rival over a mile.
 */
/**
 * One roster rival, as a lineup entry.
 *
 * Exported because the campaign fields roster drivers on the map's painted
 * `rival` and `boss` bases, and an event assembling this shape by hand would be
 * a second copy of it — one that would quietly stop matching the day an entry
 * gains a field. `buildRival` finds the profile by id, so nothing here carries
 * the hands.
 */
export function rivalEntry(rival) {
  return {
    id: rival.id,
    kind: KIND_CPU,
    name: rival.name,
    tier: rival.tier,
    blurb: rival.blurb,
    accent: rival.accent,
    // What the card shows when the portrait has not loaded, or does not exist.
    // Carried rather than derived from the name so the ghost — whose name is a
    // phrase, not a person — can say something better than "Y".
    initial: rival.name.charAt(0).toUpperCase(),
    modelId: rival.modelId,
    livery: rival.livery,
  };
}

export function lineupFor(boardId, ghost = null) {
  const entries = RIVALS.map(rivalEntry);

  if (!ghost || !boardId || ghost.boardId !== boardId) return entries;

  const unit = boardUnit(String(boardId).split(":")[0]);
  return [
    {
      id: GHOST_ID,
      kind: KIND_GHOST,
      name: "YOUR GHOST",
      tier: "BEST",
      blurb: `The run that set your ${formatValue(unit, ghost.value)}. Beat it and it is replaced.`,
      accent: "#57d98a",
      initial: "PB",
      modelId: ghost.modelId,
      // A ghost is drawn in the car that set the time. `createLivery` rather
      // than the raw saved object because this came off disk — see `ghost.js`.
      livery: ghost.livery ? createLivery(ghost.livery) : null,
      ghost,
    },
    ...entries,
  ];
}

/**
 * The face to draw beside a lineup entry, at whichever of the two derived sizes
 * the surface actually wants — or null, which every renderer here survives by
 * drawing the driver's initial on a plate in their accent.
 *
 * **Two catalogs, one question.** A roster driver's portrait comes from
 * `rivals.js` and a campaign local's from the generic avatar roster, and every
 * surface that draws "the other car's driver" — the VS slot, the campaign map's
 * detail strip, a briefing's dossier — wants the answer without caring which it
 * got. That is `buildRival`'s own argument about profiles, applied to the art:
 * where the thing came from stops mattering the moment it exists.
 *
 * The size is a flag rather than the caller building a path, because picking the
 * wrong one is the mistake `tests/modules.test.js` sweeps for: a card is nine
 * times the pixels of a thumb and the difference is invisible in a 56px cell.
 */
export function entryFaceSrc(entry, { card = false } = {}) {
  if (!entry) return null;
  const rival = rivalById(entry.id);
  if (rival) return card ? rivalCardSrc(rival) : rivalThumbSrc(rival);
  const avatar = avatarById(entry.avatarId);
  return card ? avatarSrc(avatar) : avatarThumbSrc(avatar);
}

/**
 * The entry a saved id refers to, falling back to something real.
 *
 * A stale id is normal rather than exceptional: a ghost is offered on one board
 * and not on the next, so walking from the quarter mile to the mile legitimately
 * takes `ghost` out from under the cursor. Falling back to the roster keeps the
 * pane raceable instead of leaving it pointing at nothing — the same rule the
 * objective strip follows when a mode changes under it.
 */
export function lineupEntry(lineup, id) {
  return (
    lineup.find((entry) => entry.id === id) ??
    lineup.find((entry) => entry.id === DEFAULT_RIVAL_ID) ??
    lineup[0] ??
    null
  );
}

/**
 * Turns a lineup entry into the log that will be raced.
 *
 * A ghost is rebased so its start lands on tick zero: the log carries whatever
 * tick that driver *happened* to stage on, which is however long they sat
 * reading the screen, and replaying it raw would leave the ghost sitting on the
 * line for four seconds after the tree went green.
 *
 * A CPU run is generated here and now, against the options the player is about
 * to race — so the rival is bound by the same distance, the same countdown and
 * the same car. The seed is the caller's, which is what makes a rematch a
 * different run by the same driver rather than a rerun of the same lap.
 */
export function buildRival(entry, options, seed = 1) {
  if (!entry) return null;
  if (entry.kind === KIND_GHOST) {
    return { entry, log: rebaseToStart({ events: entry.ghost.events }) };
  }
  // A profile carried on the entry wins over the roster, and that is what lets
  // a campaign field a **nameless** driver: the opening events race anonymous
  // locals rather than spending one of the ten faces, so the five knobs are
  // authored on the event instead of looked up by id. Everything downstream is
  // untouched — it is still an input log, still generated against the player's
  // own race options, and still cannot be handed a faster car.
  const profile = entry.profile ?? rivalById(entry.id)?.profile ?? null;
  if (!profile) return null;
  return { entry, log: driveRace(options, profile, seed).log };
}

/**
 * Who won, from two finished races. Null while either is still running.
 *
 * A distance race is decided on the clock and a time attack on the ground
 * covered, which is the same split `runValue` makes and the same one
 * `isTimeAttack` exists for — so neither this nor anything reading it needs a
 * mode id. `margin` is always positive and always in the winner's favour; the
 * caller knows which side it is on from `won`.
 */
export function rivalOutcome(mine, theirs) {
  if (!mine || !theirs) return null;
  const timed = mine.timeLimitSeconds !== null;
  if (!timed && (mine.finishTime === null || theirs.finishTime === null)) return null;

  const ours = timed ? mine.vehicle.distance : mine.finishTime;
  const them = timed ? theirs.vehicle.distance : theirs.finishTime;
  const won = timed ? ours > them : ours < them;
  return { won, drew: ours === them, margin: Math.abs(ours - them), timed };
}

export const TONE_WIN = "win";
export const TONE_LOSS = "loss";
export const TONE_DRAW = "draw";

/**
 * The one line the results panel prints about a rival race, or null when there
 * was not one.
 *
 * Shaped here rather than in the renderer for the reason `runSummary` is shaped
 * in `records.js` and `setupView` in `setup-menu.js`: deciding what a run *was*
 * is a rule, and a rule belongs somewhere a test can reach without a canvas.
 *
 * It replaces the results card's caption — the decorative "RUN COMPLETE" — and
 * not the time, because in a rival race who won is the headline and the time is
 * still the number you came for. The margin rides on the `sub` line beside the
 * trap speed, where there was already room.
 */
export function rivalSummary(outcome, entry) {
  if (!outcome || !entry) return null;
  const name = (entry.name ?? "RIVAL").toUpperCase();
  const margin = outcome.timed
    ? `${outcome.margin.toFixed(0)} m`
    : `${outcome.margin.toFixed(3)}s`;

  if (outcome.drew) {
    return { caption: `DEAD HEAT WITH ${name}`, detail: "", tone: TONE_DRAW };
  }
  return {
    caption: outcome.won ? `BEAT ${name}` : `LOST TO ${name}`,
    // Signed the way `formatDelta` signs a record delta, and for the same
    // reason: "-0.312s" has to mean "better" whichever direction the board runs.
    detail: `${outcome.won ? "-" : "+"}${margin}`,
    tone: outcome.won ? TONE_WIN : TONE_LOSS,
  };
}
