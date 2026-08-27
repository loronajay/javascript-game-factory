const GAME_SLUG = "yam-bowling";
const VOUCHER_ITEM_ID = "skin-voucher";
const SWIMSUIT_VOUCHER_ITEM_ID = "swimsuit-voucher";
const SKIN_ENTITLEMENT = /^skin:[a-z0-9-]+:(?:swimsuit|maid|halloween)$/;

export const SKIN_VOUCHER_ITEMS = Object.freeze({
  swimsuit: SWIMSUIT_VOUCHER_ITEM_ID,
  maid: VOUCHER_ITEM_ID,
  halloween: VOUCHER_ITEM_ID,
});

function voucherItemForEntitlement(entitlementId) {
  const skinId = String(entitlementId || "").split(":")[2];
  return SKIN_VOUCHER_ITEMS[skinId] || "";
}

function quantityFrom(progress, itemId) {
  const item = progress?.inventoryItems?.find?.((entry) => entry?.itemId === itemId);
  const quantity = Math.floor(Number(item?.quantity));
  return Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
}

function defaultRedemptionId() {
  return globalThis.crypto?.randomUUID?.()
    || `skin-voucher-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function buildVoucherChoices({ ownedBowlers = [], availableSkins = [], owns = () => false } = {}) {
  const alternates = availableSkins.filter((skin) => Object.hasOwn(SKIN_VOUCHER_ITEMS, skin?.id));
  return ownedBowlers.flatMap((bowler) => alternates.map((skin) => ({
    bowlerSlug: bowler.slug,
    bowlerName: bowler.name,
    skinId: skin.id,
    skinName: skin.name,
    entitlementId: `skin:${bowler.slug}:${skin.id}`,
    voucherItemId: SKIN_VOUCHER_ITEMS[skin.id] || VOUCHER_ITEM_ID,
  }))).filter((choice) => !owns(choice.entitlementId));
}

export function createVoucherClient({
  platformApi,
  loadout,
  createRedemptionId = defaultRedemptionId,
} = {}) {
  let state = { balance: 0, swimsuitBalance: 0, status: "idle", error: "" };

  function applyProgress(progress) {
    state = {
      balance: quantityFrom(progress, VOUCHER_ITEM_ID),
      swimsuitBalance: quantityFrom(progress, SWIMSUIT_VOUCHER_ITEM_ID),
      status: "ready",
      error: "",
    };
    return state.balance;
  }

  async function redeem(entitlementId) {
    const voucherItemId = voucherItemForEntitlement(entitlementId);
    const available = voucherItemId === SWIMSUIT_VOUCHER_ITEM_ID ? state.swimsuitBalance : state.balance;
    if (available < 1 || state.status === "redeeming" || !SKIN_ENTITLEMENT.test(String(entitlementId || ""))) return false;
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
