// The rival roster.
//
// PURE. A rival is a row here and nothing else — a face, a car, and the five
// numbers `cpu-driver.js` turns into a pair of hands. Adding one is a row; there
// is no rival code to write, which is the same property the mode catalog and the
// car atlas have and the reason all three are shaped this way.
//
// **A rival is not a faster car.** Every one of them drives the player's own
// spec, so difficulty is entirely a matter of how well the gearbox is worked:
// how long after green the throttle comes on, how close to the power crossover
// the clutch goes in, how quickly the knob crosses the gate, and how cleanly the
// gas is picked back up. That is deliberate. A rival you lose to has out-driven
// you at something you can see yourself doing better next time, rather than
// having been given an engine you cannot buy.
//
// The ladder runs from about 15.3s to about 12.5s over a quarter mile, against a
// human perfect run of 12.04s. **The top of the roster sits above that on
// purpose**: a rival nobody can beat is not a difficulty setting, it is a wall,
// and the whole point of racing one is that the gap is made of things you can
// name. `tests/rival.test.js` measures the whole ladder over forty seeds each
// and fails if any rung is not strictly faster than the one below it — so
// retuning a profile is checked rather than eyeballed.
//
// **The order is the difficulty order**, easiest first, and it is also the order
// a campaign would unlock them in. Who is hardest is an authoring decision, not
// a measured one: swap two rows and the ladder swaps with them.

import { createLivery } from "../garage/livery.js";

/**
 * Where the portraits live.
 *
 * The files are named `firstname-lastname-nickname.png` — the convention in
 * `assets/characters/naming-slug-rules.txt` — and that full slug is carried on
 * each row rather than rebuilt from the name fields, because a nickname that
 * happens to match a surname (Kuroda) would otherwise produce the wrong path.
 */
export const RIVAL_PORTRAIT_DIR = "assets/characters";

/**
 * The master. **No runtime path may point at one** — the ten are 1254x1254 PNGs
 * totalling 23MB, and the largest a portrait is ever drawn is the VS card's slot
 * at ~322x362. This is here for `tools/make-face-thumbs.py`, which reads them,
 * and for the asset test, which checks they exist.
 */
export function rivalPortraitSrc(rival) {
  return `${RIVAL_PORTRAIT_DIR}/${rival.portrait}`;
}

/**
 * The two sizes the game draws, derived by `tools/make-face-thumbs.py` and named
 * for the rival's **id** rather than the master's naming-slug — so a path can be
 * built from an id alone, the same property the avatar manifest has.
 *
 * The `rival-` prefix is not decoration: the derived faces from both catalogs
 * are held in one cache keyed by path, and `zero` could as easily be an avatar.
 *
 *   thumbSrc  256px, ~17KB   the setup screen's 56px rival strip, all ten of
 *                            which load at boot because the pane shows them at
 *                            once. That used to be 23MB; it is now 170KB.
 *   cardSrc   768px, ~100KB  the VS card's slot, one at a time.
 */
export function rivalThumbSrc(rival) {
  return `${RIVAL_PORTRAIT_DIR}/thumbs/rival-${rival.id}.jpg`;
}

export function rivalCardSrc(rival) {
  return `${RIVAL_PORTRAIT_DIR}/cards/rival-${rival.id}.jpg`;
}

/** The full name, for anywhere with room for one. The cards use the nickname. */
export function rivalFullName(rival) {
  return `${rival.first} "${rival.name}" ${rival.last}`;
}

export const RIVALS = [
  {
    id: "vee",
    first: "Valeria",
    last: "Cruz",
    name: "Vee",
    portrait: "valeria-cruz-vee.png",
    tier: "ROOKIE",
    blurb: "Learner hands and a big right foot. Grabs every gear a thousand short.",
    accent: "#f2c14e",
    modelId: "ember-rs",
    livery: createLivery({ paint: { hue: 45, saturation: 0.8, brightness: 1.1, finish: "gloss" } }),
    profile: {
      reactionSeconds: 0.55, reactionJitter: 0.25,
      shiftRpmOffset: -700, shiftRpmJitter: 550,
      gateTicks: 15, gateTicksJitter: 4,
      catchSeconds: 0.2, catchJitter: 0.12,
    },
  },
  {
    id: "switch",
    first: "Nia",
    last: "Carter",
    name: "Switch",
    portrait: "nia-carter-switch.png",
    tier: "ROOKIE",
    blurb: "Getting the hang of it. Still thinking about the gate while she is in it.",
    accent: "#ff9f6b",
    modelId: "scalpel-r",
    livery: createLivery({ paint: { hue: 325, saturation: 0.7, brightness: 1.1, finish: "gloss" } }),
    profile: {
      reactionSeconds: 0.46, reactionJitter: 0.2,
      shiftRpmOffset: -520, shiftRpmJitter: 470,
      gateTicks: 13, gateTicksJitter: 4,
      catchSeconds: 0.16, catchJitter: 0.1,
    },
  },
  {
    id: "saint",
    first: "Nico",
    last: "Varela",
    name: "Saint",
    portrait: "nico-varela-saint.png",
    tier: "CLUB",
    blurb: "Quick off the light, ragged through the gate. Wins the launch, loses the middle.",
    accent: "#ff7a33",
    modelId: "colt-gt",
    livery: createLivery({
      paint: { hue: 25, saturation: 0.9, brightness: 1.05, finish: "gloss" },
      layers: [
        { kind: "stripe", position: 0.44, size: 0.07, feather: 0, curve: 0, mirrored: true,
          paint: { hue: 0, saturation: 0, brightness: 0.16, finish: "gloss" } },
      ],
    }),
    profile: {
      reactionSeconds: 0.36, reactionJitter: 0.16,
      shiftRpmOffset: -350, shiftRpmJitter: 380,
      gateTicks: 11, gateTicksJitter: 3,
      catchSeconds: 0.12, catchJitter: 0.08,
    },
  },
  {
    id: "knox",
    first: "Darius",
    last: "Reed",
    name: "Knox",
    portrait: "darius-reed-knox.png",
    tier: "CLUB",
    blurb: "Muscle and patience. Shifts a shade early and makes up for it everywhere else.",
    accent: "#d95f5f",
    modelId: "stallion-gt",
    livery: createLivery({
      paint: { hue: 0, saturation: 0.85, brightness: 0.9, finish: "gloss" },
      layers: [
        { kind: "band", position: 0.7, size: 0.18, feather: 0.02, curve: 0, mirrored: false,
          paint: { hue: 0, saturation: 0, brightness: 0.16, finish: "matte" } },
      ],
    }),
    profile: {
      reactionSeconds: 0.29, reactionJitter: 0.12,
      shiftRpmOffset: -230, shiftRpmJitter: 290,
      gateTicks: 10, gateTicksJitter: 3,
      catchSeconds: 0.09, catchJitter: 0.06,
    },
  },
  {
    id: "mako",
    first: "Malakai",
    last: "Taufua",
    name: "Mako",
    portrait: "malakai-taufua-mako.png",
    tier: "PRO",
    blurb: "Reads the tacho properly. Everything after that is a fraction slow.",
    accent: "#8fd14f",
    modelId: "monolith-8",
    livery: createLivery({
      paint: { hue: 0, saturation: 0, brightness: 0.42, finish: "matte" },
      layers: [
        { kind: "band", position: 0.03, size: 0.14, feather: 0, curve: -0.05, mirrored: false,
          paint: { hue: 85, saturation: 0.8, brightness: 1.05, finish: "gloss" } },
      ],
    }),
    profile: {
      reactionSeconds: 0.22, reactionJitter: 0.09,
      shiftRpmOffset: -120, shiftRpmJitter: 200,
      gateTicks: 8, gateTicksJitter: 2,
      catchSeconds: 0.06, catchJitter: 0.05,
    },
  },
  {
    id: "mirage",
    first: "Zaid",
    last: "Rahman",
    name: "Mirage",
    portrait: "zaid-rahman-mirage.png",
    tier: "PRO",
    blurb: "Smooth to watch and hard to read. Never wastes a gate, never hurries one either.",
    accent: "#c9a227",
    modelId: "toro-sv",
    livery: createLivery({
      paint: { hue: 45, saturation: 0.75, brightness: 1.1, finish: "metallic" },
      layers: [
        { kind: "stripe", position: 0.5, size: 0.09, feather: 0.02, curve: 0, mirrored: false,
          paint: { hue: 0, saturation: 0, brightness: 0.16, finish: "gloss" } },
      ],
    }),
    profile: {
      reactionSeconds: 0.17, reactionJitter: 0.07,
      shiftRpmOffset: -70, shiftRpmJitter: 150,
      gateTicks: 7, gateTicksJitter: 2,
      catchSeconds: 0.045, catchJitter: 0.04,
    },
  },
  {
    id: "wizard",
    first: "Cole",
    last: "Mercer",
    name: "Wizard",
    portrait: "cole-mercer-wizard.png",
    tier: "ACE",
    blurb: "Does something clever with the gate that nobody has managed to copy.",
    accent: "#a97bff",
    modelId: "halo-lt",
    livery: createLivery({
      paint: { hue: 275, saturation: 0.7, brightness: 0.9, finish: "metallic" },
      layers: [
        { kind: "band", position: 0.185, size: 0.38, feather: 0.04, curve: 0, mirrored: false,
          paint: { hue: 0, saturation: 0, brightness: 0.16, finish: "gloss" } },
      ],
    }),
    profile: {
      reactionSeconds: 0.14, reactionJitter: 0.06,
      shiftRpmOffset: -45, shiftRpmJitter: 120,
      gateTicks: 6, gateTicksJitter: 2,
      catchSeconds: 0.035, catchJitter: 0.035,
    },
  },
  {
    id: "prince",
    first: "Ren",
    last: "Takeda",
    name: "Prince",
    portrait: "ren-takeda-prince.png",
    tier: "ACE",
    blurb: "Never misses a shift. Just never quite the first to move, either.",
    accent: "#7fd8ff",
    modelId: "vega-qv",
    livery: createLivery({
      paint: { hue: 0, saturation: 0, brightness: 1.28, finish: "metallic" },
      layers: [
        { kind: "stripe", position: 0.5, size: 0.11, feather: 0.03, curve: 0, mirrored: false,
          paint: { hue: 175, saturation: 0.75, brightness: 0.95, finish: "gloss" } },
      ],
    }),
    profile: {
      reactionSeconds: 0.11, reactionJitter: 0.05,
      shiftRpmOffset: -25, shiftRpmJitter: 90,
      gateTicks: 6, gateTicksJitter: 1,
      catchSeconds: 0.025, catchJitter: 0.03,
    },
  },
  {
    id: "zero",
    first: "Mina",
    last: "Park",
    name: "Zero",
    portrait: "mina-park-zero.png",
    tier: "DEMON",
    blurb: "Named for her reaction time. It is not much of an exaggeration.",
    accent: "#ff5fd2",
    modelId: "kaido-r",
    livery: createLivery({
      paint: { hue: 275, saturation: 0.75, brightness: 0.55, finish: "gloss" },
      layers: [
        { kind: "band", position: 0.92, size: 0.2, feather: 0.02, curve: 0.05, mirrored: false,
          paint: { hue: 175, saturation: 0.8, brightness: 1, finish: "gloss" } },
      ],
      underglow: { enabled: true, hue: 300, intensity: 0.8 },
    }),
    profile: {
      reactionSeconds: 0.06, reactionJitter: 0.035,
      shiftRpmOffset: -10, shiftRpmJitter: 60,
      gateTicks: 5, gateTicksJitter: 1,
      catchSeconds: 0.015, catchJitter: 0.02,
    },
  },
  {
    id: "kuroda",
    first: "Masaru",
    last: "Kuroda",
    name: "Kuroda",
    portrait: "masaru-kuroda-kuroda.png",
    tier: "LEGEND",
    blurb: "Flawless, and knows it. Beat this and you have beaten the gearbox.",
    accent: "#ff4d4d",
    modelId: "kaido-gts",
    livery: createLivery({
      paint: { hue: 0, saturation: 0, brightness: 0.16, finish: "gloss" },
      layers: [
        { kind: "stripe", position: 0.44, size: 0.05, feather: 0, curve: 0, mirrored: true,
          paint: { hue: 0, saturation: 0.9, brightness: 1, finish: "gloss" } },
      ],
      underglow: { enabled: true, hue: 0, intensity: 0.9 },
    }),
    profile: {
      reactionSeconds: 0.03, reactionJitter: 0.025,
      shiftRpmOffset: 0, shiftRpmJitter: 40,
      gateTicks: 4, gateTicksJitter: 1,
      catchSeconds: 0.008, catchJitter: 0.015,
    },
  },
];

/**
 * Who the pane opens on. Deliberately mid-table rather than the easiest: a
 * player arriving here has already driven the solo modes, and opening on the
 * rookie makes the first rival race a formality.
 */
export const DEFAULT_RIVAL_ID = "mako";

export function rivalById(id) {
  return RIVALS.find((rival) => rival.id === id) ?? null;
}
