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
import { enqueuePurchasedUnlockAnnouncements } from "../progression/announcements.js";

const OWNERSHIP_BACKFILL_FLAG = "tacticalArenaOwnershipBackfilledV1";

export async function syncGameProgress() {
  const storage = globalThis.localStorage;
  const account = readStoredFactoryAccountSession(storage);
  const checkoutResult = await fulfillReturnedPremiumCheckout({ storage, account });
  const flushResult = await flushPendingGameProgressClaims({ storage });
  // One-time: grandfather existing local ownership to the server so going
  // server-authoritative loses no progress. Server-idempotent; local flag skips re-posting.
  let backfillProgress = null;
  if (flushResult.ok && !storage.getItem(OWNERSHIP_BACKFILL_FLAG)) {
    const local = readUnlockProgress(storage);
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
    enqueuePurchasedUnlockAnnouncements(storage, beforeProgress, afterProgress);
  }
  return { ...flushResult, checkoutResult };
}
