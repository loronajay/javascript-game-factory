// The campaign catalog — pure.
//
// **An event is data.** There is no `if (eventId === "…")` anywhere in the
// cabinet and there must never be one: a campaign race is a rival race with a
// script around it, so authoring a mission is a row here and nothing else. That
// is the property `MODES`, `RIVALS` and the car atlas already have.
//
// ## The opponent in chapter one is nobody
//
// The ten drivers in `rival/rivals.js` are the campaign's rivals and bosses —
// they have faces, bios and a difficulty ladder, and they are spent once they
// are introduced. The opening events are deliberately against **anonymous**
// drivers: a name at the start of a career is a name the player has no reason
// to care about, and burning a roster face on a tutorial race wastes it.
//
// So an event may carry its own `opponent`, which is a lineup entry with the
// five driver knobs on it rather than a roster id. `buildRival` reads a profile
// off the entry when there is one, which is the only change the rival layer
// needed: everything downstream still sees an input log and cannot tell where
// it came from.
//
// ## And the voice is nobody either
//
// The briefing is spoken by an unnamed contact — no portrait, no name, a phone
// that knows where the races are. Same reasoning: the characters worth meeting
// are the ones you race, and a narrator who turns out to be somebody is a card
// that can be played later. Anything with a face belongs in `rivals.js`.

import { MODE_RIVAL } from "../sim/modes.js";
import { createLivery } from "../garage/livery.js";
import { KIND_CPU } from "../rival/lineup.js";

/** Where the mission art lives. Splashes are 1672x941 and drawn full-bleed. */
export const SPLASH_DIR = "assets/mission-splashes";

export function splashSrc(event) {
  return `${SPLASH_DIR}/${event.splash}`;
}

/**
 * The speaker label for the unnamed contact.
 *
 * A constant rather than a string typed into each line, because the day this
 * turns out to be somebody, it is one edit — and until then every line it
 * speaks is provably the same voice.
 */
export const VOICE_UNKNOWN = "UNKNOWN";

/**
 * A nameless driver, as a lineup entry.
 *
 * The shape matches what `lineupFor` builds for a roster rival, minus the
 * identity: no portrait file (so the card falls back to the initial plate, the
 * repo's placeholder rule) and a profile carried inline.
 */
function nobody({ id, name, tier, blurb, accent, modelId, livery, profile }) {
  return {
    id,
    kind: KIND_CPU,
    name,
    tier,
    blurb,
    accent,
    initial: name.charAt(0).toUpperCase(),
    modelId,
    livery: createLivery(livery),
    // What makes this raceable without a roster row. See `buildRival`.
    profile,
  };
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
