import { getInventoryCatalog } from "../progression/inventory.js";
import { enqueuePurchasedUnlockAnnouncements } from "../progression/announcements.js";
import { readStoredFactoryAccountSession } from "../platform/factoryAccount.js";
import { createConsumableIcon } from "./consumableIcons.js";
import { el } from "./domHelpers.js";
import { isRandomSkinConsumable, remainingSkinRolls, runConsumableActivation } from "./inventoryActivation.js";
import { requestProgressionAnnouncements } from "./progressionAnnouncements.js";

let host = null;
let hostDocument = null;

function ensureHost() {
  if (host && hostDocument === document) return host;
  host = document.createElement("div");
  hostDocument = document;
  host.className = "ref-modal inventory-modal";
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

export function openInventory(storage = globalThis.localStorage, options = {}) {
  const overlay = ensureHost();
  const account = options.account ?? readStoredFactoryAccountSession();
  // Injected in tests; otherwise runConsumableActivation builds the default platform client.
  const apiClient = options.apiClient;
  let statusText = "";
  let pendingActivationId = null;
  let activationInFlight = false;

  function render() {
    const catalog = getInventoryCatalog(storage);
    const pendingItem = pendingActivationId
      ? catalog.items.find((item) => item.id === pendingActivationId && item.quantity > 0) ?? null
      : null;
    if (pendingActivationId && !pendingItem) pendingActivationId = null;

    overlay.replaceChildren();
    const card = el("div", "ref-card inventory-card");
    overlay.appendChild(card);

    const head = el("header", "ref-head inventory-head");
    const titleRow = el("div", "ref-head-title shop-title-row");
    const titleStack = el("div", "shop-title-stack");
    titleStack.append(
      el("h2", "", "Inventory"),
      el("p", "inventory-sub", "Activate skin grants and boosts here. Timed boosts stay dormant until activated, then begin on their next Valor or campaign trigger."),
    );
    const closeBtn = el("button", "ref-close", "X");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", close);
    titleRow.append(titleStack, closeBtn);
    head.appendChild(titleRow);
    card.appendChild(head);

    const body = el("div", "inventory-body");
    renderOwnedItems(body, catalog);
    renderActiveItems(body, catalog.activeConsumables);
    card.appendChild(body);

    const foot = el("footer", "roster-foot shop-foot");
    const status = el("span", "shop-status", statusText);
    const done = el("button", "menu-btn", "Done");
    done.type = "button";
    done.addEventListener("click", close);
    foot.append(status, done);
    card.appendChild(foot);

    if (pendingItem) overlay.appendChild(createActivationConfirm(pendingItem));
  }

  function renderOwnedItems(body, catalog) {
    const section = el("section", "inventory-section");
    section.appendChild(el("h3", "shop-section-title", "Consumables"));
    if (catalog.ownedItems.length === 0) {
      const empty = el("div", "shop-empty inventory-empty");
      empty.append(
        el("b", "shop-empty-title", "No Consumables"),
        el("span", "shop-empty-sub", "Purchased consumables will appear here."),
      );
      section.appendChild(empty);
      body.appendChild(section);
      return;
    }

    const grid = el("div", "inventory-grid");
    for (const item of catalog.ownedItems) {
      const card = el("article", "shop-item inventory-item");
      card.appendChild(createConsumableIcon(item, { className: "inventory-consumable-icon" }));
      const copy = el("div", "shop-item-copy");
      copy.append(
        el("b", "shop-item-title", item.name),
        el("span", "shop-item-sub", `Owned x${item.quantity}`),
        el("span", "shop-item-meta", item.description),
      );
      const activate = el("button", "shop-buy-btn inventory-activate-btn", "Activate");
      activate.type = "button";
      activate.setAttribute("aria-label", `Activate ${item.name}`);
      activate.disabled = activationInFlight || remainingSkinRolls(item, storage) === 0;
      activate.addEventListener("click", () => {
        pendingActivationId = item.id;
        statusText = "";
        render();
      });
      card.append(copy, activate);
      grid.appendChild(card);
    }
    section.appendChild(grid);
    body.appendChild(section);
  }

  function renderActiveItems(body, activeConsumables) {
    if (activeConsumables.length === 0) return;
    const section = el("section", "inventory-section");
    section.appendChild(el("h3", "shop-section-title", "Activated"));
    const list = el("div", "inventory-active-list");
    for (const activation of activeConsumables) {
      const row = el("article", "inventory-active-row");
      const copy = el("div", "shop-item-copy");
      copy.append(
        el("b", "shop-item-title", activation.offer?.name ?? "Consumable"),
        el("span", "shop-item-meta", activationStatusLabel(activation)),
      );
      row.append(copy);
      list.appendChild(row);
    }
    section.appendChild(list);
    body.appendChild(section);
  }

  function createActivationConfirm(item) {
    const layer = el("div", "shop-confirm-layer inventory-confirm-layer");
    layer.addEventListener("click", (event) => {
      if (event.target === layer) dismissActivation();
    });

    const dialog = el("section", "shop-purchase-confirm inventory-activation-confirm");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "inventory-activation-confirm-title");
    dialog.addEventListener("click", (event) => event.stopPropagation?.());

    const head = el("header", "shop-confirm-head");
    const title = el("h3", "shop-confirm-title", "Confirm Activation");
    title.id = "inventory-activation-confirm-title";
    head.append(el("span", "shop-confirm-kicker", "Inventory"), title);

    const itemRow = el("div", "shop-confirm-item inventory-confirm-item");
    itemRow.appendChild(createConsumableIcon(item, { className: "inventory-consumable-icon" }));
    const copy = el("div", "shop-confirm-copy");
    copy.append(
      el("b", "shop-confirm-name", item.name),
      el("span", "shop-confirm-sub", activationPreview(item, storage)),
    );
    itemRow.appendChild(copy);

    const warning = el(
      "p",
      "shop-confirm-warning inventory-confirm-warning",
      "This will consume one item. Activate only when you are ready.",
    );

    const foot = el("footer", "shop-confirm-actions");
    const cancel = el("button", "menu-btn ghost shop-confirm-cancel", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", dismissActivation);
    const activate = el("button", "menu-btn shop-confirm-purchase inventory-confirm-activate", "Activate");
    activate.type = "button";
    activate.disabled = activationInFlight;
    activate.setAttribute("aria-label", `Confirm activation for ${item.name}`);
    activate.addEventListener("click", () => void confirmActivation(item));
    foot.append(cancel, activate);

    dialog.append(head, itemRow, warning, foot);
    layer.appendChild(dialog);
    return layer;
  }

  async function confirmActivation(item) {
    if (activationInFlight) return;
    activationInFlight = true;
    pendingActivationId = null;
    statusText = `Using ${item.name}…`;
    render();

    const result = await runConsumableActivation({ item, storage, account, apiClient });
    activationInFlight = false;
    statusText = result.status;
    render();
    // Anything the activation granted (skins from a random-skin item) rides the same unlock
    // announcement feed as a shop purchase.
    if (result.outcome === "activated" && result.grantedNames?.length) {
      enqueuePurchasedUnlockAnnouncements(storage, result.beforeProgress, result.afterProgress);
      requestProgressionAnnouncements({ storage });
    }
  }

  function dismissActivation() {
    pendingActivationId = null;
    render();
  }

  function close() {
    pendingActivationId = null;
    overlay.hidden = true;
    overlay.removeEventListener("click", onOverlay);
    document.removeEventListener("keydown", onKey, true);
    overlay.replaceChildren();
  }

  function onOverlay(event) {
    if (event.target === overlay) close();
  }

  function onKey(event) {
    if (event.key !== "Escape") return;
    if (pendingActivationId) {
      event.preventDefault?.();
      dismissActivation();
      return;
    }
    close();
  }

  overlay.addEventListener("click", onOverlay);
  document.addEventListener("keydown", onKey, true);
  overlay.hidden = false;
  render();
}

function activationPreview(item, storage) {
  if (item.activationTrigger === "valor-gained") return "After activation, the timer starts with your next Valor gain.";
  if (item.activationTrigger === "campaign-mission-started") return "After activation, the timer starts with your next campaign mission.";
  if (isRandomSkinConsumable(item)) {
    const remaining = remainingSkinRolls(item, storage);
    const count = Math.max(1, Math.floor(Number(item.effect.count) || 1));
    if (remaining === 0) return `You already own every ${item.effect.rarity} skin.`;
    const grant = count === 1 ? `one ${item.effect.rarity} skin` : `${count} ${item.effect.rarity} skins`;
    return `Rolls ${grant} you don't own yet. ${remaining} left to win.`;
  }
  return "This item resolves as soon as it is used.";
}

function activationStatusLabel(activation) {
  if (activation.status === "active" && activation.expiresAt) {
    return `Active until ${new Date(activation.expiresAt).toLocaleString()}`;
  }
  if (activation.status === "resolved") return "Activated";
  if (activation.status === "expired") return "Expired";
  return `Pending until ${triggerLabel(activation.activationTrigger)}`;
}

function triggerLabel(trigger) {
  if (trigger === "valor-gained") return "Valor is gained";
  if (trigger === "campaign-mission-started") return "a campaign mission starts";
  return "used";
}
