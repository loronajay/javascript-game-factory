(function exposeMenuSplashCore(root, factory) {
  const api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.YamMenuSplash = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMenuSplashCore(root) {
  "use strict";

  const DEFAULT_MENU_SPLASH_SLUG = "reina-sato";
  const MENU_SPLASH_STORAGE_KEY = "yam-bowling.menu-splash";
  const MENU_SPLASHES = Object.freeze([
    ["Reina Sato", "reina-sato"],
    ["Cassy Cruz", "cassy-cruz"],
    ["Carmen Blaze", "carmen-blaze"],
    ["Amara Reed", "amara-reed"],
    ["Aaliyah Storm", "aaliyah-storm"],
    ["Lumi Vega", "lumi-vega"],
    ["Claire Rowan", "claire-rowan"],
    ["Hazel Ward", "hazel-ward"],
  ].map(([name, slug]) => Object.freeze({
    name,
    slug,
    src: `assets/menu-splashes/${slug}.png`,
    alt: `${name} featured on the Yam Bowling title screen`,
  })));

  function getMenuSplash(slug) {
    return MENU_SPLASHES.find((splash) => splash.slug === slug)
      || MENU_SPLASHES.find((splash) => splash.slug === DEFAULT_MENU_SPLASH_SLUG);
  }

  function defaultStorage() {
    try {
      return root.localStorage;
    } catch (_error) {
      return null;
    }
  }

  function loadMenuSplashSlug(storage = defaultStorage()) {
    try {
      return getMenuSplash(storage?.getItem(MENU_SPLASH_STORAGE_KEY)).slug;
    } catch (_error) {
      return DEFAULT_MENU_SPLASH_SLUG;
    }
  }

  function saveMenuSplashSlug(slug, storage = defaultStorage()) {
    const normalizedSlug = getMenuSplash(slug).slug;
    try {
      storage?.setItem(MENU_SPLASH_STORAGE_KEY, normalizedSlug);
    } catch (_error) {
      // The choice still applies for this visit when storage is unavailable.
    }
    return normalizedSlug;
  }

  return {
    DEFAULT_MENU_SPLASH_SLUG,
    MENU_SPLASH_STORAGE_KEY,
    MENU_SPLASHES,
    getMenuSplash,
    loadMenuSplashSlug,
    saveMenuSplashSlug,
  };
});
