const GAME_SLUG = "yam-bowling";
const VOUCHER_ITEM_ID = "emote-voucher";
// The shape only. The server catalog decides which emotes a voucher may buy --
// this is here so an obviously malformed target never costs a round trip, not
// so the client can decide what is spendable.
const EMOTE_ENTITLEMENT = /^emote:[a-z0-9-]+$/;

function quantityFrom(progress) {
  const item = progress?.inventoryItems?.find?.((entry) => entry?.itemId === VOUCHER_ITEM_ID);
  const quantity = Math.floor(Number(item?.quantity));
  return Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
}

function defaultRedemptionId() {
  return globalThis.crypto?.randomUUID?.()
    || `emote-voucher-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// What a voucher can be spent on right now: every catalogued emote the player
// does not already own, minus the ones no voucher can buy. Founding emotes are
// already owned so they fall out through `owns`; the mastery emote is filtered
// by its unlock source, because spending a voucher on something a level grants
// outright would be a wasted voucher rather than a refused one.
export function buildEmoteVoucherChoices({ emotes = [], owns = () => false } = {}) {
  return emotes
    .filter((emote) => emote?.unlock?.source === "emote-voucher")
    .map((emote) => ({
      emoteSlug: emote.slug,
      name: emote.name,
      description: emote.description,
      art: emote.src,
      entitlementId: `emote:${emote.slug}`,
    }))
    .filter((choice) => !owns(choice.entitlementId));
}

export function createEmoteVoucherClient({
  platformApi,
  loadout,
  createRedemptionId = defaultRedemptionId,
} = {}) {
  let state = { balance: 0, status: "idle", error: "" };

  function applyProgress(progress) {
    state = { balance: quantityFrom(progress), status: "ready", error: "" };
    return state.balance;
  }

  async function redeem(entitlementId) {
    if (state.balance < 1 || state.status === "redeeming" || !EMOTE_ENTITLEMENT.test(String(entitlementId || ""))) return false;
    state = { ...state, status: "redeeming", error: "" };
    try {
      const result = await platformApi?.redeemGameEmoteVoucher?.(GAME_SLUG, {
        entitlementId,
        redemptionId: createRedemptionId(),
      });
      if (!result?.ok || !result.gameProgress) throw new Error("redemption_failed");
      loadout?.applyServerEntitlements?.(result.gameProgress.entitlements || []);
      applyProgress(result.gameProgress);
      return true;
    } catch {
      state = { ...state, status: "error", error: "redemption_failed" };
      return false;
    }
  }

  return {
    applyProgress,
    getState: () => ({ ...state }),
    redeem,
  };
}
