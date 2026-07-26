// Consumable activation execution, extracted from the Inventory modal so that file stays a
// renderer. Mirrors shop/shopValorPurchase.js: the server is the authority and this only
// names the item, then applies the returned snapshot.
//
// Why the server: a random-skin consumable decides WHICH skin you win. Rolling that on the
// client would let a tampered client name the skin it wants, and because ownership
// self-heals from the server on every online boot, a locally granted skin would vanish
// anyway. So the spend and the grant happen together in one server transaction.
//
// The local path (no account / API unavailable) still exists for consumables granted outside
// the store — it spends the item locally and can only arm the timed boosts, which are a
// local-effect concept in the first place.

import {
  activateConsumableOnServer,
  newConsumableActivationId,
} from "../platform/gameProgressClient.js";
import { isFactoryAccountLoggedIn } from "../platform/factoryAccount.js";
import {
  activateConsumable,
  mergeServerInventory,
  recordConsumableActivation,
} from "../progression/inventory.js";
import { countUnownedSkinsOfRarity } from "../progression/marketplace.js";
import { mergeServerEntitlementsIntoUnlockProgress, readUnlockProgress } from "../progression/unlocks.js";
import { getUnitSkins } from "./skinModel.js";

export function isRandomSkinConsumable(item) {
  return item?.effect?.kind === "random-unowned-skin";
}

// null when the item does not grant skins; otherwise how many of that rarity remain unwon.
export function remainingSkinRolls(item, storage) {
  if (!isRandomSkinConsumable(item)) return null;
  return countUnownedSkinsOfRarity(item.effect.rarity, storage);
}

function skinFromEntitlementId(entitlementId, storage) {
  const [, type, slug] = String(entitlementId || "").split(":");
  if (!type || !slug) return null;
  const skin = getUnitSkins(type, storage).find((entry) => entry.slug === slug) ?? null;
  return { type, slug, name: skin?.name ?? slug, unitType: type };
}

function grantedSkinNames(entitlementIds, storage) {
  return entitlementIds
    .map((entitlementId) => skinFromEntitlementId(entitlementId, storage))
    .filter(Boolean)
    .map((skin) => skin.name);
}

function activationStatusText(offer, grantedNames) {
  if (grantedNames.length) return `${offer.name} opened: ${grantedNames.join(", ")}.`;
  if (offer.activationTrigger === "valor-gained") return `${offer.name} armed. The timer starts on your next Valor gain.`;
  if (offer.activationTrigger === "campaign-mission-started") return `${offer.name} armed. The timer starts on your next campaign mission.`;
  return `${offer.name} activated.`;
}

// { outcome: "activated", status, grantedNames, beforeProgress, afterProgress }
// | { outcome: "empty-pool", status } | { outcome: "failed", status, errorCode }
export async function runConsumableActivation({ item, storage, account, apiClient } = {}) {
  if (!item) return { outcome: "failed", status: "That consumable cannot be activated.", errorCode: "CONSUMABLE_NOT_FOUND" };

  const remaining = remainingSkinRolls(item, storage);
  if (remaining === 0) {
    return {
      outcome: "empty-pool",
      status: `You already own every ${item.effect.rarity} skin, so ${item.name} was not used.`,
    };
  }

  const beforeProgress = readUnlockProgress(storage);
  if (!isFactoryAccountLoggedIn(account)) {
    return applyLocalActivation({ item, storage, beforeProgress });
  }

  const result = await activateConsumableOnServer({
    itemId: item.id,
    activationId: newConsumableActivationId(),
    account,
    ...(apiClient ? { apiClient } : {}),
  });
  if (!result.ok) {
    // Nothing was spent server-side, so the local quantity stays as-is and the player can
    // retry. Sign-in loss is the one failure we can name precisely.
    return {
      outcome: "failed",
      errorCode: result.errorCode,
      status: result.errorCode === "ACCOUNT_LOGIN_REQUIRED"
        ? "Sign in to use consumables."
        : "Couldn't use that consumable. Please try again.",
    };
  }

  // The server already spent the item and granted anything it awards; apply both snapshots.
  const afterProgress = result.progress
    ? mergeServerEntitlementsIntoUnlockProgress(storage, result.progress)
    : beforeProgress;
  if (result.progress) mergeServerInventory(storage, result.progress, { authoritative: true });
  // Timed boosts still need a local activation record so they know they are armed; the
  // quantity came off server-side, so record without spending again.
  if (item.activationTrigger !== "immediate") recordConsumableActivation(storage, item.id);

  const grantedNames = grantedSkinNames(result.entitlementIds, storage);
  return {
    outcome: "activated",
    status: activationStatusText(item, grantedNames),
    grantedNames,
    beforeProgress,
    afterProgress,
  };
}

// Offline / guest fallback: spend locally and arm the timed boosts. Random-skin items cannot
// resolve here (the roll is server-side), so they are refused with the item left intact.
function applyLocalActivation({ item, storage, beforeProgress }) {
  if (isRandomSkinConsumable(item)) {
    return {
      outcome: "failed",
      errorCode: "ACCOUNT_LOGIN_REQUIRED",
      status: "Sign in to open skin consumables.",
    };
  }
  const result = activateConsumable(storage, item.id);
  if (!result.accepted) {
    return {
      outcome: "failed",
      errorCode: result.errorCode,
      status: result.errorCode === "CONSUMABLE_NOT_OWNED"
        ? "That consumable is no longer available."
        : "That consumable cannot be activated.",
    };
  }
  return {
    outcome: "activated",
    status: activationStatusText(result.offer, []),
    grantedNames: [],
    beforeProgress,
    afterProgress: beforeProgress,
  };
}
