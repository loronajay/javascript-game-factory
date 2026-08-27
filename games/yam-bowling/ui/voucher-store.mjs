import { formatVoucherPrice } from "../profile/voucher-store-client.mjs";

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;",
  })[character]);
}

function voucherCount(quantity, name) {
  return `${quantity} ${name}${quantity === 1 ? "" : "s"}`;
}

export function createVoucherStore({
  storeClient,
  voucherClient,
  emoteVoucherClient,
  accountAccess,
  onProgress = () => {},
  audio,
} = {}) {
  function balances() {
    const skinState = voucherClient?.getState?.() || {};
    const skins = skinState.balance || 0;
    const swimsuits = skinState.swimsuitBalance || 0;
    const emotes = emoteVoucherClient?.getState?.().balance || 0;
    return `${voucherCount(skins, "Skin Voucher")} · ${voucherCount(swimsuits, "Swimsuit Voucher")} · ${voucherCount(emotes, "Emote Voucher")}`;
  }

  function render() {
    $("voucher-store-balances").textContent = balances();
    $("voucher-store-grid").innerHTML = (storeClient?.getOffers?.() || []).map((offer) => `
      <article class="voucher-store-offer">
        <div class="voucher-store-offer__art">
          <img src="${escapeHtml(offer.asset)}" alt="${escapeHtml(offer.name)} collectible voucher" />
          <b>${escapeHtml(`×${offer.quantity}`)}</b>
        </div>
        <div class="voucher-store-offer__copy">
          <p class="eyebrow">${escapeHtml(voucherCount(offer.quantity, offer.itemId === "skin-voucher"
            ? "Skin Voucher"
            : offer.itemId === "swimsuit-voucher" ? "Swimsuit Voucher" : "Emote Voucher"))}</p>
          <h3>${escapeHtml(offer.name)}</h3>
          <p>${escapeHtml(offer.description)}</p>
          <button class="button button--primary" type="button" data-voucher-offer="${escapeHtml(offer.id)}">
            Buy ${escapeHtml(formatVoucherPrice(offer.cents, offer.currency))}
          </button>
        </div>
      </article>`).join("");
    return balances();
  }

  function open() {
    if (!accountAccess?.requireFactoryAccount?.()) return false;
    $("voucher-store-status").textContent = "";
    render();
    $("voucher-store-dialog").showModal();
    audio?.play?.("uiOpen");
    return true;
  }

  async function buy(offerId) {
    if (!accountAccess?.requireFactoryAccount?.()) return false;
    const buttons = $("voucher-store-grid").querySelectorAll?.("[data-voucher-offer]") || [];
    for (const button of buttons) button.disabled = true;
    $("voucher-store-status").textContent = "Opening secure checkout…";
    const purchased = await storeClient?.purchase?.(offerId);
    if (!purchased) {
      for (const button of buttons) button.disabled = false;
      $("voucher-store-status").textContent = "Checkout could not be opened. Please try again.";
    }
    return Boolean(purchased);
  }

  async function settleReturn() {
    const result = await storeClient?.fulfillReturn?.();
    if (!result?.progress) return false;
    voucherClient?.applyProgress?.(result.progress);
    emoteVoucherClient?.applyProgress?.(result.progress);
    onProgress(result.progress);
    render();
    $("voucher-store-status").textContent = "Purchase complete. Your vouchers are ready to redeem.";
    return true;
  }

  function bind() {
    $("shop-button").addEventListener("click", open);
    $("profile-shop-button").addEventListener("click", open);
    $("voucher-store-close").addEventListener("click", () => $("voucher-store-dialog").close());
    $("voucher-store-grid").addEventListener("click", (event) => {
      const button = event.target.closest("[data-voucher-offer]");
      if (button) return buy(button.dataset.voucherOffer);
      return false;
    });
    settleReturn().catch(() => {});
  }

  return { bind, open, refresh: render, settleReturn };
}
