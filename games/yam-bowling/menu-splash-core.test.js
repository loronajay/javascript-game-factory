const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  DEFAULT_MENU_SPLASH_SLUG,
  MENU_SPLASH_STORAGE_KEY,
  MENU_SPLASHES,
  getMenuSplash,
  loadMenuSplashSlug,
  saveMenuSplashSlug,
} = require("./menu-splash-core");

const expectedSlugs = [
  "reina-sato",
  "cassy-cruz",
  "carmen-blaze",
  "amara-reed",
  "aaliyah-storm",
  "lumi-vega",
  "claire-rowan",
  "willa-grant",
];

test("menu splashes use canon character slugs and predictable asset paths", () => {
  assert.deepEqual(MENU_SPLASHES.map((splash) => splash.slug), expectedSlugs);
  for (const splash of MENU_SPLASHES) {
    assert.equal(splash.src, `assets/menu-splashes/${splash.slug}.png`);
    assert.equal(fs.existsSync(path.join(__dirname, splash.src)), true, `${splash.name} should have menu art`);
    assert.ok(splash.name.length > 0);
    assert.match(splash.alt, new RegExp(splash.name, "i"));
  }
});

test("unknown splash preferences fall back to the default", () => {
  assert.equal(DEFAULT_MENU_SPLASH_SLUG, "reina-sato");
  assert.equal(getMenuSplash("missing-character").slug, DEFAULT_MENU_SPLASH_SLUG);
  assert.equal(loadMenuSplashSlug({ getItem: () => "missing-character" }), DEFAULT_MENU_SPLASH_SLUG);
  assert.equal(loadMenuSplashSlug({ getItem: () => null }), DEFAULT_MENU_SPLASH_SLUG);
});

test("valid splash preferences are loaded and saved", () => {
  let savedKey = "";
  let savedValue = "";
  const storage = {
    getItem(key) {
      assert.equal(key, MENU_SPLASH_STORAGE_KEY);
      return "lumi-vega";
    },
    setItem(key, value) {
      savedKey = key;
      savedValue = value;
    },
  };

  assert.equal(loadMenuSplashSlug(storage), "lumi-vega");
  assert.equal(saveMenuSplashSlug("claire-rowan", storage), "claire-rowan");
  assert.equal(savedKey, MENU_SPLASH_STORAGE_KEY);
  assert.equal(savedValue, "claire-rowan");
});

test("storage failures never prevent the title screen from loading", () => {
  const blockedStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };

  assert.equal(loadMenuSplashSlug(blockedStorage), DEFAULT_MENU_SPLASH_SLUG);
  assert.equal(saveMenuSplashSlug("cassy-cruz", blockedStorage), "cassy-cruz");
  assert.equal(saveMenuSplashSlug("not-real", blockedStorage), DEFAULT_MENU_SPLASH_SLUG);
});
