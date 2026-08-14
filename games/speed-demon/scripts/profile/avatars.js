// The faces a driver can wear.
//
// PURE. A manifest and nothing else — the same job `assets/car-atlas.js` does
// for the bodies, and for the same reason: adding a face should be a row here
// rather than a change to a picker.
//
// ## Three groups, and the grouping is presentation only
//
// The art arrived as three folders — twenty men, twenty-four women, and five
// named guests — and the picker shows them as three labelled bands rather than
// forty-nine flat cells, exactly as the car grid shows archetypes. Nothing about
// racing, storage or the VS card reads the group.
//
// ## An avatar id is stored on a saved profile and must never be renamed
//
// The car atlas' rule, for the car atlas' reason: an id that changes orphans
// whatever is already pointing at it. The ids are derived from the file path
// (`male-7`, `female-12`, `fast-vin`) so a re-export of the art under the same
// name keeps every profile intact.
//
// ## There is no crop rectangle here, and that was checked
//
// The rival portraits carry `PORTRAIT_CROP` because they share a composition —
// a driver standing beside a car — and a 56px cell of the whole scene is eight
// pixels of face. These do not share one: some are head-and-shoulders, some are
// half-body offset to one side, and one is a full scene with the driver small in
// the upper corner. A single crop would frame two of the three groups wrongly,
// and per-avatar crop rects for forty-nine files is data nobody will maintain.
//
// So an avatar is drawn **whole into a square cell** — which is exactly what the
// source is, 1254x1254 — and the VS slot covers rather than contains, losing a
// little off the sides where the subject almost never is. That works on every
// face with no per-avatar data at all, which is the same property that makes
// adding one a row.
//
// ## The master is never served; two derived sizes are
//
// The masters are 1254x1254 PNGs — 111MB across the forty-nine — and **nothing
// in the game draws one at anything like that size**. The largest face on screen
// is the VS card's slot at roughly 322x362; the smallest is a 112px cell in this
// picker. Serving the masters meant filling one screen of the grid pulled ~70MB.
//
// So `tools/make-face-thumbs.py` writes two JPEG sets beside them and each entry
// here carries a path to each:
//
//   thumbSrc  256px, ~17KB   the picker's grid. 256 rather than 128 because a
//                            112px cell is 224 real pixels at 2x device ratio.
//   cardSrc   768px, ~110KB  the profile card's photo (316px) and the VS card's
//                            slot. 768 is the first size that never upscales
//                            either of those at 2x.
//
// **`src` is the master and no runtime path may point at it.** It is here so the
// tool and the asset test can find it, and because a later surface may want a
// face larger than the VS card does; `tests/profile.test.js` asserts nothing in
// `scripts/` loads one. If the art is re-exported, re-run the tool — `--check`
// fails on anything stale.
//
// Even derived, these are **not loaded at boot**: the whole thumb set is under a
// megabyte, but a card is 110KB and there are 49 of them. The picker asks for the
// rows in its window and the card asks for the face it is wearing — the
// mission-splash arrangement — and every renderer degrades to a plate with the
// driver's initial on it while a file is in flight.

/** Where the art lives. One folder per group. */
const AVATAR_ROOT = "assets/avatars";

/**
 * The derived sizes, as the folders they live in beside each master.
 *
 * **Keep in lockstep with `SIZES` in `tools/make-face-thumbs.py`** — the tool
 * writes these folders and the manifest builds paths into them, so a name that
 * exists on one side only is a path that 404s or a file nothing loads.
 */
export const FACE_THUMBS = "thumbs";
export const FACE_CARDS = "cards";

/**
 * The roster, as three bands.
 *
 * `prefix` is the id's first segment and `folder` is the path's — they are
 * separate because `2-fast` is a fine folder name and a poor id segment, and an
 * id is the thing that must never move.
 */
const GROUPS = [
  {
    id: "men",
    label: "MEN",
    folder: "male",
    prefix: "male",
    // Numbered files, so the entries are generated rather than typed. A missing
    // number would be a missing file, which the renderers already survive.
    files: Array.from({ length: 20 }, (_, index) => String(index + 1)),
  },
  {
    id: "women",
    label: "WOMEN",
    folder: "female",
    prefix: "female",
    files: Array.from({ length: 24 }, (_, index) => String(index + 1)),
  },
  {
    id: "guests",
    label: "2 FAST",
    folder: "2-fast",
    prefix: "fast",
    // Named rather than numbered, so these are listed. The label is the file
    // name capitalized; the id keeps the file name exactly.
    files: ["luda", "paul", "tyrese", "vin", "yuki"],
  },
];

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

function buildAvatar(group, file, index) {
  const numbered = /^\d+$/.test(file);
  return {
    id: `${group.prefix}-${file}`,
    // What the picker prints under the cell. A numbered face has no name, so it
    // gets its group and its number — which is at least addressable out loud.
    label: numbered ? `${group.label} ${file.padStart(2, "0")}` : capitalize(file),
    // The one letter a cell falls back to before the file lands, or if it never
    // does. Carried rather than derived at the call site so the fallback and the
    // label cannot disagree.
    initial: numbered ? file : capitalize(file).charAt(0),
    groupId: group.id,
    groupLabel: group.label,
    index,
    // The master. Read by the tool and the asset test; never by the game.
    src: `${AVATAR_ROOT}/${group.folder}/${file}.png`,
    // The two the game actually draws. Named for the id rather than the file, so
    // a path can be built from an id alone — which is what lets a saved profile
    // holding `female-12` resolve without the manifest being consulted twice.
    thumbSrc: `${AVATAR_ROOT}/${group.folder}/${FACE_THUMBS}/${group.prefix}-${file}.jpg`,
    cardSrc: `${AVATAR_ROOT}/${group.folder}/${FACE_CARDS}/${group.prefix}-${file}.jpg`,
  };
}

/** The groups, each carrying its own avatars, in picker order. */
export const AVATAR_GROUPS = GROUPS.map((group) => ({
  id: group.id,
  label: group.label,
  avatars: group.files.map((file, index) => buildAvatar(group, file, index)),
}));

const BY_ID = new Map(AVATAR_GROUPS.flatMap((group) => group.avatars.map((avatar) => [avatar.id, avatar])));

/** Every face, flat, in the order the picker walks them. */
export function allAvatars() {
  return [...BY_ID.values()];
}

export function avatarById(id) {
  return BY_ID.get(id) ?? null;
}

/**
 * The default face.
 *
 * A real one rather than a "no avatar" state, because every surface that draws a
 * driver — the profile card, the VS slot — would otherwise need a second empty
 * rendering, and a player who has never opened the profile screen should still
 * have a face on the card.
 */
export const DEFAULT_AVATAR_ID = AVATAR_GROUPS[0].avatars[0].id;

/**
 * The face a **card-sized** surface should load — the profile photo, the VS
 * slot — or null, which is normal: a stale id from disk.
 *
 * Deliberately not the master. Every caller of this draws at ~320px, and the
 * only reason to reach past 768 would be a surface that does not exist yet.
 */
export function avatarSrc(avatar) {
  return avatar?.cardSrc ?? null;
}

/** The face a grid cell should load. A twentieth of the size of a card's. */
export function avatarThumbSrc(avatar) {
  return avatar?.thumbSrc ?? null;
}
