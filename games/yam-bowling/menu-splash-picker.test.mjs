import test from "node:test";
import assert from "node:assert/strict";

class StubElement {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.classList = { toggle() {} };
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  appendChild(child) {
    this.children.push(child);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  querySelectorAll(selector) {
    return selector === "[data-splash-slug]" ? this.children : [];
  }

  setAttribute(name, value) {
    if (name === "data-splash-slug") this.dataset.splashSlug = value;
  }

  click() {
    this.listeners.get("click")?.();
  }

  showModal() {}
  close() {}
}

test("opening menu art refreshes cards from live character ownership", async () => {
  const elements = new Map([
    "menu-splash-art",
    "menu-splash-button",
    "menu-splash-grid",
    "menu-splash-dialog",
    "menu-splash-close",
  ].map((id) => [id, new StubElement()]));
  globalThis.document = {
    getElementById: (id) => elements.get(id),
    createElement: () => new StubElement(),
  };

  const splashes = ["daisy-monroe", "hazel-ward"].map((slug) => ({
    slug,
    name: slug,
    src: `${slug}.webp`,
    thumbnailSrc: `${slug}-thumb.webp`,
    alt: slug,
  }));
  const menuSplash = {
    MENU_SPLASHES: splashes,
    getMenuSplash: (slug) => splashes.find((splash) => splash.slug === slug) || splashes[0],
  };
  let ownedSlugs = ["daisy-monroe"];
  const loadout = {
    getMenuSplashSlug: () => "daisy-monroe",
    setMenuSplashSlug: (slug) => slug,
    listOwned: () => ownedSlugs.map((slug) => ({ id: `menu-splash:${slug}` })),
  };
  const { createMenuSplashPicker } = await import("./ui/menu-splash-picker.mjs");
  const picker = createMenuSplashPicker({ menuSplash, loadout, audio: { play() {} } });

  picker.build();
  assert.equal(elements.get("menu-splash-grid").children.length, 1);

  ownedSlugs = [...ownedSlugs, "hazel-ward"];
  elements.get("menu-splash-button").click();
  assert.deepEqual(
    elements.get("menu-splash-grid").children.map((card) => card.dataset.splashSlug),
    ["daisy-monroe", "hazel-ward"],
  );
});
