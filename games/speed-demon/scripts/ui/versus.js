// The VS card: two drivers, side by side, before the tree.
//
// PURE. No canvas, no clock of its own — `stepVersus` is driven by the game
// loop's fixed timestep the way everything else in the cabinet is, and
// `render/versus.js` draws whatever this says. The same split as every other
// screen here.
//
// ## It is a curtain, not a menu
//
// The race is already built by the time this is on screen. Nothing on the card
// is a choice — there is no cursor, and every key dismisses it — so ESC does not
// mean "back" here the way it does everywhere else: there is nothing behind the
// curtain to go back *to* except a run that has already been committed. It holds
// for a few seconds and then lifts by itself, because a player who has seen it
// forty times should not have to press anything on the forty-first.
//
// ## Offline only, deliberately
//
// A rival race and a campaign race sit in staging until the driver stages them,
// so a curtain costs nothing. **An online round does not** — the server owns the
// tree and schedules the start — so a card held over a running countdown is a
// way to lose a race before you have seen the strip. Online is left out until
// the round's own pre-race wait can carry it, and the composition root simply
// never builds one for it.
//
// ## A side is resolved here, not in the renderer
//
// Who the other car *is* — a face, a name, a tag — is a rule about the lineup,
// and rules belong where a test can reach them. The renderer takes two finished
// sides and draws them; it never asks the roster anything.

import { KIND_GHOST, entryFaceSrc } from "../rival/lineup.js";
import { avatarById, avatarSrc } from "../profile/avatars.js";
import { displayName } from "../profile/profile.js";

/**
 * How long the card holds before it lifts on its own.
 *
 * Long enough to read two names and see two faces, short enough that it is not
 * the thing standing between a player and a retry. Any key or click cuts it
 * short, so this is the ceiling rather than the cost.
 */
export const VERSUS_SECONDS = 3.2;

/**
 * How long the two halves take to slide in. Presentation, but it lives here
 * rather than in the renderer because it is measured against the same clock the
 * hold is — two timers would drift, and the entrance would outlast the card on a
 * slow frame.
 */
export const VERSUS_ENTRANCE_SECONDS = 0.45;

/**
 * One side of the card.
 *
 * `imageSrc` is a path rather than an image because this module is pure; the
 * composition root loads it. Null is a normal value — a campaign event's
 * anonymous local has no portrait, and the renderer draws the initial on a plate
 * in the driver's accent colour, which is the rival strip's placeholder rule.
 */
function side({ id = "", name = "", tag = "", imageSrc = null, initial = "?", accent = "#ff5a2e", model = null, livery = null, stat = "" }) {
  return { id, name: String(name).toUpperCase(), tag: String(tag).toUpperCase(), imageSrc, initial, accent, model, livery, stat };
}

/**
 * The player's side, from their driver profile and the car they are taking to
 * the line.
 *
 * The stat is whatever is worth boasting about on this board — their own best,
 * usually — and it is passed in rather than looked up, because the records live
 * behind a store and this module is pure.
 */
export function playerSide(profile, { model = null, livery = null, stat = "" } = {}) {
  const avatar = avatarById(profile?.avatarId);
  return side({
    id: "player",
    name: displayName(profile),
    tag: "YOU",
    imageSrc: avatarSrc(avatar),
    initial: avatar?.initial ?? "P",
    accent: "#ff5a2e",
    model,
    livery,
    stat,
  });
}

/**
 * The other car's side, from a lineup entry.
 *
 * A ghost wears the player's own face on purpose: it *is* them, and a generic
 * plate opposite their own portrait would read as a third driver rather than as
 * the run they are chasing.
 */
export function rivalSide(entry, { model = null, livery = null, stat = "", profile = null } = {}) {
  if (!entry) return null;
  if (entry.kind === KIND_GHOST) {
    const avatar = avatarById(profile?.avatarId);
    return side({
      id: entry.id,
      name: displayName(profile),
      tag: "YOUR GHOST",
      imageSrc: avatarSrc(avatar),
      initial: entry.initial ?? "PB",
      accent: entry.accent ?? "#57d98a",
      model,
      livery,
      stat,
    });
  }
  // A campaign event fields a driver who is not on the roster at all, and they
  // wear a face from the generic avatar roster instead. `entryFaceSrc` is the
  // one place that fork lives — `buildRival`'s rule about profiles, applied to
  // the art — so this asks for a card-sized portrait and never for which
  // catalog it came out of.
  return side({
    id: entry.id,
    name: entry.name,
    tag: entry.tier ?? "RIVAL",
    imageSrc: entryFaceSrc(entry, { card: true }),
    initial: entry.initial ?? "?",
    accent: entry.accent ?? "#4aa8ff",
    model,
    livery,
    stat,
  });
}

/**
 * Builds the card. `headline` is what the race is — the campaign event's title,
 * or the mode and distance — and it is the caller's, because only they know
 * whether this run is a career race or a one-off.
 */
export function createVersus({ player, opponent, headline = "", subtitle = "" }) {
  return { elapsed: 0, player, opponent, headline: headline.toUpperCase(), subtitle: subtitle.toUpperCase() };
}

export function stepVersus(versus, dt) {
  return versus ? { ...versus, elapsed: versus.elapsed + dt } : versus;
}

/** Whether the curtain has held long enough to lift by itself. */
export function versusDone(versus) {
  return !versus || versus.elapsed >= VERSUS_SECONDS;
}

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/**
 * What the renderer draws.
 *
 * `entrance` runs 0→1 over the entrance and stays at 1; the renderer slides the
 * two halves in on it. `hold` runs 0→1 across the whole card and drives the
 * progress bar that says the curtain is going to lift on its own — a card that
 * dismisses itself with no warning reads as a dropped frame.
 */
export function versusView(versus) {
  if (!versus) return null;
  return {
    headline: versus.headline,
    subtitle: versus.subtitle,
    player: versus.player,
    opponent: versus.opponent,
    entrance: clamp01(versus.elapsed / VERSUS_ENTRANCE_SECONDS),
    hold: clamp01(versus.elapsed / VERSUS_SECONDS),
  };
}
