// Boot-time progress reconciliation with the platform, extracted from main.js so the
// composition root stays wiring-only and this server-authority flow has a focused home.
//
// Order matters: fulfill any returned premium (Stripe) checkout, flush pending reward
// claims up to the server, run the one-time local-ownership backfill (grandfathers existing
// local ownership so going server-authoritative loses nothing), then apply the server
// snapshot. The server Valor balance is treated as authoritative only when it is known
// current — a successful flush or a just-fulfilled checkout — otherwise the local balance is
// kept so an offline / not-yet-synced legitimately-earned balance is never downgraded.

import { isFactoryAccountLoggedIn, readStoredFactoryAccountSession } from "./factoryAccount.js";
import { fulfillReturnedPremiumCheckout } from "./premiumCheckoutClient.js";
import {
  backfillLocalOwnershipToServer,
  fetchGameProgressSnapshot,
  flushPendingGameProgressClaims,
} from "./gameProgressClient.js";
import { mergeServerEntitlementsIntoUnlockProgress, readUnlockProgress } from "../progression/unlocks.js";
import { mergeServerInventory } from "../progression/inventory.js";
import { enqueuePurchasedUnlockAnnouncements } from "../progression/announcements.js";
import { applyServerPlayProgress, backfillLocalPlayProgress } from "./playProgressSync.js";

const OWNERSHIP_BACKFILL_FLAG = "tacticalArenaOwnershipBackfilledV1";

export async function syncGameProgress() {
  const storage = globalThis.localStorage;
  const account = readStoredFactoryAccountSession(storage);
  const checkoutResult = await fulfillReturnedPremiumCheckout({ storage, account });
  // Campaign/tutorial progress this device earned before play-progress sync existed has
  // no claim behind it. Queue those claims BEFORE the flush so they ride the same pass.
  // Queue-only and idempotent, so it is safe for guests and offline boots too.
  if (isFactoryAccountLoggedIn(account)) backfillLocalPlayProgress(storage);
  const flushResult = await flushPendingGameProgressClaims({ storage });
  // One-time: grandfather existing local ownership to the server so going
  // server-authoritative loses no progress. Server-idempotent; local flag skips re-posting.
  let backfillProgress = null;
  if (flushResult.ok && !storage.getItem(OWNERSHIP_BACKFILL_FLAG)) {
    const local = readUnlockProgress(storage);
    const hasLocalOwnership = Boolean(
      local.unlockedUnits.length || local.unlockedSkins.length || local.valorBalance > 0,
    );
    if (!hasLocalOwnership) {
      // Nothing to grandfather — a fresh device signing into an existing account. Don't
      // post an empty backfill: the server migration is one-shot per account, so an empty
      // one would consume it and strand the progress on whichever device still holds it.
      // Marking it done locally is correct here precisely because there is nothing to
      // lose: with no local ownership, going straight to server authority IS the truth.
      try { storage.setItem(OWNERSHIP_BACKFILL_FLAG, "1"); } catch { /* best-effort */ }
    } else {
      const backfill = await backfillLocalOwnershipToServer({
        ownedUnits: local.unlockedUnits,
        ownedSkins: local.unlockedSkins,
        valorBalance: local.valorBalance,
      });
      if (backfill.ok) {
        backfillProgress = backfill.progress;
        try { storage.setItem(OWNERSHIP_BACKFILL_FLAG, "1"); } catch { /* best-effort */ }
      }
    }
  }
  let snapshot = backfillProgress || checkoutResult?.progress || flushResult.progress;
  if (!snapshot && flushResult.ok) {
    snapshot = await fetchGameProgressSnapshot();
  }
  if (snapshot) {
    // Full server authority (the reconcile that filters local ownership down to the server's
    // set) is only safe once we KNOW the server has this player's complete owned set — i.e.
    // signed in, the pending-claim flush succeeded, AND the one-time ownership backfill has
    // confirmed (flag present). If the backfill hasn't succeeded yet, stay additive so we
    // never drop local ownership the server hasn't received — otherwise a transient backfill
    // failure would permanently delete a legit player's items.
    const backfillConfirmed = Boolean(storage.getItem(OWNERSHIP_BACKFILL_FLAG));
    const authoritative = flushResult.ok && isFactoryAccountLoggedIn(account) && backfillConfirmed;
    const authoritativeValor = authoritative || Boolean(checkoutResult?.progress);
    const beforeProgress = readUnlockProgress(storage);
    const afterProgress = mergeServerEntitlementsIntoUnlockProgress(storage, snapshot, { authoritative, authoritativeValor });
    // Consumable quantities ride the same authority rule as ownership: once the server is
    // known current it owns the counts (purchases credit them, activations spend them);
    // until then stay additive so an unsynced grant is not dropped.
    mergeServerInventory(storage, snapshot, { authoritative });
    enqueuePurchasedUnlockAnnouncements(storage, beforeProgress, afterProgress);
    // Cleared missions, stars, and completed tutorials. Always a forward-only union, so
    // unlike ownership this needs no authority rule — it runs even on a partial sync.
    // It has to come AFTER the entitlement merge: restoring campaign progress is what
    // lets unlocks.js re-derive the mission rewards that hang off it.
    applyServerPlayProgress(storage, snapshot);
  }
  return { ...flushResult, checkoutResult };
}
