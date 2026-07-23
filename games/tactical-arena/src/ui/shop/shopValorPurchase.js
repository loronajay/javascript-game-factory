// Server-authoritative Valor purchase execution, extracted from shop.js so the modal
// controller stays lean. The server prices the offer and performs the deduct+grant; this
// only names the offer and applies the returned progress as truth. Returns a plain outcome
// the shop controller maps onto its own status/announcement state.

import { spendValorOnServer } from "../../platform/gameProgressClient.js";
import { mergeServerEntitlementsIntoUnlockProgress, readUnlockProgress } from "../../progression/unlocks.js";
import {
  skinPackValorPurchaseStatus,
  skinValorPurchaseStatus,
  unitPurchaseStatus,
} from "./shopWidgets.js";

function valorDescriptor(kind, offer) {
  if (kind === "unit") return { kind: "unit", type: offer.type };
  if (kind === "skin-pack") return { kind: "skin-pack", packId: offer.packId };
  return { kind: "skin", type: offer.type, slug: offer.slug };
}

function valorStatus(kind, result) {
  if (kind === "skin-pack") return skinPackValorPurchaseStatus(result);
  if (kind === "skin") return skinValorPurchaseStatus(result);
  return unitPurchaseStatus(result);
}

// { outcome: "insufficient" } | { outcome: "failed", errorCode } |
// { outcome: "purchased", beforeProgress, afterProgress, status }
export async function runValorPurchase({ kind, offer, storage, account, apiClient }) {
  const cost = kind === "unit" ? offer.price?.amount : offer.valorPrice?.amount;
  // Instant guard (the confirm button is already disabled when short); server is authority.
  if (Number.isFinite(cost) && readUnlockProgress(storage).valorBalance < cost) {
    return { outcome: "insufficient" };
  }
  const beforeProgress = readUnlockProgress(storage);
  const spend = await spendValorOnServer({
    offer: valorDescriptor(kind, offer),
    account,
    ...(apiClient ? { apiClient } : {}),
  });
  if (!spend.ok) return { outcome: "failed", errorCode: spend.errorCode };
  // Server is authoritative right after a spend: apply its Valor + grants as truth. Guard a
  // missing snapshot so we never zero the balance.
  const afterProgress = spend.progress
    ? mergeServerEntitlementsIntoUnlockProgress(storage, spend.progress, { authoritativeValor: true })
    : readUnlockProgress(storage);
  return {
    outcome: "purchased",
    beforeProgress,
    afterProgress,
    status: valorStatus(kind, { accepted: true, offer, progress: afterProgress }),
  };
}
