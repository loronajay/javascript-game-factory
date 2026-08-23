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

import { MODE_CIRCUIT, MODE_RIVAL } from "../sim/modes.js";
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
 * **Chapter one is the whole Street Circuit**, all nine painted bases from START
 * to the boss plate. A region finished end to end is what makes the rest of the
 * map read as "not yet" rather than as "unfinished": the player can see exactly
 * what a completed district looks like before they are told the next one is shut.
 *
 * Difficulty here is the rival ladder's rule, unchanged: looser hands, never a
 * better car. The opening opponent is slower than Vee — the roster's rookie —
 * on purpose, because the first thing a campaign has to do is let somebody win.
 * Every figure is a **measured** replay time over that event's own distance, and
 * `tests/campaign.test.js` re-measures them: within any one distance the chapter
 * gets monotonically quicker in route order, and nobody in it is beyond a
 * flawless human run.
 *
 * **The three distances are a deliberate braid rather than a ramp.** An eighth
 * is a launch and one shift, a quarter is the mode's home ground, and a half is
 * where the top two gears decide it — so a chapter that only ran quarters would
 * be nine attempts at the same skill. Because each distance keeps its own
 * ordering, a bonus stop can be a *change of question* without also having to be
 * a step up in difficulty.
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
      avatarId: "male-3",
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
      avatarId: "male-9",
      modelId: "shutter-z",
      livery: { paint: { hue: 38, saturation: 0.62, brightness: 0.9, finish: "gloss" } },
      profile: {
        reactionSeconds: 0.58, reactionJitter: 0.26,
        shiftRpmOffset: -930, shiftRpmJitter: 600,
        gateTicks: 16, gateTicksJitter: 4,
        catchSeconds: 0.22, catchJitter: 0.12,
      },
    }),
    brief: [
      { speaker: VOICE_UNKNOWN, text: [
        "Word travels. They have been racing that corner for years",
        "and they would like to know who you are.",
      ] },
      { speaker: "mari", text: [
        "I run this corner. That means I decide who gets a lane,",
        "and tonight you get his. Same quarter.",
      ] },
      { speaker: "mari", text: [
        "He will get off the line before you do. He always does.",
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
    unlocks: ["ch1-short-money"],
    opponent: nobody({
      id: "nobody-muscle",
      name: "Night Shift",
      tier: "LOCAL",
      blurb: "All of it in a straight line. Nothing left once the road stops being short.",
      accent: "#b4553a",
      avatarId: "male-17",
      modelId: "colt-gt",
      livery: { paint: { hue: 12, saturation: 0.7, brightness: 0.85, finish: "gloss" } },
      profile: {
        reactionSeconds: 0.6, reactionJitter: 0.26,
        shiftRpmOffset: -930, shiftRpmJitter: 580,
        gateTicks: 16, gateTicksJitter: 4,
        catchSeconds: 0.23, catchJitter: 0.12,
      },
    }),
    brief: [
      { speaker: "mari", text: [
        "Twice the distance, twice as many chances to throw it away.",
        "Fifth and sixth decide this one, not the launch.",
      ] },
      { speaker: "dez", text: [
        "Long road. Whatever you are doing at the top of third,",
        "keep doing it — you have got three more gears of it.",
      ] },
    ],
  },
  {
    id: "ch1-short-money",
    chapter: 1,
    nodeId: "street-3",
    title: "SHORT MONEY",
    where: "Old Town — the market run",
    splash: "roof-meet.png",
    trackId: "street-race",
    modeId: MODE_RIVAL,
    // An eighth: a launch and one shift, and the whole race is over before the
    // long-road skills the last event asked for have anything to say. That is
    // what a bonus stop is for — a different question, not a harder one.
    objectiveId: "eighth",
    seed: 7731,
    requires: ["ch1-closing-time"],
    unlocks: ["ch1-vee"],
    opponent: nobody({
      id: "nobody-hatch-2",
      name: "Bracket",
      tier: "LOCAL",
      blurb: "Only ever races to the second light. Reckons that is the only bit that counts.",
      accent: "#6fb7c9",
      avatarId: "female-11",
      modelId: "ember-rs",
      livery: { paint: { hue: 190, saturation: 0.66, brightness: 0.95, finish: "gloss" } },
      profile: {
        reactionSeconds: 0.44, reactionJitter: 0.2,
        shiftRpmOffset: -820, shiftRpmJitter: 520,
        gateTicks: 15, gateTicksJitter: 4,
        catchSeconds: 0.2, catchJitter: 0.11,
      },
    }),
    brief: [
      { speaker: "rook", text: [
        "Eighth mile. The money is already down and it is not mine,",
        "so please do not embarrass either of us.",
      ] },
      { speaker: "rook", text: [
        "It is over in second gear. One launch, one shift.",
        "Get that shift wrong and there is no road left to fix it on.",
      ] },
    ],
  },
  {
    id: "ch1-vee",
    chapter: 1,
    nodeId: "street-4",
    // Named for the race rather than for the driver. The dossier and the
    // speaker's plate both say VEE a moment later, and a title that says it a
    // third time is the screen repeating itself instead of telling you anything.
    title: "ON THE LADDER",
    where: "Old Town — she picked the corner",
    splash: "rivals-and-bosses/vee.png",
    trackId: "street-race",
    modeId: MODE_RIVAL,
    objectiveId: "quarter",
    seed: 5310,
    requires: ["ch1-short-money"],
    unlocks: ["ch1-toll-booth"],
    // The first of the ten, on a base the artwork paints as a rival stop. Her
    // hands come from `rivals.js` rather than from here — see `rosterOpponent`.
    opponent: rosterOpponent("vee"),
    brief: [
      { speaker: "mari", text: [
        "This one is not a regular. She is on the ladder,",
        "which means somebody keeps score of what happens next.",
      ] },
      { speaker: "vee", text: [
        "I have watched three of your runs. You are quick and you",
        "are messy, and only one of those is hard to fix.",
      ] },
      { speaker: "vee", text: [
        "Quarter mile. Take it and I will tell them you are worth",
        "the drive. If you do not, I am here next week anyway.",
      ] },
    ],
  },
  {
    id: "ch1-toll-booth",
    chapter: 1,
    nodeId: "street-5",
    title: "TOLL BOOTH",
    where: "Old Town — shrine road",
    splash: "circuit-race.png",
    trackId: "old-town-shrine-loop",
    modeId: MODE_CIRCUIT,
    objectiveId: "three-laps",
    seed: 6194,
    requires: ["ch1-vee"],
    unlocks: ["ch1-last-orders"],
    opponent: nobody({
      id: "nobody-euro",
      name: "Tollgate",
      tier: "LOCAL",
      blurb: "Charges everyone an eighth mile to use his road. Has not lost it in a while.",
      accent: "#a97bff",
      avatarId: "female-19",
      modelId: "meridian-rs",
      livery: {
        paint: { hue: 268, saturation: 0.6, brightness: 0.8, finish: "metallic" },
        layers: [
          { kind: "stripe", position: 0.5, size: 0.08, feather: 0.02, curve: 0, mirrored: false,
            paint: { hue: 0, saturation: 0, brightness: 1.15, finish: "gloss" } },
        ],
      },
      profile: {
        reactionSeconds: 0.3, reactionJitter: 0.14,
        shiftRpmOffset: -520, shiftRpmJitter: 380,
        gateTicks: 12, gateTicksJitter: 3,
        catchSeconds: 0.13, catchJitter: 0.08,
      },
    }),
    brief: [
      { speaker: "rook", text: [
        "He does not want your money. He wants three laps,",
        "and every barrier on the shrine loop knows his name.",
      ] },
      { speaker: "dez", text: [
        "This is not the strip. Brake, turn, and hit every gate.",
        "Same car, same paint — now make it go around corners.",
      ] },
    ],
  },
  {
    id: "ch1-last-orders",
    chapter: 1,
    nodeId: "street-6",
    title: "LAST ORDERS",
    where: "Old Town — out past the depot",
    splash: "rooftop-meet-high-stakes.png",
    trackId: "street-race",
    modeId: MODE_RIVAL,
    objectiveId: "half",
    seed: 8825,
    requires: ["ch1-toll-booth"],
    unlocks: ["ch1-switch"],
    opponent: nobody({
      id: "nobody-gt",
      name: "Depot",
      tier: "LOCAL",
      blurb: "Drives it like a job. Never brilliant, never once throws one away either.",
      accent: "#8fd14f",
      avatarId: "male-5",
      modelId: "gravel-stx",
      livery: { paint: { hue: 95, saturation: 0.5, brightness: 0.7, finish: "matte" } },
      profile: {
        reactionSeconds: 0.42, reactionJitter: 0.18,
        shiftRpmOffset: -640, shiftRpmJitter: 420,
        gateTicks: 13, gateTicksJitter: 3,
        catchSeconds: 0.16, catchJitter: 0.09,
      },
    }),
    brief: [
      { speaker: "dez", text: [
        "Half mile, and this one does not make mistakes.",
        "You cannot wait for him to hand it to you.",
      ] },
      { speaker: "dez", text: [
        "So it is on the tacho. Every gear, on the number,",
        "six times. That is the whole race.",
      ] },
    ],
  },
  {
    id: "ch1-switch",
    chapter: 1,
    nodeId: "street-7",
    title: "PACKED HOUSE",
    where: "Old Town — the corner, packed out",
    splash: "rivals-and-bosses/switch.png",
    trackId: "street-race",
    modeId: MODE_RIVAL,
    objectiveId: "quarter",
    seed: 3466,
    requires: ["ch1-last-orders"],
    unlocks: ["ch1-street-boss"],
    opponent: rosterOpponent("switch"),
    brief: [
      { speaker: "switch", text: [
        "Vee said you were worth the drive. She says that about",
        "a lot of people and she is wrong about most of them.",
      ] },
      { speaker: "switch", text: [
        "Quarter. Whoever takes it gets the boss next,",
        "and I have waited on that a lot longer than you have.",
      ] },
    ],
  },
  {
    id: "ch1-street-boss",
    chapter: 1,
    nodeId: "street-boss",
    title: "THE ROAD OUT",
    where: "Old Town — the last half mile out of the district",
    splash: "rivals-and-bosses/saint.png",
    trackId: "street-race",
    modeId: MODE_RIVAL,
    objectiveId: "half",
    seed: 1207,
    requires: ["ch1-switch"],
    // The end of the district. What it opens is chapter two, which is not
    // written — an empty `unlocks` is the honest way to say so, and every base
    // past here reads as `soon` rather than as locked.
    unlocks: [],
    opponent: rosterOpponent("saint"),
    brief: [
      { speaker: "mari", text: [
        "That is the corner done. Everything east of here is",
        "somebody else's, and he is the one who says so.",
      ] },
      { speaker: "saint", text: [
        "I have got the best launch in this district and you have",
        "got half a mile to make that not matter.",
      ] },
      { speaker: "saint", text: [
        "Beat me and the road out of Old Town is yours.",
        "Nobody has managed it yet. Somebody will.",
      ] },
    ],
  },
];

export const FIRST_EVENT_ID = EVENTS[0].id;

export function eventById(id) {
  return EVENTS.find((event) => event.id === id) ?? null;
}
