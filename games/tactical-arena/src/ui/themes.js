// Theme registry — pure + tested (no DOM import), following the boardSprites/
// portraits metadata-module pattern. A theme is a named map of CSS custom
// properties layered over the :root defaults in style.css; the SVG gradient
// stops in index.html read the same tokens through inline style var()s.
//
// "Moonlit" is the stylesheet itself: its token map is EMPTY so the defaults in
// style.css stay the single source of truth (no value duplicated here that
// could drift). Every other palette must override the FULL token set
// (THEME_TOKEN_KEYS) so switching between two themes can never leak a stray
// color from the previous one; applyTheme also clears every key first, which
// is what will let a future user-customized theme be a partial override.
// Team identity (--p1/--p2/hp) is deliberately not themable.

export const THEME_STORAGE_KEY = "tactical-arena.theme";
export const DEFAULT_THEME_ID = "moonlit";

export const THEME_TOKEN_KEYS = Object.freeze([
  "--sheen",
  "--brass", "--brass-hi", "--brass-lo", "--gold",
  "--text", "--muted", "--parchment-edge",
  "--console-edge-soft",
  "--surface-hi", "--surface-lo",
  "--btn-hi", "--btn-lo",
  "--console-hi", "--console-lo",
  "--parch-hi", "--parch-lo",
  "--pill-text", "--chip-base",
  "--body-bg",
  "--tile-light", "--tile-dark", "--tile-stroke", "--tile-hover",
  "--tile-side-a", "--tile-side-b",
  "--board-aura", "--board-aura-op",
  "--dais-stone-1", "--dais-stone-2", "--dais-stone-3",
  "--dais-side-l-1", "--dais-side-l-2", "--dais-side-r-1", "--dais-side-r-2",
  "--dais-aura-1", "--dais-aura-2",
  "--bk-sky", "--bk-aurora", "--bk-wall", "--bk-tower",
  "--bk-horizon", "--bk-glow", "--bk-window", "--bk-rays", "--bk-fog",
  "--moon", "--moon-glow",
  "--vignette"
]);

export const THEMES = Object.freeze([
  Object.freeze({
    id: "moonlit",
    label: "Moonlit",
    tokens: Object.freeze({})
  }),
  Object.freeze({
    id: "war-table",
    label: "War Table",
    tokens: Object.freeze({
      "--sheen": "255,224,155",
      "--brass": "#b9923f", "--brass-hi": "#e9c97c", "--brass-lo": "#5e4a20", "--gold": "#d9b25e",
      "--text": "#f2e8d4", "--muted": "#9c8c70", "--parchment-edge": "#806840",
      "--console-edge-soft": "rgba(192,152,82,.32)",
      "--surface-hi": "#231b10", "--surface-lo": "#130d07",
      "--btn-hi": "#2c2211", "--btn-lo": "#150f08",
      "--console-hi": "#231b10", "--console-lo": "#120d07",
      "--parch-hi": "#2a2012", "--parch-lo": "#16100a",
      "--pill-text": "#ded2b6", "--chip-base": "rgba(28,21,12,.65)",
      "--body-bg": "radial-gradient(circle at 50% 22%, rgba(96,62,22,.25), transparent 46%), repeating-linear-gradient(92deg, rgba(0,0,0,.06) 0 4px, transparent 4px 9px), linear-gradient(180deg, #1a1309, #0d0805)",
      "--tile-light": "#8b7b60", "--tile-dark": "#5d4f3a", "--tile-stroke": "rgba(26,17,8,.6)", "--tile-hover": "#a29070",
      "--tile-side-a": "#3a2f20", "--tile-side-b": "#261e12",
      "--board-aura": "#f0b060", "--board-aura-op": ".26",
      "--dais-stone-1": "#7c5f38", "--dais-stone-2": "#4c3a22", "--dais-stone-3": "#2a2012",
      "--dais-side-l-1": "#33261a", "--dais-side-l-2": "#150e08", "--dais-side-r-1": "#241a10", "--dais-side-r-2": "#0c0806",
      "--dais-aura-1": "#f4b56a", "--dais-aura-2": "#c8863c",
      "--bk-sky": "radial-gradient(90% 46% at 50% 60%, rgba(240,160,70,.20) 0%, rgba(180,100,40,.08) 40%, transparent 72%), radial-gradient(130% 96% at 50% 4%, #241f38 0%, #171226 40%, #0d0a18 70%, #070510 100%), linear-gradient(180deg, #120e20 0%, #0c0916 58%, #070408 100%)",
      "--bk-aurora": "radial-gradient(60% 40% at 28% 32%, rgba(230,140,60,.12), transparent 70%), radial-gradient(50% 38% at 72% 28%, rgba(150,90,200,.10), transparent 72%)",
      "--bk-wall": "#150f1e", "--bk-tower": "#191223",
      "--bk-horizon": "radial-gradient(72% 100% at 50% 100%, rgba(240,170,90,.30), rgba(180,110,50,.12) 50%, transparent 78%)",
      "--bk-glow": "rgba(240,170,90,.18)",
      "--bk-window": "#ffcf7a",
      "--bk-rays": "repeating-linear-gradient(99deg, rgba(255,200,120,.05) 0 22px, transparent 22px 92px)",
      "--bk-fog": "radial-gradient(120% 80% at 50% 100%, rgba(200,150,90,.14), rgba(140,100,60,.06) 45%, transparent 72%)",
      "--moon": "radial-gradient(circle at 40% 36%, #fff7e6, #f2ddae 58%, #d8b673 100%)",
      "--moon-glow": "0 0 55px 16px rgba(244,212,148,.32), 0 0 130px 55px rgba(244,212,148,.14)",
      "--vignette": "rgba(12,6,2,.5)"
    })
  }),
  Object.freeze({
    id: "emberfall",
    label: "Emberfall",
    tokens: Object.freeze({
      "--sheen": "255,170,140",
      "--brass": "#b06a45", "--brass-hi": "#e89a70", "--brass-lo": "#56281a", "--gold": "#e08a58",
      "--text": "#f4e2d8", "--muted": "#9c7d70", "--parchment-edge": "#7e4a38",
      "--console-edge-soft": "rgba(190,110,80,.32)",
      "--surface-hi": "#241412", "--surface-lo": "#120a08",
      "--btn-hi": "#2e1a14", "--btn-lo": "#160c09",
      "--console-hi": "#241310", "--console-lo": "#120908",
      "--parch-hi": "#2a1712", "--parch-lo": "#160d0a",
      "--pill-text": "#dec4b6", "--chip-base": "rgba(30,16,12,.65)",
      "--body-bg": "radial-gradient(circle at 50% 22%, rgba(110,40,20,.25), transparent 46%), repeating-linear-gradient(92deg, rgba(0,0,0,.06) 0 4px, transparent 4px 9px), linear-gradient(180deg, #190e0c, #0c0605)",
      "--tile-light": "#8a6a5a", "--tile-dark": "#55392f", "--tile-stroke": "rgba(26,12,8,.6)", "--tile-hover": "#a58270",
      "--tile-side-a": "#38221a", "--tile-side-b": "#24140e",
      "--board-aura": "#ff8a50", "--board-aura-op": ".24",
      "--dais-stone-1": "#7a4a34", "--dais-stone-2": "#4a2c1e", "--dais-stone-3": "#281410",
      "--dais-side-l-1": "#32201a", "--dais-side-l-2": "#140b08", "--dais-side-r-1": "#22140e", "--dais-side-r-2": "#0c0605",
      "--dais-aura-1": "#ff9a5e", "--dais-aura-2": "#c2603a",
      "--bk-sky": "radial-gradient(90% 46% at 50% 60%, rgba(255,110,50,.22) 0%, rgba(180,60,30,.09) 40%, transparent 72%), radial-gradient(130% 96% at 50% 4%, #2c1420 0%, #1c0d14 40%, #100609 70%, #080304 100%), linear-gradient(180deg, #160a10 0%, #0e050a 58%, #070304 100%)",
      "--bk-aurora": "radial-gradient(60% 40% at 28% 32%, rgba(255,120,60,.14), transparent 70%), radial-gradient(50% 38% at 72% 28%, rgba(200,80,120,.10), transparent 72%)",
      "--bk-wall": "#1a0f14", "--bk-tower": "#1e1218",
      "--bk-horizon": "radial-gradient(72% 100% at 50% 100%, rgba(255,130,70,.30), rgba(190,80,40,.12) 50%, transparent 78%)",
      "--bk-glow": "rgba(255,130,70,.20)",
      "--bk-window": "#ffb066",
      "--bk-rays": "repeating-linear-gradient(99deg, rgba(255,150,90,.05) 0 22px, transparent 22px 92px)",
      "--bk-fog": "radial-gradient(120% 80% at 50% 100%, rgba(210,120,80,.14), rgba(150,80,50,.06) 45%, transparent 72%)",
      "--moon": "radial-gradient(circle at 40% 36%, #ffd9c4, #f0a880 58%, #c86a48 100%)",
      "--moon-glow": "0 0 55px 16px rgba(255,150,100,.30), 0 0 130px 55px rgba(255,150,100,.13)",
      "--vignette": "rgba(10,3,2,.52)"
    })
  }),
  Object.freeze({
    id: "verdant",
    label: "Verdant",
    tokens: Object.freeze({
      "--sheen": "170,240,200",
      "--brass": "#6a9a7e", "--brass-hi": "#a8d8bc", "--brass-lo": "#24422f", "--gold": "#84c0a0",
      "--text": "#dcefe4", "--muted": "#6e9080", "--parchment-edge": "#40705a",
      "--console-edge-soft": "rgba(100,170,130,.32)",
      "--surface-hi": "#122820", "--surface-lo": "#0a1712",
      "--btn-hi": "#16332a", "--btn-lo": "#0a1712",
      "--console-hi": "#142e24", "--console-lo": "#0a1712",
      "--parch-hi": "#16332a", "--parch-lo": "#0e1e18",
      "--pill-text": "#c2dccf", "--chip-base": "rgba(8,24,18,.65)",
      "--body-bg": "radial-gradient(circle at 50% 22%, rgba(20,80,50,.24), transparent 46%), radial-gradient(circle at 50% 118%, rgba(4,16,10,.6), transparent 60%), repeating-linear-gradient(92deg, rgba(0,0,0,.06) 0 4px, transparent 4px 9px), linear-gradient(180deg, #0c1a14, #060e0a)",
      "--tile-light": "#5e8272", "--tile-dark": "#2e463a", "--tile-stroke": "rgba(6,20,14,.65)", "--tile-hover": "#7ca690",
      "--tile-side-a": "#16302a", "--tile-side-b": "#0c1c16",
      "--board-aura": "#6ed8a8", "--board-aura-op": ".24",
      "--dais-stone-1": "#3e6452", "--dais-stone-2": "#25402f", "--dais-stone-3": "#14231a",
      "--dais-side-l-1": "#1a2f26", "--dais-side-l-2": "#0a1611", "--dais-side-r-1": "#101f1a", "--dais-side-r-2": "#060d0a",
      "--dais-aura-1": "#7ee8b4", "--dais-aura-2": "#4aa87c",
      "--bk-sky": "radial-gradient(90% 46% at 50% 56%, rgba(70,190,140,.4) 0%, rgba(40,130,95,.18) 40%, transparent 72%), radial-gradient(130% 96% at 50% 4%, #14342a 0%, #0e241d 40%, #081510 70%, #040b08 100%), linear-gradient(180deg, #0a2018 0%, #071510 58%, #04090a 100%)",
      "--bk-aurora": "radial-gradient(60% 40% at 30% 30%, rgba(90,220,170,.26), transparent 70%), radial-gradient(50% 38% at 72% 26%, rgba(120,200,235,.18), transparent 72%)",
      "--bk-wall": "#0c1c16", "--bk-tower": "#102420",
      "--bk-horizon": "radial-gradient(72% 100% at 50% 100%, rgba(100,220,160,.38), rgba(60,150,110,.14) 50%, transparent 78%)",
      "--bk-glow": "rgba(100,220,170,.32)",
      "--bk-window": "#ffe08a",
      "--bk-rays": "repeating-linear-gradient(99deg, rgba(140,240,190,.06) 0 22px, transparent 22px 92px)",
      "--bk-fog": "radial-gradient(120% 80% at 50% 100%, rgba(110,180,140,.2), rgba(70,130,100,.08) 45%, transparent 72%)",
      "--moon": "radial-gradient(circle at 40% 36%, #f4fff8, #cef0dc 58%, #96ccae 100%)",
      "--moon-glow": "0 0 55px 16px rgba(170,255,210,.28), 0 0 130px 55px rgba(170,255,210,.12)",
      "--vignette": "rgba(2,10,6,.52)"
    })
  })
]);

export function getTheme(id) {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

export function normalizeThemeId(id) {
  return THEMES.some((theme) => theme.id === id) ? id : DEFAULT_THEME_ID;
}

// Clears every themable token, then lays the chosen palette's overrides on the
// root element. Clearing first is what makes partial token maps (Moonlit's
// empty map, or a future user-authored theme) fall back to the stylesheet.
export function applyTheme(id, root = document.documentElement) {
  const theme = getTheme(normalizeThemeId(id));
  for (const key of THEME_TOKEN_KEYS) root.style.removeProperty(key);
  for (const [key, value] of Object.entries(theme.tokens)) root.style.setProperty(key, value);
  root.dataset.theme = theme.id;
  return theme;
}

// localStorage seams — injectable for tests, try/catch because storage access
// can throw (privacy modes). A bad/missing saved value falls back to default.
export function loadSavedThemeId(storage) {
  try {
    const store = storage ?? localStorage;
    return normalizeThemeId(store.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function saveThemeId(id, storage) {
  try {
    const store = storage ?? localStorage;
    store.setItem(THEME_STORAGE_KEY, normalizeThemeId(id));
  } catch {
    /* non-fatal — theme just won't persist */
  }
}
