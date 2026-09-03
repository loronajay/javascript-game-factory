// The table editor's state machine: saved, working, dirty.
//
// PURE of everything but the store it is handed. No DOM, no THREE, no network
// import — the store arrives as a parameter, so this whole module is testable
// under node and the UI above it never learns whether `save()` writes to the
// Factory or to a cache. That indifference is the point: the store is the seam,
// and swapping it is not a change to the editor.
//
// THREE STATES, AND THE DIFFERENCE BETWEEN THEM IS THE WHOLE FEATURE:
//
//   SAVED    what the account owns. What the table looks like next session.
//   WORKING  what is on screen right now. Every preview writes this.
//   DIRTY    working ≠ saved. What "Save Table" is lit for, and what a Back
//            press has to ask about.
//
// NOTHING IS PERSISTED BY A CLICK. Previewing a cloth changes the working table
// and reaches no store at all; only `save` does. A cosmetic editor that wrote on
// every selection would be an editor with no way to change your mind, and would
// spend a network round trip per swatch.

import {
  activeEntry,
  activeLoadout,
  addEntry,
  applyPreset as applyPresetTo,
  defaultGarage,
  defaultLoadout,
  equip,
  loadoutsEqual,
  normalizeGarage,
  removeEntry,
  renameEntry,
  resolveLoadout,
  selectEntry,
  withActiveLoadout,
} from "./loadout.js";

/**
 * Build the editor.
 *
 * @param store    anything with `available`, `load()` and `save(garage)`. The
 *                 Factory-backed one lives in `store/cosmetics-store.js`.
 * @param options  normalization options, carrying the ownership seam through.
 * @param onChange called whenever the WORKING loadout changes, with the resolved
 *                 payload — which is exactly what `scene.applyCosmetics` wants,
 *                 so the preview is one wire rather than a subscription system.
 */
export function createTableEditor({ store = null, options = {}, onChange = null } = {}) {
  let garage = defaultGarage();
  let saved = activeLoadout(garage, options);
  let working = { ...saved, table: { ...saved.table }, hall: { ...saved.hall } };
  let loaded = false;

  function announce() {
    onChange?.(resolveLoadout(working, options), working);
  }

  /** Move the working loadout, and tell the scene. The only path that repaints. */
  function setWorking(next) {
    working = next;
    announce();
  }

  return {
    /** Whether a save can actually reach the Factory. False signed out; the UI says so. */
    get canSave() {
      return Boolean(store?.available);
    },
    get status() {
      return store?.status ?? "signed-out";
    },
    get saved() {
      return saved;
    },
    get working() {
      return working;
    },
    /** Working differs from saved. Lights the Save button and gates the Back prompt. */
    get dirty() {
      return !loadoutsEqual(working, saved);
    },
    get garage() {
      return garage;
    },
    /** Every saved table, for the picker. Ids and names only — the editor holds the rest. */
    get entries() {
      return garage.entries.map((entry) => ({ id: entry.id, name: entry.name, active: entry.id === garage.activeId }));
    },
    get activeName() {
      return activeEntry(garage, options).name;
    },
    get isLoaded() {
      return loaded;
    },

    /** The working loadout as render payloads. What the scene is handed. */
    resolved() {
      return resolveLoadout(working, options);
    },

    /**
     * Pull the garage from the store.
     *
     * Safe to call more than once — a second call re-reads rather than
     * duplicating — and safe to call with no store at all, which is the state
     * every unit test runs in.
     */
    async load() {
      garage = normalizeGarage(store ? await store.load() : null, options);
      saved = activeLoadout(garage, options);
      setWorking({ ...saved, table: { ...saved.table }, hall: { ...saved.hall } });
      loaded = true;
      return working;
    },

    /**
     * Try an item on. Pass `null` to clear an optional slot.
     *
     * Does not save, does not touch the store, and cannot equip something the
     * inventory refuses — `equip` re-normalizes, so there is no second door.
     */
    preview(domain, slotKey, itemId) {
      setWorking(equip(working, domain, slotKey, itemId, options));
      return working;
    },

    /** Apply a preset to the working loadout. Data, not a special case. */
    applyPreset(presetId) {
      setWorking(applyPresetTo(working, presetId, options));
      return working;
    },

    /** Back to the house table — as a PREVIEW. Reset is not a save. */
    reset() {
      setWorking(defaultLoadout());
      return working;
    },

    /** Throw the previews away and go back to the saved table. */
    discard() {
      setWorking({ ...saved, table: { ...saved.table }, hall: { ...saved.hall } });
      return working;
    },

    /**
     * Commit. Working becomes saved, and the garage goes to the store.
     *
     * The store's own `save` is fire-and-forget with a retry behind it, so this
     * returns as soon as the state has moved: the player's table is theirs the
     * moment they press the button, whatever the network is doing.
     */
    save() {
      garage = withActiveLoadout(garage, working, options);
      saved = activeLoadout(garage, options);
      store?.save(garage);
      return saved;
    },

    /** Save the working table as a NEW entry and switch to it. */
    saveAs(name) {
      const next = addEntry(garage, { name, loadout: working }, options);
      // At the cap `addEntry` returns the garage unchanged rather than evicting
      // somebody's table. Report that rather than pretending it worked.
      if (next.entries.length === garage.entries.length) return false;
      garage = next;
      saved = activeLoadout(garage, options);
      setWorking({ ...saved, table: { ...saved.table }, hall: { ...saved.hall } });
      store?.save(garage);
      return true;
    },

    /**
     * Switch which saved table is live.
     *
     * DISCARDS the working previews, by design: the caller is responsible for
     * asking first, and the UI does. Carrying half an edit onto another table
     * would be the surprising behaviour.
     */
    select(entryId) {
      garage = selectEntry(garage, entryId, options);
      saved = activeLoadout(garage, options);
      setWorking({ ...saved, table: { ...saved.table }, hall: { ...saved.hall } });
      store?.save(garage);
      return working;
    },

    rename(entryId, name) {
      garage = renameEntry(garage, entryId, name, options);
      store?.save(garage);
    },

    /** Delete a saved table. The last one is never deletable. */
    remove(entryId) {
      const next = removeEntry(garage, entryId, options);
      if (next === garage || next.entries.length === garage.entries.length) return false;
      garage = next;
      saved = activeLoadout(garage, options);
      setWorking({ ...saved, table: { ...saved.table }, hall: { ...saved.hall } });
      store?.save(garage);
      return true;
    },

    /** Drives the store's retry backoff from the frame loop. */
    tick(dt) {
      store?.tick?.(dt);
    },
  };
}
