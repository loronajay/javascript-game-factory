import test from "node:test";
import assert from "node:assert/strict";

import { readUnlockProgress, writeUnlockProgress } from "../src/progression/unlocks.js";
import { grantConsumable, readInventory } from "../src/progression/inventory.js";
import { openInventory } from "../src/ui/inventory.js";
import { openShop } from "../src/ui/shop.js";
import { openSkinGallery } from "../src/ui/skinGallery.js";

class FakeClassList {
  constructor(node) {
    this.node = node;
  }

  add(...names) {
    const current = new Set(this.node.className.split(/\s+/).filter(Boolean));
    for (const name of names) current.add(name);
    this.node.className = [...current].join(" ");
  }

  contains(name) {
    return this.node.className.split(/\s+/).includes(name);
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.className = "";
    this.textContent = "";
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = new FakeClassList(this);
    this.hidden = false;
    this.disabled = false;
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node) {
    if (node.parentElement) {
      node.parentElement.children = node.parentElement.children.filter((child) => child !== node);
    }
    node.parentElement = this;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== handler));
  }

  dispatchEvent(event) {
    for (const handler of this.listeners.get(event.type) ?? []) handler(event);
    return true;
  }

  click() {
    for (const handler of this.listeners.get("click") ?? []) {
      handler({ target: this, stopPropagation() {} });
    }
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement("body");
    this.listeners = new Map();
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== handler));
  }
}

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function walk(node, predicate, matches = []) {
  if (node && predicate(node)) matches.push(node);
  for (const child of node?.children ?? []) walk(child, predicate, matches);
  return matches;
}

function hasClass(node, className) {
  return node.className.split(/\s+/).includes(className);
}

function visibleText(node) {
  return [node.textContent, ...(node.children ?? []).map(visibleText)].join("");
}

const SIGNED_IN_ACCOUNT = Object.freeze({ authenticated: true, playerId: "factory-player-1" });

test("shop skins render under unit shelves and Valor uses an icon badge", () => {
  globalThis.document = new FakeDocument();

  openShop(storageAdapter());

  const overlay = document.body.children[0];
  const balance = walk(overlay, (node) => hasClass(node, "shop-balance"))[0];
  assert.ok(balance, "shop should show the Valor balance badge");
  assert.ok(walk(balance, (node) => hasClass(node, "valor-icon")).length > 0);
  assert.match(balance.getAttribute("aria-label"), /Valor$/);
  assert.doesNotMatch(visibleText(balance), /Valor/);

  const skinsTab = walk(overlay, (node) => node.tagName === "BUTTON" && node.textContent === "Skins")[0];
  skinsTab.click();

  const shelves = walk(overlay, (node) => hasClass(node, "shop-unit-skin-section"));
  assert.ok(shelves.length > 0, "shop skins should be organized into per-unit shelves");
  assert.ok(shelves.some((node) => node.dataset.type === "swordsman"));
});

test("shop consumables tab sells paid consumables with checkout coming soon feedback", () => {
  globalThis.document = new FakeDocument();

  openShop(storageAdapter(), { account: SIGNED_IN_ACCOUNT });

  const overlay = document.body.children[0];
  const consumablesTab = walk(overlay, (node) => node.tagName === "BUTTON" && node.textContent === "Consumables")[0];
  assert.ok(consumablesTab, "shop should expose the renamed Consumables tab");
  assert.equal(walk(overlay, (node) => node.tagName === "BUTTON" && node.textContent === "Boosts").length, 0);
  consumablesTab.click();

  const guidance = walk(overlay, (node) => hasClass(node, "shop-consumable-note"))[0];
  assert.ok(guidance, "consumables tab should explain where purchased boosts and skin grants activate");
  assert.match(guidance.textContent, /Inventory tab/i);

  const boostCard = walk(overlay, (node) => hasClass(node, "shop-consumable") && visibleText(node).includes("Valor Boost I"))[0];
  assert.ok(boostCard, "consumables tab should render Valor boosts for purchase");
  assert.match(visibleText(boostCard), /\+20% earned Valor from all sources\./);
  assert.doesNotMatch(visibleText(boostCard), /24h from first Valor gained/);
  assert.doesNotMatch(visibleText(boostCard), /Opens from Inventory/i);

  const valorIcon = walk(boostCard, (node) => hasClass(node, "shop-consumable-icon"))[0];
  assert.ok(hasClass(valorIcon, "is-valor-boost"), "Valor boosts should use a specific icon treatment");
  assert.match(visibleText(valorIcon), /\+20%/);
  assert.ok(walk(valorIcon, (node) => hasClass(node, "valor-icon")).length > 0);

  const skinCard = walk(overlay, (node) => hasClass(node, "shop-consumable") && visibleText(node).includes("Random Rare Skin"))[0];
  const mysteryIcon = walk(skinCard, (node) => hasClass(node, "shop-consumable-icon"))[0];
  assert.ok(hasClass(mysteryIcon, "is-random-skin"), "random skin grants should use a deliberate mystery icon");
  assert.match(visibleText(mysteryIcon), /\?/);

  const damageCard = walk(overlay, (node) => hasClass(node, "shop-consumable") && visibleText(node).includes("Campaign Boost"))[0];
  const damageIcon = walk(damageCard, (node) => hasClass(node, "shop-consumable-icon"))[0];
  assert.ok(hasClass(damageIcon, "is-damage-boost"), "campaign damage should use a dedicated damage icon");
  assert.match(visibleText(damageIcon), /\+2DMG/);

  const buy = walk(boostCard, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-buy-btn"))[0];
  assert.equal(buy.textContent, "$1.99");
  assert.equal(buy.getAttribute("aria-label"), "Buy Valor Boost I with $1.99 soon");
  buy.click();

  assert.match(walk(overlay, (node) => hasClass(node, "shop-status"))[0].textContent, /checkout coming soon/i);
});

test("shop purchase buttons require a signed-in factory account", () => {
  globalThis.document = new FakeDocument();
  const storage = storageAdapter();
  const locationRef = {
    href: "https://arcade.example/games/tactical-arena/index.html?mode=shop#skins",
    assigned: "",
    assign(url) {
      this.assigned = url;
      this.href = url;
    },
  };
  writeUnlockProgress(storage, { valorBalance: 99999 });

  openShop(storage, { account: { authenticated: false }, locationRef });

  const overlay = document.body.children[0];
  assert.match(walk(overlay, (node) => hasClass(node, "shop-status"))[0].textContent, /sign in to buy/i);

  const clodCard = walk(overlay, (node) => hasClass(node, "shop-unit") && visibleText(node).includes("Clod"))[0];
  const clodButtons = walk(clodCard, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-buy-btn"));
  assert.equal(clodButtons.length, 1);
  assert.equal(clodButtons[0].textContent, "Sign In");
  assert.equal(clodButtons[0].disabled, false);
  assert.equal(clodButtons[0].getAttribute("aria-label"), "Sign in to buy Clod");
  clodButtons[0].click();
  assert.equal(
    locationRef.assigned,
    "https://arcade.example/sign-in/index.html?next=https%3A%2F%2Farcade.example%2Fgames%2Ftactical-arena%2Findex.html%3Fmode%3Dshop%23skins",
  );

  const skinsTab = walk(overlay, (node) => node.tagName === "BUTTON" && node.textContent === "Skins")[0];
  skinsTab.click();
  const skinCard = walk(overlay, (node) => hasClass(node, "shop-skin") && visibleText(node).includes("Summer Vibes"))[0];
  const skinButton = walk(skinCard, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-buy-btn"))[0];
  assert.equal(skinButton.textContent, "Sign In");
  skinButton.click();
  assert.equal(readUnlockProgress(storage).purchasedSkins.length, 0);
});

test("inventory activation requires confirmation before consuming an owned consumable", () => {
  globalThis.document = new FakeDocument();
  const storage = storageAdapter();
  grantConsumable(storage, "valor-boost-1", 1);

  openInventory(storage);

  const overlay = document.body.children[0];
  const inventoryGuidance = walk(overlay, (node) => hasClass(node, "inventory-sub"))[0];
  assert.match(inventoryGuidance.textContent, /skin grants and boosts/i);

  const itemCard = walk(overlay, (node) => hasClass(node, "inventory-item") && visibleText(node).includes("Valor Boost I"))[0];
  assert.ok(itemCard, "inventory should render owned consumables");
  assert.match(visibleText(itemCard), /Owned x1/);
  const itemIcon = walk(itemCard, (node) => hasClass(node, "inventory-consumable-icon"))[0];
  assert.ok(hasClass(itemIcon, "is-valor-boost"));
  assert.ok(walk(itemIcon, (node) => hasClass(node, "valor-icon")).length > 0);

  const activate = walk(itemCard, (node) => node.tagName === "BUTTON" && hasClass(node, "inventory-activate-btn"))[0];
  activate.click();

  assert.equal(readInventory(storage).consumables["valor-boost-1"], 1, "opening confirmation should not consume item");
  let confirm = walk(overlay, (node) => hasClass(node, "inventory-activation-confirm"))[0];
  assert.ok(confirm, "activation should open a confirmation dialog");
  assert.match(visibleText(confirm), /Confirm Activation/);
  assert.match(visibleText(confirm), /consume one item/i);

  walk(confirm, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-confirm-cancel"))[0].click();
  assert.equal(readInventory(storage).consumables["valor-boost-1"], 1, "cancel should leave inventory untouched");

  walk(overlay, (node) => node.tagName === "BUTTON" && hasClass(node, "inventory-activate-btn"))[0].click();
  confirm = walk(overlay, (node) => hasClass(node, "inventory-activation-confirm"))[0];
  walk(confirm, (node) => node.tagName === "BUTTON" && hasClass(node, "inventory-confirm-activate"))[0].click();

  const inventory = readInventory(storage);
  assert.equal(inventory.consumables["valor-boost-1"], undefined);
  assert.equal(inventory.activeConsumables.length, 1);
  assert.equal(inventory.activeConsumables[0].status, "pending");
  assert.match(walk(overlay, (node) => hasClass(node, "shop-status"))[0].textContent, /timer starts/i);
});

test("shop skin cards offer USD checkout and Valor purchase buttons", () => {
  globalThis.document = new FakeDocument();
  const storage = storageAdapter();
  writeUnlockProgress(storage, { valorBalance: 3000 });

  openShop(storage, { account: SIGNED_IN_ACCOUNT });

  const overlay = document.body.children[0];
  const skinsTab = walk(overlay, (node) => node.tagName === "BUTTON" && node.textContent === "Skins")[0];
  skinsTab.click();

  const skinCard = walk(overlay, (node) => hasClass(node, "shop-skin") && visibleText(node).includes("Summer Vibes"))[0];
  assert.ok(skinCard, "shop should render an unowned purchasable skin");

  const buyButtons = walk(skinCard, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-buy-btn"));
  const usdBuy = buyButtons.find((node) => /^\$\d+\.\d{2}$/.test(node.textContent));
  const valorBuy = buyButtons.find((node) => /Valor$/.test(node.getAttribute("aria-label") ?? ""));
  assert.ok(usdBuy, "skin card should keep the premium USD checkout button");
  assert.ok(valorBuy, "skin card should add a Valor purchase button");
  assert.equal(valorBuy.getAttribute("aria-label"), "Unlock Summer Vibes for 850 Valor");
  assert.ok(walk(valorBuy, (node) => hasClass(node, "valor-icon")).length > 0);

  valorBuy.click();

  let progress = readUnlockProgress(storage);
  assert.equal(progress.valorBalance, 3000, "opening confirmation should not spend Valor");
  assert.equal(progress.purchasedSkins.some((skin) => skin.slug === "summer-vibes"), false);

  let confirm = walk(overlay, (node) => hasClass(node, "shop-purchase-confirm"))[0];
  assert.ok(confirm, "Valor click should open a purchase confirmation popup");
  assert.equal(confirm.getAttribute("role"), "dialog");
  assert.match(visibleText(confirm), /Confirm Unlock/);
  assert.match(visibleText(confirm), /Summer Vibes/);

  const cancel = walk(confirm, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-confirm-cancel"))[0];
  const purchase = walk(confirm, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-confirm-purchase"))[0];
  assert.equal(cancel.textContent, "Cancel");
  assert.equal(purchase.getAttribute("aria-label"), "Purchase Summer Vibes for 850 Valor");
  assert.ok(walk(purchase, (node) => hasClass(node, "valor-icon")).length > 0);
  assert.doesNotMatch(visibleText(purchase), /Valor/);

  cancel.click();
  assert.equal(walk(overlay, (node) => hasClass(node, "shop-purchase-confirm")).length, 0);
  assert.equal(readUnlockProgress(storage).valorBalance, 3000, "cancel should leave Valor untouched");

  valorBuy.click();
  confirm = walk(overlay, (node) => hasClass(node, "shop-purchase-confirm"))[0];
  walk(confirm, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-confirm-purchase"))[0].click();

  progress = readUnlockProgress(storage);
  assert.equal(progress.valorBalance, 2150);
  assert.ok(progress.purchasedSkins.some((skin) => skin.slug === "summer-vibes"));
  assert.ok(walk(overlay, (node) => hasClass(node, "shop-status"))[0].textContent.includes("Summer Vibes unlocked"));
  const ownedSkinCard = walk(overlay, (node) => hasClass(node, "shop-skin") && hasClass(node, "is-owned"))[0];
  assert.ok(ownedSkinCard, "Valor purchase should flip the skin card to owned");
  const ownedButtons = walk(ownedSkinCard, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-buy-btn"));
  assert.equal(ownedButtons.length, 1, "owned skin cards should collapse purchase paths into one button");
  assert.equal(ownedButtons[0].textContent, "Owned");
  assert.ok(ownedButtons[0].disabled);
});

test("shop skin USD purchase opens Stripe checkout through the configured endpoint", async () => {
  globalThis.document = new FakeDocument();
  const storage = storageAdapter();
  const fetchCalls = [];
  const locationRef = {
    href: "https://factory.example/games/tactical-arena/index.html",
    assigned: "",
    assign(url) {
      this.assigned = url;
      this.href = url;
    },
  };

  openShop(storage, {
    account: { ...SIGNED_IN_ACCOUNT, token: "token-1" },
    checkoutEndpoint: "/api/test-checkout",
    locationRef,
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      return {
        ok: true,
        async json() {
          return { url: "https://checkout.stripe.com/c/test-session" };
        },
      };
    },
  });

  const overlay = document.body.children[0];
  walk(overlay, (node) => node.tagName === "BUTTON" && node.textContent === "Skins")[0].click();

  const skinCard = walk(overlay, (node) => hasClass(node, "shop-skin") && visibleText(node).includes("Summer Vibes"))[0];
  const usdBuy = walk(skinCard, (node) => node.tagName === "BUTTON" && hasClass(node, "is-premium"))[0];
  usdBuy.click();

  assert.match(walk(overlay, (node) => hasClass(node, "shop-status"))[0].textContent, /Opening secure checkout/i);

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(locationRef.assigned, "https://checkout.stripe.com/c/test-session");
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "https://factory.example/api/test-checkout");
  assert.equal(fetchCalls[0].init.headers.Authorization, "Bearer token-1");
  const body = JSON.parse(fetchCalls[0].init.body);
  assert.equal(body.offer.kind, "skin");
  assert.match(body.offer.sku, /^ta\.skin\./);
  assert.equal("price" in body.offer, false);
  assert.equal(body.successUrl, "https://factory.example/games/tactical-arena/index.html?checkout=success&session_id=%7BCHECKOUT_SESSION_ID%7D");
});

test("shop skin packs render clickable contents and use Valor confirmation", () => {
  globalThis.document = new FakeDocument();
  const storage = storageAdapter();
  writeUnlockProgress(storage, { valorBalance: 30000 });

  openShop(storage, { account: SIGNED_IN_ACCOUNT });

  const overlay = document.body.children[0];
  const packsTab = walk(overlay, (node) => node.tagName === "BUTTON" && node.textContent === "Skin Packs")[0];
  assert.ok(packsTab, "shop should expose a Skin Packs tab");
  packsTab.click();

  const halloweenCard = walk(overlay, (node) => hasClass(node, "shop-skin-pack") && visibleText(node).includes("Halloween Pack"))[0];
  assert.ok(halloweenCard, "shop should render the Halloween Pack");
  assert.match(visibleText(halloweenCard), /25 skins/);
  assert.doesNotMatch(visibleText(halloweenCard), /Enchanted/);

  const details = walk(halloweenCard, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-detail-btn"))[0];
  details.click();

  const detail = walk(overlay, (node) => hasClass(node, "shop-pack-detail"))[0];
  assert.ok(detail, "pack details should open inside the shop");
  assert.match(visibleText(detail), /Pumpkin Knight/);
  assert.doesNotMatch(visibleText(detail), /Enchanted/);

  const valorBuy = walk(detail, (node) => node.tagName === "BUTTON" && hasClass(node, "is-valor"))[0];
  valorBuy.click();

  let progress = readUnlockProgress(storage);
  assert.equal(progress.valorBalance, 30000, "opening confirmation should not spend Valor");

  const confirm = walk(overlay, (node) => hasClass(node, "shop-purchase-confirm"))[0];
  assert.ok(confirm, "pack Valor click should open a confirmation popup");
  assert.match(visibleText(confirm), /Halloween Pack/);
  assert.match(visibleText(confirm), /25 skins/);
  const purchase = walk(confirm, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-confirm-purchase"))[0];
  assert.equal(purchase.getAttribute("aria-label"), "Purchase Halloween Pack for 19,500 Valor");
  purchase.click();

  progress = readUnlockProgress(storage);
  assert.equal(progress.valorBalance, 10500);
  assert.ok(progress.purchasedSkins.some((skin) => skin.type === "swordsman" && skin.slug === "pumpkin-knight"));
  assert.equal(
    progress.purchasedSkins.some((skin) => skin.type === "swordsman" && skin.slug === "enchanted"),
    false,
    "pack purchase should not grant Halloween-exclusive singles"
  );
});

test("shop and confirmation show the cancer research proceeds note for Fuck Cancer skins", () => {
  globalThis.document = new FakeDocument();
  const storage = storageAdapter();
  writeUnlockProgress(storage, { valorBalance: 99999 });

  openShop(storage, { account: SIGNED_IN_ACCOUNT });

  const overlay = document.body.children[0];
  const skinsTab = walk(overlay, (node) => node.tagName === "BUTTON" && node.textContent === "Skins")[0];
  skinsTab.click();

  const skinCard = walk(overlay, (node) => hasClass(node, "shop-skin") && visibleText(node).includes("Fuck Cancer"))[0];
  assert.ok(skinCard, "shop should render the Fuck Cancer skin");
  assert.match(visibleText(skinCard), /All proceeds for this skin will be donated for cancer research\./);

  const valorBuy = walk(skinCard, (node) => node.tagName === "BUTTON" && hasClass(node, "is-valor"))[0];
  valorBuy.click();

  const confirm = walk(overlay, (node) => hasClass(node, "shop-purchase-confirm"))[0];
  assert.match(visibleText(confirm), /All proceeds for this skin will be donated for cancer research\./);

  walk(confirm, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-confirm-cancel"))[0].click();

  const packsTab = walk(overlay, (node) => node.tagName === "BUTTON" && node.textContent === "Skin Packs")[0];
  packsTab.click();

  const packCard = walk(overlay, (node) => hasClass(node, "shop-skin-pack") && visibleText(node).includes("Fuck Cancer Charity Pack"))[0];
  assert.ok(packCard, "shop should render the Fuck Cancer Charity Pack");
  assert.match(visibleText(packCard), /All proceeds for this pack will be donated for cancer research\./);

  const details = walk(packCard, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-detail-btn"))[0];
  details.click();

  const detail = walk(overlay, (node) => hasClass(node, "shop-pack-detail"))[0];
  assert.match(visibleText(detail), /All proceeds for this pack will be donated for cancer research\./);

  const packValorBuy = walk(detail, (node) => node.tagName === "BUTTON" && hasClass(node, "is-valor"))[0];
  packValorBuy.click();

  const packConfirm = walk(overlay, (node) => hasClass(node, "shop-purchase-confirm"))[0];
  assert.match(visibleText(packConfirm), /All proceeds for this pack will be donated for cancer research\./);
});

test("shop unit cards open a detail card and return to unit browsing", () => {
  globalThis.document = new FakeDocument();

  openShop(storageAdapter(), { account: SIGNED_IN_ACCOUNT });

  const overlay = document.body.children[0];
  const unitCard = walk(overlay, (node) => hasClass(node, "shop-unit") && visibleText(node).includes("Clod"))[0];
  assert.ok(unitCard, "shop should render unit cards");

  const buttons = walk(unitCard, (node) => node.tagName === "BUTTON");
  assert.equal(buttons[0].textContent, "Details", "details should sit above the purchase button");
  const usdBuy = buttons.find((node) => hasClass(node, "is-premium") && /^\$\d+\.\d{2}$/.test(node.textContent));
  const valorBuy = buttons.find((node) => hasClass(node, "is-valor") && /Valor$/.test(node.getAttribute("aria-label") ?? ""));
  assert.ok(usdBuy, "unit card should show the pending USD price button");
  assert.equal(usdBuy.getAttribute("aria-disabled"), "true");
  assert.ok(valorBuy, "unit card should keep the working Valor purchase button");

  buttons[0].click();

  const detail = walk(overlay, (node) => hasClass(node, "shop-unit-detail"))[0];
  assert.ok(detail, "details button should open a unit detail card inside the shop");
  assert.doesNotMatch(visibleText(detail), /Tips/i, "shop unit details should not be crowded by a tips panel");
  assert.equal(walk(detail, (node) => hasClass(node, "shop-unit-tips")).length, 0);
  const rules = walk(detail, (node) => hasClass(node, "shop-unit-detail-rules"))[0];
  assert.match(rules.innerHTML, /stat-grid/);
  assert.match(rules.innerHTML, /ref-group/);

  const back = walk(overlay, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-detail-back"))[0];
  assert.ok(back, "unit detail card should include a return control");
  back.click();

  assert.equal(walk(overlay, (node) => hasClass(node, "shop-unit-detail")).length, 0);
  assert.ok(walk(overlay, (node) => hasClass(node, "shop-unit")).length > 0, "back should restore unit browsing");
});

test("shop unit Valor purchase flips the unit card to one owned button", () => {
  globalThis.document = new FakeDocument();
  const storage = storageAdapter();
  writeUnlockProgress(storage, { valorBalance: 999 });

  openShop(storage, { account: SIGNED_IN_ACCOUNT });

  const overlay = document.body.children[0];
  const clodCard = walk(overlay, (node) => hasClass(node, "shop-unit") && visibleText(node).includes("Clod"))[0];
  assert.ok(clodCard, "shop should render an unowned Clod card");

  const buyButtons = walk(clodCard, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-buy-btn"));
  const usdBuy = buyButtons.find((node) => hasClass(node, "is-premium"));
  const valorBuy = buyButtons.find((node) => hasClass(node, "is-valor"));
  assert.equal(usdBuy.textContent, "$1.99");
  assert.equal(usdBuy.getAttribute("aria-label"), "Buy Clod with $1.99 soon");
  assert.equal(valorBuy.getAttribute("aria-label"), "Unlock Clod for 650 Valor");

  usdBuy.click();
  assert.equal(readUnlockProgress(storage).valorBalance, 999, "pending USD button should not spend Valor");

  valorBuy.click();

  let progress = readUnlockProgress(storage);
  assert.equal(progress.valorBalance, 999, "opening confirmation should not spend Valor");
  assert.equal(progress.unlockedUnits.includes("clod"), false);

  const confirm = walk(overlay, (node) => hasClass(node, "shop-purchase-confirm"))[0];
  assert.ok(confirm, "Valor click should open a purchase confirmation popup");
  assert.match(visibleText(confirm), /Clod/);
  const purchase = walk(confirm, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-confirm-purchase"))[0];
  assert.equal(purchase.getAttribute("aria-label"), "Purchase Clod for 650 Valor");
  assert.ok(walk(purchase, (node) => hasClass(node, "valor-icon")).length > 0);
  assert.doesNotMatch(visibleText(purchase), /Valor/);
  purchase.click();

  progress = readUnlockProgress(storage);
  assert.equal(progress.valorBalance, 349);
  assert.ok(progress.unlockedUnits.includes("clod"));
  const ownedClodCard = walk(overlay, (node) => hasClass(node, "shop-unit") && hasClass(node, "is-owned") && visibleText(node).includes("Clod"))[0];
  assert.ok(ownedClodCard, "Valor purchase should flip the unit card to owned");
  const ownedButtons = walk(ownedClodCard, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-buy-btn"));
  assert.equal(ownedButtons.length, 1);
  assert.equal(ownedButtons[0].textContent, "Owned");
  assert.ok(ownedButtons[0].disabled);
});

test("shop Valor confirmation explains when the player cannot afford the unlock", () => {
  globalThis.document = new FakeDocument();
  const storage = storageAdapter();
  writeUnlockProgress(storage, { valorBalance: 100 });

  openShop(storage, { account: SIGNED_IN_ACCOUNT });

  const overlay = document.body.children[0];
  const clodCard = walk(overlay, (node) => hasClass(node, "shop-unit") && visibleText(node).includes("Clod"))[0];
  const valorBuy = walk(clodCard, (node) => node.tagName === "BUTTON" && hasClass(node, "is-valor"))[0];
  valorBuy.click();

  const confirm = walk(overlay, (node) => hasClass(node, "shop-purchase-confirm"))[0];
  assert.ok(confirm, "unaffordable Valor purchases should stay in the confirmation popup");
  assert.match(visibleText(confirm), /Not enough Valor/i);
  assert.match(visibleText(confirm), /You have 100/i);
  assert.match(visibleText(confirm), /need 650/i);

  const purchase = walk(confirm, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-confirm-purchase"))[0];
  purchase.click();

  assert.equal(walk(overlay, (node) => hasClass(node, "shop-purchase-confirm")).length, 1);
  assert.equal(readUnlockProgress(storage).valorBalance, 100);
  assert.equal(readUnlockProgress(storage).unlockedUnits.includes("clod"), false);
  assert.equal(walk(overlay, (node) => hasClass(node, "shop-status"))[0].textContent, "");
});

test("clicking a shop skin portrait opens a viewer that closes back to the shop", () => {
  globalThis.document = new FakeDocument();

  openSkinGallery();
  const existingGallery = document.body.children[0];
  walk(existingGallery, (node) => node.tagName === "BUTTON" && hasClass(node, "ref-close"))[0].click();

  openShop(storageAdapter());

  const shopOverlay = document.body.children.find((node) => hasClass(node, "shop-modal"));
  const skinsTab = walk(shopOverlay, (node) => node.tagName === "BUTTON" && node.textContent === "Skins")[0];
  skinsTab.click();

  const preview = walk(shopOverlay, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-skin-preview"))[0];
  assert.ok(preview, "shop skin portrait should be a clickable preview button");
  assert.match(preview.getAttribute("aria-label"), /^View .+ skin for .+$/);
  preview.click();

  const galleryOverlay = document.body.children.find((node) => hasClass(node, "skin-gallery-modal"));
  assert.ok(galleryOverlay, "clicking the portrait should open the skin gallery modal");
  assert.equal(galleryOverlay.hidden, false);
  assert.equal(walk(galleryOverlay, (node) => hasClass(node, "skin-gallery-detail")).length, 1);
  assert.equal(walk(galleryOverlay, (node) => hasClass(node, "is-skin-detail")).length, 1);
  assert.equal(walk(galleryOverlay, (node) => hasClass(node, "skin-gallery-grid")).length, 0);
  assert.equal(walk(galleryOverlay, (node) => hasClass(node, "skin-gallery-detail-close")).length, 0);
  assert.ok(walk(galleryOverlay, (node) => node.tagName === "H2").some((node) => node.textContent === "Skin Viewer"));
  assert.equal(document.body.children.at(-1), galleryOverlay, "skin viewer should move above the shop modal");

  walk(galleryOverlay, (node) => node.tagName === "BUTTON" && hasClass(node, "ref-close"))[0].click();

  assert.equal(galleryOverlay.hidden, true);
  assert.equal(shopOverlay.hidden, false, "closing the shop-origin skin viewer should reveal the shop");
  assert.ok(walk(shopOverlay, (node) => hasClass(node, "shop-unit-skin-section")).length > 0);
});

test("clicking a shop skin card surface opens the direct viewer instead of the full skin grid", () => {
  globalThis.document = new FakeDocument();

  openShop(storageAdapter());

  const shopOverlay = document.body.children.find((node) => hasClass(node, "shop-modal"));
  const skinsTab = walk(shopOverlay, (node) => node.tagName === "BUTTON" && node.textContent === "Skins")[0];
  skinsTab.click();

  const card = walk(shopOverlay, (node) => hasClass(node, "shop-skin"))[0];
  assert.ok(card, "shop should render skin cards");
  assert.match(card.getAttribute("aria-label"), /^View .+ skin for .+$/);
  card.click();

  const galleryOverlay = document.body.children.find((node) => hasClass(node, "skin-gallery-modal"));
  assert.equal(galleryOverlay.hidden, false);
  assert.equal(walk(galleryOverlay, (node) => hasClass(node, "skin-gallery-detail")).length, 1);
  assert.equal(walk(galleryOverlay, (node) => hasClass(node, "is-skin-detail")).length, 1);
  assert.equal(walk(galleryOverlay, (node) => hasClass(node, "skin-gallery-grid")).length, 0);
  assert.equal(walk(galleryOverlay, (node) => hasClass(node, "skin-gallery-detail-close")).length, 0);
  assert.ok(walk(galleryOverlay, (node) => node.tagName === "H2").some((node) => node.textContent === "Skin Viewer"));
});
