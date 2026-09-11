// Where a player's Puck'd Up equipment lives: their Factory account.
//
// THE PLATFORM API IS THE SAVE. There is no local mirror in this file on
// purpose. A garage that survives only because this browser still has it is a
// garage that does not follow the player to their phone, does not follow them
// to a friend's machine, and cannot be handed to an opponent's client to draw.
// So the editor's working copy is held IN MEMORY, and the only thing that
// counts as saved is a `PUT` the server accepted.
//
//   GET  /games/puckd-up/garage   on open   (auth, self only)
//   PUT  /games/puckd-up/garage   on save   (auth, self only)
//
// The acting player is the token's, never a body field — so no playerId is sent
// and none can be spoofed.
//
// THE STATUS IS THE TRUTH. `SAVED` is set only after a 200 whose returned
// document has replaced the working copy; a failure sets `ERROR` and KEEPS the
// player's edits so nothing is lost, and a signed-out cabinet reports
// `SIGNED_OUT` rather than pretending. Nothing here ever reports a save that
// did not happen.
//
// AFTER A SUCCESSFUL SAVE THE SERVER'S DOCUMENT WINS. The response is the
// normalized garage, and adopting it is what makes the editor show exactly what
// was persisted — including any clamp the server applied that the client did
// not. That is the difference between an editor and a wish.

import { defaultGarage, normalizeGarage, serializeGarage, garagesEqual } from "../cosmetics/loadout.js";
import { createPlatformApiClient } from "../../../../js/platform/api/platform-api.mjs";
import { readFactoryAccountSession } from "../../../../js/platform/api/factory-account-gate.mjs";

export const GAME_SLUG = "puckd-up";

export const STATUS_SIGNED_OUT = "signed-out";
export const STATUS_LOADING = "loading";
export const STATUS_SAVED = "saved";
export const STATUS_UNSAVED = "unsaved";
export const STATUS_SAVING = "saving";
export const STATUS_ERROR = "error";

/**
 * Build the store.
 *
 * Everything impure is injectable — the session reader and the API client — so
 * the whole contract is testable under node with no browser, no network and no
 * account.
 */
export function createGarageStore({ session = null, api = null, readSession = readFactoryAccountSession } = {}) {
  const account = session ?? readSession();
  const client = api ?? createPlatformApiClient();
  // A page that forgot to load the platform config resolves an empty base URL
  // and every request quietly returns null. Saving must be reported as
  // impossible in that case, not as failing forever.
  const configured = Boolean(client) && client.isConfigured !== false;
  const available = Boolean(account?.authenticated) && configured;

  let working = defaultGarage();
  // The last document the SERVER acknowledged. `dirty` is measured against
  // this and nothing else, so "unsaved" always means "the server does not have
  // this", never "something changed on screen".
  let persisted = defaultGarage();
  let status = available ? STATUS_SAVED : STATUS_SIGNED_OUT;
  let lastError = "";
  let inFlight = false;
  const listeners = new Set();

  function announce() {
    for (const listener of listeners) listener();
  }

  function setStatus(next, error = "") {
    status = next;
    lastError = error;
    announce();
  }

  function settle() {
    if (!available) return setStatus(STATUS_SIGNED_OUT);
    setStatus(garagesEqual(working, persisted) ? STATUS_SAVED : STATUS_UNSAVED);
  }

  return {
    /** Whether a garage can be SAVED at all: somebody signed in, and a server to keep it on. */
    get available() {
      return available;
    },
    get status() {
      return status;
    },
    get lastError() {
      return lastError;
    },
    /** The editor's working copy. Always a valid document. */
    get garage() {
      return working;
    },
    /** What the server has. Used by the match, so gameplay shows what was equipped. */
    get equipped() {
      return persisted;
    },
    get dirty() {
      return !garagesEqual(working, persisted);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * The player's garage from their account.
     *
     * Signed out this is the factory loadout and the editor says the save
     * button needs an account — never a fake persistent guest garage.
     */
    async load() {
      if (!available) {
        working = defaultGarage();
        persisted = defaultGarage();
        setStatus(STATUS_SIGNED_OUT);
        return working;
      }
      setStatus(STATUS_LOADING);
      let payload = null;
      try {
        payload = await client.fetchGameGarage(GAME_SLUG);
      } catch {
        payload = null;
      }
      if (!payload) {
        // A read that did not arrive is not a garage. Show the factory loadout
        // and SAY the load failed, rather than letting the player build on top
        // of a default they will later overwrite their real garage with.
        working = defaultGarage();
        persisted = defaultGarage();
        setStatus(STATUS_ERROR, "Could not load your garage. Check your connection and reopen.");
        return working;
      }
      persisted = normalizeGarage(payload.garage ?? null);
      working = normalizeGarage(persisted);
      setStatus(STATUS_SAVED);
      return working;
    },

    /** Record an edit. In memory only; nothing leaves the tab until `save()`. */
    update(next) {
      working = normalizeGarage(typeof next === "function" ? next(working) : next);
      if (available) settle();
      else setStatus(STATUS_SIGNED_OUT);
      return working;
    },

    /**
     * Save & Equip.
     *
     * Resolves `{ ok }`. A failure keeps the working copy exactly as it is —
     * losing a player's design because a request timed out would be a worse
     * outcome than the failed save itself.
     */
    async save() {
      if (!available) {
        setStatus(STATUS_SIGNED_OUT);
        return { ok: false, reason: "signed-out" };
      }
      if (inFlight) return { ok: false, reason: "busy" };
      inFlight = true;
      setStatus(STATUS_SAVING);
      const sending = serializeGarage(working);
      let payload = null;
      try {
        payload = await client.saveGameGarage(GAME_SLUG, sending);
      } catch {
        payload = null;
      }
      inFlight = false;
      if (!payload?.ok) {
        setStatus(STATUS_ERROR, "Save failed. Your design is still here — try again.");
        return { ok: false, reason: "request-failed" };
      }
      // The server's document is now the truth, clamps and all.
      persisted = normalizeGarage(payload.garage ?? sending);
      working = normalizeGarage(persisted);
      setStatus(STATUS_SAVED);
      return { ok: true };
    },

    /** Throw away unsaved edits and go back to what the account holds. */
    revert() {
      working = normalizeGarage(persisted);
      settle();
      return working;
    },
  };
}
