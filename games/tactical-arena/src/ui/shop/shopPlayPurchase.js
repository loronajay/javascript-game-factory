// Google Play purchase execution, extracted from shop.js so the modal controller
// stays lean — the same split as shopValorPurchase.js.
//
// Unlike the Stripe path there is no embedded checkout to mount: Google renders its
// own purchase sheet, so this drives the flow start to finish and returns a plain
// outcome the shop controller maps onto its status and announcement state.

import {
  PURCHASE_PROVIDERS,
  purchaseProviderMessage,
} from "../../platform/purchaseProviders.js";
import {
  createPlayPurchaseVerifier,
  playPurchaseErrorMessage,
  purchaseWithPlay,
} from "../../platform/playBillingClient.js";
import { fetchGameProgressSnapshot } from "../../platform/gameProgressClient.js";
import { mergeServerEntitlementsIntoUnlockProgress, readUnlockProgress } from "../../progression/unlocks.js";
import { mergeServerInventory } from "../../progression/inventory.js";

// { outcome: "unavailable" | "cancelled" | "failed" | "already-owned" | "purchased", status, ... }
//
// "already-owned" is a refusal, not a failure: the player was never charged, and the
// returned progress is fresher than what the shop was rendering.
export async function runPlayPurchase({
  offer,
  provider,
  storage,
  account,
  verifyPurchase,
  fetchImpl,
  fetchSnapshot = fetchGameProgressSnapshot,
}) {
  if (provider === PURCHASE_PROVIDERS.unavailable) {
    return { outcome: "unavailable", status: purchaseProviderMessage(provider) };
  }

  const result = await purchaseWithPlay(offer, {
    account,
    verifyPurchase: verifyPurchase ?? createPlayPurchaseVerifier({ fetchImpl }),
  });

  if (result.blocked) {
    // The ownership preflight stopped this before Google's sheet opened, so no money moved.
    // It also means the shop was showing an owned item as buyable — apply the snapshot that
    // proved it so the catalog corrects itself instead of offering it again.
    const beforeProgress = readUnlockProgress(storage);
    const afterProgress = result.snapshot
      ? mergeServerEntitlementsIntoUnlockProgress(storage, result.snapshot)
      : beforeProgress;
    if (result.snapshot) mergeServerInventory(storage, result.snapshot, { authoritative: true });
    return {
      outcome: "already-owned",
      beforeProgress,
      afterProgress,
      applied: Boolean(result.snapshot),
      status: playPurchaseErrorMessage(result.error),
    };
  }

  if (!result.ok) {
    return result.cancelled
      ? { outcome: "cancelled", status: "Purchase cancelled." }
      : { outcome: "failed", status: playPurchaseErrorMessage(result.error) };
  }

  let purchaseProgress = result.progress;
  if (!purchaseProgress) {
    // Verification is allowed to return only a success verdict (older deployed API
    // revisions did). Pull the now-authoritative account snapshot before resuming the
    // shop so the purchased skin/unit appears immediately instead of after a restart.
    try {
      purchaseProgress = await fetchSnapshot({ account });
    } catch {
      purchaseProgress = null;
    }
  }

  const beforeProgress = readUnlockProgress(storage);
  // The server is authoritative immediately after a verified purchase.
  const afterProgress = purchaseProgress
    ? mergeServerEntitlementsIntoUnlockProgress(storage, purchaseProgress)
    : beforeProgress;
  // Consumables are credited as inventory quantity, not as an entitlement, so the
  // snapshot has to land in the local inventory cache too.
  if (purchaseProgress) mergeServerInventory(storage, purchaseProgress, { authoritative: true });

  return {
    outcome: "purchased",
    beforeProgress,
    afterProgress,
    applied: Boolean(purchaseProgress),
    status: offer.kind === "consumable"
      ? `${offer.name} added to your Inventory.`
      : `${offer.name} unlocked.`,
  };
}
