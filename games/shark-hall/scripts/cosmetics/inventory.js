// Who owns what — the seam, and the one line that opens everything.
//
// PURE. It answers `isOwned(id)` and nothing else, and every editor in the
// cabinet asks it rather than asking the catalog. That is the whole point: the
// UI must not know whether ownership comes from a hard-coded set, a saved
// entitlement, or a round trip to the Factory. On the day it comes from a
// server, this file changes and nothing above it does.
//
// TODAY EVERY COSMETIC IS OWNED, deliberately and visibly:
//
//     export const DEVELOPMENT_INVENTORY = createInventory({ grantAll: true });
//
// That is the development grant, written out where anyone can find it rather
// than faked by leaving locked-state support out of the model. The model still
// carries locked items end to end — `isOwned` can return false, the editor can
// draw a locked chip, and `normalizeLoadout` already refuses to equip something
// unowned — so turning the grant off is a configuration change and not a
// feature. If the locked path were unwritten, progression would be a rewrite.

import { CATALOG, allItemIds, findItem } from "./catalog.js";

/**
 * Build an inventory.
 *
 * @param grantAll  the development grant: every catalog id is owned.
 * @param owned     explicit ids, for the day ownership is real.
 * @param resolve   an escape hatch for a source that is not a set — a server
 *                  response held elsewhere, say. Consulted last.
 */
export function createInventory({ grantAll = false, owned = [], resolve = null } = {}) {
  const granted = new Set(grantAll ? allItemIds() : owned);

  return {
    /** Whether the acting account may equip this item. Unknown ids are never owned. */
    isOwned(id) {
      if (!id || !findItem(id)) return false;
      if (granted.has(id)) return true;
      return typeof resolve === "function" ? Boolean(resolve(id)) : false;
    },

    /** Everything owned, as ids. The editor's "you have N of M" line. */
    ownedIds() {
      return CATALOG.filter((entry) => this.isOwned(entry.id)).map((entry) => entry.id);
    },

    /** Whether this inventory is the development grant, so the UI can say so out loud. */
    get isDevelopmentGrant() {
      return grantAll;
    },
  };
}

/**
 * The inventory the cabinet runs on today.
 *
 * ONE FLAG. When the circuit, the tournaments and the season rewards exist, the
 * store hands the editor an inventory built from a server response instead and
 * this constant stops being wired in — no editor, no catalog and no loadout
 * code changes, because none of them ever asked how ownership worked.
 */
export const DEVELOPMENT_INVENTORY = createInventory({ grantAll: true });

/** An inventory that owns nothing. Useful in tests, and the honest signed-out default. */
export const EMPTY_INVENTORY = createInventory();
