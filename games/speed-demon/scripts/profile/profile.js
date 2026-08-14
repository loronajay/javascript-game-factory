// The driver: a name, a face, and the five cars they want on the card.
//
// PURE. No DOM, no storage — `profile-store.js` is the only module in here that
// knows `localStorage` exists, the fifth instance of the split the radio, the
// garage, the records and the campaign already make.
//
// ## This is a cabinet alias, not an account
//
// Canonical player identity belongs to the factory shell, and a game that minted
// its own would be a second source of truth for who somebody is — the repo rule
// `onlineIdentity()` already follows. So the driver name here **defaults to the
// factory profile's name and never writes back to it**. It is the name over the
// door of this cabinet, in the way an arcade machine lets you put three letters
// on a board without claiming to know who you are.
//
// The consequence worth protecting: nothing here may be handed to the platform
// as identity. Online play still introduces itself with `createOnlineIdentityPayload`
// off the factory profile, and this name rides along beside it at most.
//
// ## Everything on the profile screen that is not here is derived
//
// The bests, the ranks, the career, how many paints are saved — all of those are
// read from the stores that already own them and shaped in `ui/profile.js`. A
// profile stores only what the player *chose*: the name, the face, and the pins.
// Copying a best in here would be a second copy of a number that already has one
// authority, and the two would disagree the first time a run was set on another
// machine.

import { modelById } from "../assets/car-atlas.js";
import { DEFAULT_AVATAR_ID, avatarById } from "./avatars.js";

/**
 * How many cars a driver can pin.
 *
 * Five because that is what fits on the card as recognisable cars rather than
 * thumbnails, and because a "favourites" list long enough to hold a quarter of
 * the roster stops being a statement about anything. It is a real ceiling: the
 * picker says so and refuses a sixth rather than silently dropping the oldest,
 * which is the one behaviour that would lose a pick the player made deliberately.
 */
export const MAX_FAVOURITES = 5;

/**
 * A driver name is short and printable.
 *
 * 14 characters because the VS card and the profile header both draw it at a
 * size worth reading, and a name that has to be shrunk to fit is a name nobody
 * chose. Mixed case is allowed — "Jay" should be able to be "Jay" — but the
 * alphabet is deliberately narrow: this string ends up in a canvas `fillText`
 * and, later, quite possibly on a wire, and neither wants control characters.
 */
export const MAX_NAME_LENGTH = 14;
export const NAME_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -'.";

/**
 * What the card says when the name is empty.
 *
 * Empty is a legal saved state — a player can clear the field — and every
 * surface that prints a name would otherwise need its own fallback. One here
 * means the card, the VS slot and any later board row cannot disagree.
 */
export const ANONYMOUS_NAME = "DRIVER";

function cleanName(value) {
  const source = typeof value === "string" ? value : "";
  let out = "";
  for (const char of source) {
    if (out.length >= MAX_NAME_LENGTH) break;
    if (!NAME_ALPHABET.includes(char)) continue;
    out += char;
  }
  // Trailing space is invisible and would make two names that read identically
  // compare unequal; leading space shifts the whole card.
  return out.trim();
}

/**
 * Normalizes a saved profile.
 *
 * Everything falls back rather than throwing, because the input is a JSON blob
 * off disk that a previous version of the cabinet — or a person with the
 * devtools open — may have written. A stale avatar id is the ordinary case, not
 * an exceptional one: art gets renamed.
 */
export function createProfile(saved = {}) {
  const source = saved && typeof saved === "object" ? saved : {};
  const favourites = [];
  for (const id of Array.isArray(source.favourites) ? source.favourites : []) {
    if (favourites.length >= MAX_FAVOURITES) break; // truncate before mapping, not after
    if (typeof id !== "string" || !modelById(id)) continue;
    if (favourites.includes(id)) continue; // a car pinned twice is one pin
    favourites.push(id);
  }
  return {
    name: cleanName(source.name),
    avatarId: avatarById(source.avatarId) ? source.avatarId : DEFAULT_AVATAR_ID,
    favourites,
  };
}

/** The name as it is printed. Never empty — see `ANONYMOUS_NAME`. */
export function displayName(profile) {
  return profile?.name?.trim() ? profile.name : ANONYMOUS_NAME;
}

export function setName(profile, name) {
  const next = cleanName(name);
  return next === profile.name ? profile : { ...profile, name: next };
}

/** Sets the face. An unknown id is refused rather than stored and fixed later. */
export function setAvatar(profile, avatarId) {
  if (!avatarById(avatarId) || avatarId === profile.avatarId) return profile;
  return { ...profile, avatarId };
}

export function isFavourite(profile, modelId) {
  return profile.favourites.includes(modelId);
}

/** Whether another car can be pinned. False is a state the picker prints. */
export function favouritesFull(profile) {
  return profile.favourites.length >= MAX_FAVOURITES;
}

/**
 * Pins or unpins a car.
 *
 * Unpinning always works. Pinning past the ceiling is a **no-op**, and that is
 * the deliberate choice: the alternative is dropping whichever pin is oldest,
 * which throws away something the player chose on purpose in response to a press
 * that looked like it added one. The view says the list is full so the refusal
 * has a reason on screen — the `+ LAYER` rule adapted to a control that cannot
 * simply disappear, because the cell is a car in a grid of every car.
 */
export function toggleFavourite(profile, modelId) {
  if (!modelById(modelId)) return profile;
  if (isFavourite(profile, modelId)) {
    return { ...profile, favourites: profile.favourites.filter((id) => id !== modelId) };
  }
  if (favouritesFull(profile)) return profile;
  return { ...profile, favourites: [...profile.favourites, modelId] };
}

/**
 * Whether two profiles say the same thing.
 *
 * Order matters in `favourites` — the pins are drawn in the order they were
 * added, so the same five cars in a different order is a different card — which
 * is the same argument `liveryEquals` makes about layer order.
 */
export function profileEquals(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.name === b.name
    && a.avatarId === b.avatarId
    && a.favourites.length === b.favourites.length
    && a.favourites.every((id, index) => id === b.favourites[index])
  );
}
