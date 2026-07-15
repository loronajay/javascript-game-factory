import test from "node:test";
import assert from "node:assert/strict";

import { readUnlockProgress, writeUnlockProgress } from "../src/progression/unlocks.js";
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

test("shop skin cards offer USD checkout and Valor purchase buttons", () => {
  globalThis.document = new FakeDocument();
  const storage = storageAdapter();
  writeUnlockProgress(storage, { valorBalance: 3000 });

  openShop(storage);

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
  assert.equal(valorBuy.getAttribute("aria-label"), "Unlock Summer Vibes for 1,550 Valor");
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
  assert.equal(purchase.getAttribute("aria-label"), "Purchase Summer Vibes for 1,550 Valor");
  assert.ok(walk(purchase, (node) => hasClass(node, "valor-icon")).length > 0);
  assert.doesNotMatch(visibleText(purchase), /Valor/);

  cancel.click();
  assert.equal(walk(overlay, (node) => hasClass(node, "shop-purchase-confirm")).length, 0);
  assert.equal(readUnlockProgress(storage).valorBalance, 3000, "cancel should leave Valor untouched");

  valorBuy.click();
  confirm = walk(overlay, (node) => hasClass(node, "shop-purchase-confirm"))[0];
  walk(confirm, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-confirm-purchase"))[0].click();

  progress = readUnlockProgress(storage);
  assert.equal(progress.valorBalance, 1450);
  assert.ok(progress.purchasedSkins.some((skin) => skin.slug === "summer-vibes"));
  assert.ok(walk(overlay, (node) => hasClass(node, "shop-status"))[0].textContent.includes("Summer Vibes unlocked"));
  const ownedSkinCard = walk(overlay, (node) => hasClass(node, "shop-skin") && hasClass(node, "is-owned"))[0];
  assert.ok(ownedSkinCard, "Valor purchase should flip the skin card to owned");
  const ownedButtons = walk(ownedSkinCard, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-buy-btn"));
  assert.equal(ownedButtons.length, 2, "both purchase paths should remain visible as owned");
  assert.ok(ownedButtons.every((node) => node.textContent === "Owned"));
  assert.ok(ownedButtons.every((node) => node.disabled));
});

test("shop unit cards open a detail card and return to unit browsing", () => {
  globalThis.document = new FakeDocument();

  openShop(storageAdapter());

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

test("shop unit Valor purchase flips both USD and Valor unit buttons to owned", () => {
  globalThis.document = new FakeDocument();
  const storage = storageAdapter();
  writeUnlockProgress(storage, { valorBalance: 999 });

  openShop(storage);

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
  assert.equal(ownedButtons.length, 2);
  assert.ok(ownedButtons.every((node) => node.textContent === "Owned"));
  assert.ok(ownedButtons.every((node) => node.disabled));
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
