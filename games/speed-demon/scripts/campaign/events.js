// The campaign catalog — pure.
//
// **An event is data.** There is no `if (eventId === "…")` anywhere in the
// cabinet and there must never be one: a campaign race is a rival race with a
// script around it, so authoring a mission is a row here and nothing else. That
// is the property `MODES`, `RIVALS` and the car atlas already have.
//
// ## Two kinds of opponent, and the map decides which
//
// The ten drivers in `rival/rivals.js` have faces, bios and a measured
// difficulty ladder, and they are **spent** once they are introduced — a rival
// the player has already beaten twice is not a rival any more. So they are not
// spread evenly across the campaign; they are saved for the bases the artwork
// itself marks out.
//
// `campaign-map.png` paints four kinds of stop, and the rule follows the
// picture rather than being invented on top of it:
//
//   race / bonus / start   an **anonymous local**. The event carries its own
//                          `opponent` — a lineup entry with the five driver
//                          knobs on it rather than a roster id.
//   rival / boss           one of the ten, through `rosterOpponent`.
//
// That is checked in `tests/campaign.test.js`, both ways: a roster face on a
// plain race base spends a character on a filler event, and a nameless driver on
// a painted boss plate is a boss fight against nobody. **No roster face may
// appear twice**, for the reason they are rationed at all.
//
// `buildRival` reads a profile off the entry when there is one and falls back to
// the roster row when there is not, which is the only change the rival layer
// ever needed: everything downstream still sees an input log and cannot tell
// where it came from.
//
// ## And every driver has a face now
//
// An anonymous local is anonymous in *name* — "Some Kid" — and that was once
// also true of their portrait, because the only faces in the cabinet were the
// ten. The generic avatar roster changed that: `avatarId` puts a real face on a
// nameless driver at no cost to the ten, so the VS card, the map's detail strip
// and the briefing all show a person rather than a letter on a plate. The
// placeholder path still works and is still exercised — it is what a missing
// file degrades to — but it is no longer the ordinary case.
//
// The briefing's voice is `campaign/contacts.js`, which is where the same
// argument is written out in full.

import { MODE_RIVAL } from "../sim/modes.js";
import { createLivery } from "../garage/livery.js";
import { KIND_CPU, rivalEntry } from "../rival/lineup.js";
import { rivalById } from "../rival/rivals.js";
import { VOICE_UNKNOWN } from "./contacts.js";

/** Where the mission art lives. Splashes are 1672x941 and drawn full-bleed. */
export const SPLASH_DIR = "assets/mission-splashes";

export function splashSrc(event) {
  return `${SPLASH_DIR}/${event.splash}`;
}

/** Re-exported so a `brief` row can name the voice without a second import. */
export { VOICE_UNKNOWN };

/**
 * A nameless driver, as a lineup entry.
 *
 * The shape matches what `rivalEntry` builds for a roster rival, minus the
 * identity: no roster portrait — the face comes from the generic avatar roster
 * instead — and a profile carried inline.
 *
 * `avatarId` is deliberately a plain id rather than a resolved path. This module
 * is the catalog; which of the two derived sizes a given surface wants is the
 * surface's business, and baking a `cards/` path in here would be the one thing
 * `tests/modules.test.js` sweeps for the moment a small cell drew it.
 */
function nobody({ id, name, tier, blurb, accent, avatarId = null, modelId, livery, profile }) {
  return {
    id,
    kind: KIND_CPU,
    name,
    tier,
    blurb,
    accent,
    avatarId,
    initial: name.charAt(0).toUpperCase(),
    modelId,
    livery: createLivery(livery),
    // What makes this raceable without a roster row. See `buildRival`.
    profile,
  };
}

/**
 * One of the ten, as an event's opponent.
 *
 * Through `rivalEntry` rather than by hand so the campaign and the rival pane
 * agree on what a roster driver *is* — and with no profile of its own, so the
 * hands come from `rivals.js` and a retune of the ladder moves the campaign with
 * it. An event that wanted its own knobs on a roster face would be a rival who
 * drives differently depending on which screen you met them from.
 */
function rosterOpponent(id) {
  const rival = rivalById(id);
  if (!rival) throw new Error(`campaign: unknown rival ${id}`);
  return rivalEntry(rival);
}

/**
 * Chapter one, hung on the painted map.
 *
 * `nodeId` names a base that is **already on the artwork** — the map paints
 * every stop and every route between them, so an event does not place itself,
 * it moves into a place that exists. Adding one is picking the next painted
 * node along the route and writing the race for it; nothing is positioned, and
 * no trail is drawn, because both are in the picture.
 *
 * Difficulty here is the rival ladder's rule, unchanged: looser hands, never a
 * better car. The opening opponent is slower than Vee — the roster's rookie —
 * on purpose, because the first thing a campaign has to do is let somebody win.
 */
export const EVENTS = [
  {
    id: "ch1-first-run",
    chapter: 1,
    nodeId: "start",
    title: "FIRST RUN",
    where: "Old Town — after closing",
    splash: "street-race.png",
    trackId: "street-race",
    modeId: MODE_RIVAL,
    objectiveId: "quarter",
    // Authored, so this event plays the same way every time it is attempted and
    // its difficulty can be asserted in a test rather than eyeballed.
    seed: 4117,
    requires: [],
    unlocks: ["ch1-regulars"],
    opponent: nobody({
      id: "nobody-hatch",
      name: "Some Kid",
      tier: "LOCAL",
      blurb: "Somebody's hatchback and somebody's nerve. Grabs third about a thousand early.",
      accent: "#8fa3b8",
      modelId: "scalpel-r",
      livery: { paint: { hue: 205, saturation: 0.45, brightness: 0.8, finish: "gloss" } },
      profile: {
        reactionSeconds: 0.68, reactionJitter: 0.3,
        shiftRpmOffset: -1100, shiftRpmJitter: 700,
        gateTicks: 18, gateTicksJitter: 5,
        catchSeconds: 0.26, catchJitter: 0.14,
      },
    }),
    brief: [
      { speaker: VOICE_UNKNOWN, text: [
        "You found the number, so you already know how this works.",
        "Quarter mile, old town, nobody watching.",
      ] },
      { speaker: VOICE_UNKNOWN, text: [
        "The car in the other lane belongs to a kid who has never",
        "shifted anything properly in his life. Neither had you,",
        "an hour ago. Difference is you have been practising.",
      ] },
      { speaker: VOICE_UNKNOWN, text: [
        "Lift, work the gate, catch it as the clutch bites.",
        "Three inputs, every gear. Beat him and I will call again.",
      ] },
    ],
  },
  {
    id: "ch1-regulars",
    chapter: 1,
    nodeId: "street-1",
    title: "THE REGULARS",
    where: "Old Town — the same corner, a week on",
    splash: "underpass-meet.png",
    trackId: "street-race",
    modeId: MODE_RIVAL,
    objectiveId: "quarter",
    seed: 9042,
    requires: ["ch1-first-run"],
    unlocks: ["ch1-closing-time"],
    opponent: nobody({
      id: "nobody-coupe",
      name: "The Regular",
      tier: "LOCAL",
      blurb: "Turns up every week and wins most of them. Tidy launch, lazy third.",
      accent: "#c9a227",
      modelId: "shutter-z",
      livery: { paint: { hue: 38, saturation: 0.62, brightness: 0.9, finish: "gloss" } },
      profile: {
        reactionSeconds: 0.5, reactionJitter: 0.22,
        shiftRpmOffset: -750, shiftRpmJitter: 500,
        gateTicks: 14, gateTicksJitter: 4,
        catchSeconds: 0.18, catchJitter: 0.1,
      },
    }),
    brief: [
      { speaker: VOICE_UNKNOWN, text: [
        "Word travels. They have been racing that corner for years",
        "and they would like to know who you are.",
      ] },
      { speaker: VOICE_UNKNOWN, text: [
        "Same quarter. He will get off the line before you do.",
        "Take it back in the gears.",
      ] },
    ],
  },
  {
    id: "ch1-closing-time",
    chapter: 1,
    nodeId: "street-2",
    title: "CLOSING TIME",
    where: "Old Town — the long half mile",
    splash: "duel-race.png",
    trackId: "street-race",
    modeId: MODE_RIVAL,
    objectiveId: "half",
    seed: 2288,
    requires: ["ch1-regulars"],
    unlocks: [],
    opponent: nobody({
      id: "nobody-muscle",
      name: "Night Shift",
      tier: "LOCAL",
      blurb: "All of it in a straight line. Nothing left once the road stops being short.",
      accent: "#b4553a",
      modelId: "colt-gt",
      livery: { paint: { hue: 12, saturation: 0.7, brightness: 0.85, finish: "gloss" } },
      profile: {
        reactionSeconds: 0.42, reactionJitter: 0.2,
        shiftRpmOffset: -600, shiftRpmJitter: 430,
        gateTicks: 13, gateTicksJitter: 3,
        catchSeconds: 0.15, catchJitter: 0.09,
      },
    }),
    brief: [
      { speaker: VOICE_UNKNOWN, text: [
        "Twice the distance, twice as many chances to throw it away.",
        "Fifth and sixth decide this one, not the launch.",
      ] },
    ],
  },
];

export const FIRST_EVENT_ID = EVENTS[0].id;

export function eventById(id) {
  return EVENTS.find((event) => event.id === id) ?? null;
}
