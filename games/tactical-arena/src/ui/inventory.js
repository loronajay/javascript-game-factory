import {
  activateConsumable,
  getInventoryCatalog,
} from "../progression/inventory.js";

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

export function openInventory(storage = globalThis.localStorage) {
  const overlay = ensureHost();
  let statusText = "";
  let pendingActivationId = null;

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
    titleStack.append(el("h2", "", "Inventory"), el("p", "inventory-sub", "Owned consumables activate here."));
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
      card.appendChild(createInventoryIcon(item));
      const copy = el("div", "shop-item-copy");
      copy.append(
        el("b", "shop-item-title", item.name),
        el("span", "shop-item-sub", `Owned x${item.quantity}`),
        el("span", "shop-item-meta", item.description),
      );
      const activate = el("button", "shop-buy-btn inventory-activate-btn", "Activate");
      activate.type = "button";
      activate.setAttribute("aria-label", `Activate ${item.name}`);
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
    itemRow.appendChild(createInventoryIcon(item));
    const copy = el("div", "shop-confirm-copy");
    copy.append(
      el("b", "shop-confirm-name", item.name),
      el("span", "shop-confirm-sub", activationPreview(item)),
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
    activate.setAttribute("aria-label", `Confirm activation for ${item.name}`);
    activate.addEventListener("click", () => confirmActivation(item));
    foot.append(cancel, activate);

    dialog.append(head, itemRow, warning, foot);
    layer.appendChild(dialog);
    return layer;
  }

  function confirmActivation(item) {
    const result = activateConsumable(storage, item.id);
    pendingActivationId = null;
    statusText = activationStatus(result);
    render();
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

function createInventoryIcon(item) {
  const icon = el("div", "shop-consumable-icon inventory-consumable-icon");
  icon.setAttribute("aria-hidden", "true");
  if (item.effect?.kind === "campaign-damage-boost") icon.textContent = "+2";
  else if (item.effect?.kind === "random-unowned-skin") icon.textContent = "?";
  else icon.textContent = `${item.effect?.percentBonus ?? ""}%`;
  return icon;
}

function activationPreview(item) {
  if (item.activationTrigger === "valor-gained") return "Timer starts with first Valor gained.";
  if (item.activationTrigger === "campaign-mission-started") return "Timer starts with first campaign mission.";
  return "Reward resolution coming soon.";
}

function activationStatus(result) {
  if (!result.accepted && result.errorCode === "CONSUMABLE_NOT_OWNED") return "That consumable is no longer available.";
  if (!result.accepted) return "That consumable cannot be activated.";
  if (result.offer.activationTrigger === "immediate") return `${result.offer.name} activated. Reward resolution coming soon.`;
  return `${result.offer.name} armed. Timer starts after ${triggerLabel(result.offer.activationTrigger)}.`;
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

function el(tag, className = "", text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
