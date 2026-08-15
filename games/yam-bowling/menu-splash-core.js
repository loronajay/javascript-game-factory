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
    ["Daisy Monroe", "daisy-monroe"],
    ["Nia Brooks", "nia-brooks"],
    ["Tessa Quinn", "tessa-quinn"],
    ["Zuri Banks", "zuri-banks"],
    ["Amara Reed", "amara-reed"],
    ["Claire Rowan", "claire-rowan"],
    ["Lumi Vega", "lumi-vega"],
    ["Cassy Cruz", "cassy-cruz"],
    ["Fiona Vale", "fiona-vale"],
    ["Nyx Calder", "nyx-calder"],
    ["Skye Bennett", "skye-bennett"],
    ["Carmen Blaze", "carmen-blaze"],
    ["Piper Hart", "piper-hart"],
    ["Reina Sato", "reina-sato"],
    ["Imani Cole", "imani-cole"],
    ["Sabrina Wilde", "sabrina-wilde"],
    ["Aaliyah Storm", "aaliyah-storm"],
    ["Mina Park", "mina-park"],
    ["Scarlett Voss", "scarlett-voss"],
    ["Sage Holloway", "sage-holloway"],
    ["Hazel Ward", "hazel-ward"],
    ["Roxy Chen", "roxy-chen"],
    ["Naomi Okafor", "naomi-okafor"],
    ["Echo Sterling", "echo-sterling"],
    ["Kevya Desai", "kevya-desai"],
    ["Lillie Chen", "lillie-chen"],
    ["Marisol Cruz", "marisol-cruz"],
    ["Rei Nakamura", "rei-nakamura"],
    ["Simone Carter", "simone-carter"],
    ["Talia Dodson", "talia-dodson"],
  ].map(([name, slug]) => Object.freeze({
    name,
    slug,
    src: `assets/menu-splashes/${slug}.webp`,
    thumbnailSrc: `assets/menu-splashes/thumbs/${slug}.webp`,
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
