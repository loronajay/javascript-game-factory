// Who speaks a briefing — pure.
//
// A manifest and nothing else, the job `avatars.js` does for the driver screen
// and `car-atlas.js` does for the bodies. Adding a voice is a row here.
//
// ## Why this exists now and did not before
//
// `events.js` used to state that the briefing was spoken by an unnamed contact
// and that **anything with a face belongs in `rivals.js`**. The reasoning was
// sound but the constraint it was defending was narrower than it looked: the
// ten roster faces are the campaign's rivals and bosses, they are *spent* the
// moment they are introduced, and burning one on a narrator wastes it.
//
// The generic avatar roster removes that cost. A contact can now have a face
// without taking one out of the ten, so the rule becomes the more honest
// version of itself: **a face is cheap, a roster face is not.** A voice that is
// somebody the player will eventually race still belongs in `rivals.js`; a
// voice that is scenery lives here and wears a generic portrait.
//
// `VOICE_UNKNOWN` keeps its original property — no face at all — because that is
// a *characterisation* rather than a missing asset. The number you found does
// not have a photograph attached, and the day it turns out to be somebody is one
// edit to this row.
//
// ## A rival can speak for themselves
//
// `speakerById` falls through to the roster, so an event whose opponent is one
// of the ten can have them say their own line, in their own portrait and their
// own accent colour. That is the whole reason the lookup is a function rather
// than a plain map: a rival node's briefing should not need a second, duplicate
// contact row saying what `rivals.js` already knows.
//
// ## Ids are stored on every authored beat and must never be renamed
//
// The car atlas' rule. An id here is typed into a `brief` row rather than into a
// save, so a rename is cheaper than renaming a model — but it is still a silent
// break: an unresolved speaker draws a plate with no name on it rather than
// failing, so `tests/campaign.test.js` is what catches one.

import { avatarById, avatarThumbSrc } from "../profile/avatars.js";
import { RIVALS, rivalThumbSrc } from "../rival/rivals.js";

/**
 * The number you found. No face, on purpose — see above.
 *
 * A constant rather than a string typed into each beat, because until this turns
 * out to be somebody, every line it speaks is provably the same voice.
 */
export const VOICE_UNKNOWN = "unknown";

/**
 * The people around the Old Town corner.
 *
 * `role` is the second line of the plate — what they are to the player rather
 * than who they are — because a name alone in a box on a splash reads as a
 * caption for the photograph rather than as somebody talking.
 */
const CONTACTS = [
  {
    id: VOICE_UNKNOWN,
    name: "UNKNOWN",
    role: "THE NUMBER YOU FOUND",
    // Null rather than a placeholder path: the plate's fallback is the point.
    avatarId: null,
    initial: "?",
    accent: "#ff5a2e",
  },
  {
    id: "mari",
    name: "MARI",
    role: "RUNS THE CORNER",
    avatarId: "female-6",
    initial: "M",
    accent: "#ffb347",
  },
  {
    id: "dez",
    name: "DEZ",
    role: "SPANNERS",
    avatarId: "male-14",
    initial: "D",
    accent: "#7fd8ff",
  },
  {
    id: "rook",
    name: "ROOK",
    role: "HOLDS THE MONEY",
    avatarId: "male-2",
    initial: "R",
    accent: "#8fd14f",
  },
];

const BY_ID = new Map(CONTACTS.map((contact) => [contact.id, contact]));

/**
 * The speaker an authored beat names, already shaped for the plate — or null,
 * which the renderer survives by drawing nothing.
 *
 * `faceSrc` is the **thumb**, never the card and certainly never the master: the
 * plate is ~72px, so a 768px card is nine times the pixels nobody can see. That
 * is the rule `tests/modules.test.js` sweeps for.
 */
export function speakerById(id) {
  const contact = BY_ID.get(id);
  if (contact) {
    return {
      id: contact.id,
      name: contact.name,
      role: contact.role,
      accent: contact.accent,
      initial: contact.initial,
      faceSrc: avatarThumbSrc(avatarById(contact.avatarId)),
    };
  }

  // A rival speaking for themselves. Their tier is the role — "ROOKIE", "ACE" —
  // which is exactly what they are to the player at the point they turn up.
  const rival = RIVALS.find((entry) => entry.id === id);
  if (!rival) return null;
  return {
    id: rival.id,
    name: rival.name.toUpperCase(),
    role: rival.tier,
    accent: rival.accent,
    initial: rival.name.charAt(0).toUpperCase(),
    faceSrc: rivalThumbSrc(rival),
  };
}

/** Every contact, for the asset sweep and for the tests. */
export function allContacts() {
  return [...CONTACTS];
}
