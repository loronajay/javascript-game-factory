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
import { DEFAULT_LIVERY, createLivery, liveryEquals, normalizeLivery } from "../garage/livery.js";
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
 * A pinned car is a car **as the player painted it**, not a model id.
 *
 * The first cut stored bare model ids, which meant the card showed the roster's
 * neutral silver bodies and the picker offered nothing but them — a player with
 * twenty paints saved could not put a single one of them on their own card. The
 * bodies are deliberately neutral (`car-atlas.js`); what makes a car *yours* in
 * this cabinet is the livery, so that is what a favourite has to carry.
 *
 * Three fields, and each earns its place:
 *
 * - `modelId` — which body. The only part an opponent's atlas can resolve.
 * - `presetId` — which saved paint, or `null` for Factory. It means nothing
 *   inside anybody else's garage (`selectedLoadout`'s note), and it is kept
 *   anyway for exactly one job: the *owner's* card re-resolves through it, so
 *   re-colouring a paint in the garage updates the card rather than leaving a
 *   snapshot of a colour that no longer exists.
 * - `livery` — the paint itself, resolved. This is what makes the pin drawable
 *   on a stranger's machine, which is the whole reason the driver document is
 *   publicly readable. The same argument `selectedLoadout` makes for the wire.
 */
export function createFavourite(input = {}) {
  const source = typeof input === "string" ? { modelId: input } : (input ?? {});
  const modelId = typeof source.modelId === "string" ? source.modelId : "";
  return {
    modelId,
    presetId: typeof source.presetId === "string" && source.presetId ? source.presetId : null,
    livery: source.livery ? normalizeLivery(source.livery) : createLivery(DEFAULT_LIVERY),
  };
}

/**
 * What makes two pins the same pin: the body *and* the paint on it. The Kaido in
 * red and the Kaido in blue are two different cars to a player who built both,
 * so pinning one must not read as already having pinned the other.
 */
export function favouriteKey(entry) {
  return `${entry?.modelId ?? ""}::${entry?.presetId ?? ""}`;
}

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
  const seen = new Set();
  // A bare string is what an older save — and an older *server* — holds, and it
  // still says something true: that model, in factory paint. Reading it rather
  // than dropping it is what keeps an upgrade from wiping somebody's card.
  for (const raw of Array.isArray(source.favourites) ? source.favourites : []) {
    if (favourites.length >= MAX_FAVOURITES) break; // truncate before mapping, not after
    if (typeof raw !== "string" && (!raw || typeof raw !== "object")) continue;
    const entry = createFavourite(raw);
    if (!modelById(entry.modelId)) continue;
    const key = favouriteKey(entry);
    if (seen.has(key)) continue; // the same car in the same paint twice is one pin
    seen.add(key);
    favourites.push(entry);
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

/** Whether this exact car — body and paint — is on the card. */
export function isFavourite(profile, entry) {
  const key = favouriteKey(createFavourite(entry));
  return profile.favourites.some((pinned) => favouriteKey(pinned) === key);
}

/** Where it sits on the card, 1-based. 0 when it is not pinned at all. */
export function favouritePosition(profile, entry) {
  const key = favouriteKey(createFavourite(entry));
  return profile.favourites.findIndex((pinned) => favouriteKey(pinned) === key) + 1;
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
export function toggleFavourite(profile, entry) {
  const pin = createFavourite(entry);
  if (!modelById(pin.modelId)) return profile;
  const key = favouriteKey(pin);
  if (isFavourite(profile, pin)) {
    return { ...profile, favourites: profile.favourites.filter((pinned) => favouriteKey(pinned) !== key) };
  }
  if (favouritesFull(profile)) return profile;
  return { ...profile, favourites: [...profile.favourites, pin] };
}

/**
 * Re-reads every pin's paint out of the garage.
 *
 * A pin holds a resolved livery so a stranger's client can draw it, which means
 * the owner's own copy goes stale the moment they re-colour that preset. This is
 * what closes that: `resolve` hands back the live livery for a preset id, or
 * `undefined` where the preset has since been deleted — in which case the pin
 * keeps the paint it was saved with rather than silently reverting to factory,
 * because the snapshot is still the car the player chose.
 */
export function refreshFavourites(profile, resolve) {
  let changed = false;
  const favourites = profile.favourites.map((pinned) => {
    if (!pinned.presetId) return pinned;
    const livery = resolve(pinned.presetId, pinned.modelId);
    if (!livery || liveryEquals(livery, pinned.livery)) return pinned;
    changed = true;
    return { ...pinned, livery: normalizeLivery(livery) };
  });
  return changed ? { ...profile, favourites } : profile;
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
    && a.favourites.every((pinned, index) => (
      favouriteKey(pinned) === favouriteKey(b.favourites[index])
      // The paint is part of what a pin says, so a re-coloured preset is a
      // changed profile — which is what makes `refreshFavourites` reach the
      // server rather than sitting in memory until something else saves.
      && liveryEquals(pinned.livery, b.favourites[index].livery)
    ))
  );
}
