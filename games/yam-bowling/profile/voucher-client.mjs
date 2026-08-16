const GAME_SLUG = "yam-bowling";
const VOUCHER_ITEM_ID = "skin-voucher";
const SKIN_ENTITLEMENT = /^skin:[a-z0-9-]+:(?:swimsuit|maid)$/;

function quantityFrom(progress) {
  const item = progress?.inventoryItems?.find?.((entry) => entry?.itemId === VOUCHER_ITEM_ID);
  const quantity = Math.floor(Number(item?.quantity));
  return Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
}

function defaultRedemptionId() {
  return globalThis.crypto?.randomUUID?.()
    || `skin-voucher-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function buildVoucherChoices({ ownedBowlers = [], availableSkins = [], owns = () => false } = {}) {
  const alternates = availableSkins.filter((skin) => skin?.id === "swimsuit" || skin?.id === "maid");
  return ownedBowlers.flatMap((bowler) => alternates.map((skin) => ({
    bowlerSlug: bowler.slug,
    bowlerName: bowler.name,
    skinId: skin.id,
    skinName: skin.name,
    entitlementId: `skin:${bowler.slug}:${skin.id}`,
  }))).filter((choice) => !owns(choice.entitlementId));
}

export function createVoucherClient({
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
    if (state.balance < 1 || state.status === "redeeming" || !SKIN_ENTITLEMENT.test(String(entitlementId || ""))) return false;
    state = { ...state, status: "redeeming", error: "" };
    try {
      const result = await platformApi?.redeemGameSkinVoucher?.(GAME_SLUG, {
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
