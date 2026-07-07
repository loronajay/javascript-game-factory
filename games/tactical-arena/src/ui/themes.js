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
  "--menu-bg-image",
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
      "--menu-bg-image": "url(./assets/theme-bgs/war-table.png)",
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
      "--menu-bg-image": "url(./assets/theme-bgs/emberfall.png)",
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
      "--menu-bg-image": "url(./assets/theme-bgs/verdant.png)",
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
  }),
  Object.freeze({
    id: "frostguard",
    label: "Frostguard",
    tokens: Object.freeze({
      "--sheen": "190,235,255",
      "--brass": "#6bb9d6", "--brass-hi": "#c9f2ff", "--brass-lo": "#24485a", "--gold": "#9fd8ef",
      "--text": "#edf8ff", "--muted": "#7d9cad", "--parchment-edge": "#3d7088",
      "--console-edge-soft": "rgba(112,190,220,.34)",
      "--surface-hi": "#132838", "--surface-lo": "#081621",
      "--btn-hi": "#173246", "--btn-lo": "#081621",
      "--console-hi": "#142b3d", "--console-lo": "#07141f",
      "--parch-hi": "#18344a", "--parch-lo": "#0c1b28",
      "--pill-text": "#cfe7f3", "--chip-base": "rgba(8,22,34,.68)",
      "--body-bg": "radial-gradient(circle at 50% 20%, rgba(80,170,220,.24), transparent 46%), radial-gradient(circle at 50% 116%, rgba(4,18,32,.68), transparent 60%), repeating-linear-gradient(92deg, rgba(255,255,255,.035) 0 3px, transparent 3px 9px), linear-gradient(180deg, #0c1a27, #040b12)",
      "--menu-bg-image": "url(./assets/theme-bgs/frostguard.png)",
      "--tile-light": "#78a0b2", "--tile-dark": "#3c5668", "--tile-stroke": "rgba(5,20,32,.68)", "--tile-hover": "#94bed0",
      "--tile-side-a": "#1a3546", "--tile-side-b": "#0c1e2b",
      "--board-aura": "#9be7ff", "--board-aura-op": ".26",
      "--dais-stone-1": "#54768a", "--dais-stone-2": "#2e485b", "--dais-stone-3": "#162838",
      "--dais-side-l-1": "#1d3240", "--dais-side-l-2": "#081722", "--dais-side-r-1": "#122332", "--dais-side-r-2": "#050d15",
      "--dais-aura-1": "#b6f4ff", "--dais-aura-2": "#70c8e8",
      "--bk-sky": "radial-gradient(90% 46% at 50% 56%, rgba(110,205,245,.42) 0%, rgba(60,130,180,.18) 40%, transparent 72%), radial-gradient(130% 96% at 50% 4%, #1a425d 0%, #112a3e 40%, #071622 70%, #03080f 100%), linear-gradient(180deg, #0b1b2b 0%, #071321 58%, #03080f 100%)",
      "--bk-aurora": "radial-gradient(60% 40% at 30% 30%, rgba(130,245,255,.26), transparent 70%), radial-gradient(50% 38% at 72% 26%, rgba(120,170,245,.22), transparent 72%)",
      "--bk-wall": "#0b1a27", "--bk-tower": "#102233",
      "--bk-horizon": "radial-gradient(72% 100% at 50% 100%, rgba(150,235,255,.38), rgba(80,160,210,.14) 50%, transparent 78%)",
      "--bk-glow": "rgba(150,235,255,.32)",
      "--bk-window": "#d9fbff",
      "--bk-rays": "repeating-linear-gradient(99deg, rgba(185,245,255,.07) 0 22px, transparent 22px 92px)",
      "--bk-fog": "radial-gradient(120% 80% at 50% 100%, rgba(150,210,230,.22), rgba(80,140,180,.09) 45%, transparent 72%)",
      "--moon": "radial-gradient(circle at 40% 36%, #ffffff, #d8f6ff 58%, #9bd0e8 100%)",
      "--moon-glow": "0 0 55px 16px rgba(190,245,255,.32), 0 0 130px 55px rgba(140,220,255,.14)",
      "--vignette": "rgba(1,7,13,.54)"
    })
  }),
  Object.freeze({
    id: "sunspire",
    label: "Sunspire",
    tokens: Object.freeze({
      "--sheen": "255,226,150",
      "--brass": "#d2a23f", "--brass-hi": "#ffe29a", "--brass-lo": "#65471a", "--gold": "#f0c76a",
      "--text": "#fff1d2", "--muted": "#aa8e58", "--parchment-edge": "#866632",
      "--console-edge-soft": "rgba(220,165,70,.34)",
      "--surface-hi": "#1c2c28", "--surface-lo": "#0d1715",
      "--btn-hi": "#263824", "--btn-lo": "#11180c",
      "--console-hi": "#1b302a", "--console-lo": "#0b1714",
      "--parch-hi": "#2b321f", "--parch-lo": "#15170b",
      "--pill-text": "#e8d8b0", "--chip-base": "rgba(26,24,12,.66)",
      "--body-bg": "radial-gradient(circle at 50% 18%, rgba(210,150,40,.24), transparent 46%), radial-gradient(circle at 50% 116%, rgba(10,36,30,.62), transparent 62%), repeating-linear-gradient(92deg, rgba(255,220,120,.035) 0 4px, transparent 4px 10px), linear-gradient(180deg, #18221a, #070c09)",
      "--menu-bg-image": "url(./assets/theme-bgs/sunspire.png)",
      "--tile-light": "#9b9160", "--tile-dark": "#5a633d", "--tile-stroke": "rgba(24,20,6,.62)", "--tile-hover": "#b8ac70",
      "--tile-side-a": "#31351e", "--tile-side-b": "#1b1d0e",
      "--board-aura": "#ffd166", "--board-aura-op": ".27",
      "--dais-stone-1": "#857640", "--dais-stone-2": "#514522", "--dais-stone-3": "#2b2512",
      "--dais-side-l-1": "#333016", "--dais-side-l-2": "#151206", "--dais-side-r-1": "#25220f", "--dais-side-r-2": "#0d0a04",
      "--dais-aura-1": "#ffd978", "--dais-aura-2": "#d89a38",
      "--bk-sky": "radial-gradient(90% 46% at 50% 58%, rgba(255,190,80,.24) 0%, rgba(190,130,45,.1) 40%, transparent 72%), radial-gradient(130% 96% at 50% 4%, #2f3322 0%, #1d261a 40%, #0f160f 70%, #060a07 100%), linear-gradient(180deg, #172418 0%, #0d1711 58%, #060907 100%)",
      "--bk-aurora": "radial-gradient(60% 40% at 28% 32%, rgba(255,210,95,.16), transparent 70%), radial-gradient(50% 38% at 72% 28%, rgba(80,210,170,.14), transparent 72%)",
      "--bk-wall": "#12170e", "--bk-tower": "#171d12",
      "--bk-horizon": "radial-gradient(72% 100% at 50% 100%, rgba(255,200,95,.34), rgba(190,130,50,.14) 50%, transparent 78%)",
      "--bk-glow": "rgba(255,200,100,.26)",
      "--bk-window": "#fff1a8",
      "--bk-rays": "repeating-linear-gradient(99deg, rgba(255,220,120,.08) 0 22px, transparent 22px 92px)",
      "--bk-fog": "radial-gradient(120% 80% at 50% 100%, rgba(210,175,90,.17), rgba(90,140,100,.08) 45%, transparent 72%)",
      "--moon": "radial-gradient(circle at 40% 36%, #fff8dc, #f2d078 58%, #c88c32 100%)",
      "--moon-glow": "0 0 55px 16px rgba(255,220,130,.32), 0 0 130px 55px rgba(255,190,90,.14)",
      "--vignette": "rgba(8,7,2,.5)"
    })
  }),
  Object.freeze({
    id: "stormforge",
    label: "Stormforge",
    tokens: Object.freeze({
      "--sheen": "150,205,255",
      "--brass": "#748fa8", "--brass-hi": "#b9d7ef", "--brass-lo": "#2d3d4d", "--gold": "#e0a45d",
      "--text": "#e6edf4", "--muted": "#7f8d98", "--parchment-edge": "#526678",
      "--console-edge-soft": "rgba(120,155,185,.34)",
      "--surface-hi": "#1a2630", "--surface-lo": "#0b1219",
      "--btn-hi": "#22313c", "--btn-lo": "#0d151d",
      "--console-hi": "#1d2a34", "--console-lo": "#0b1219",
      "--parch-hi": "#24313b", "--parch-lo": "#111920",
      "--pill-text": "#d0d8df", "--chip-base": "rgba(12,20,28,.68)",
      "--body-bg": "radial-gradient(circle at 50% 20%, rgba(90,130,170,.22), transparent 46%), radial-gradient(circle at 50% 116%, rgba(34,18,8,.52), transparent 62%), repeating-linear-gradient(92deg, rgba(255,255,255,.03) 0 3px, transparent 3px 9px), linear-gradient(180deg, #111a22, #05080b)",
      "--menu-bg-image": "url(./assets/theme-bgs/stormforge.png)",
      "--tile-light": "#6f7f89", "--tile-dark": "#3b454e", "--tile-stroke": "rgba(6,10,14,.68)", "--tile-hover": "#8c9aa4",
      "--tile-side-a": "#242c33", "--tile-side-b": "#12191f",
      "--board-aura": "#7cb8f0", "--board-aura-op": ".25",
      "--dais-stone-1": "#5b6872", "--dais-stone-2": "#38434d", "--dais-stone-3": "#1c252d",
      "--dais-side-l-1": "#252e36", "--dais-side-l-2": "#0e1419", "--dais-side-r-1": "#1a2229", "--dais-side-r-2": "#070b0f",
      "--dais-aura-1": "#8fc8ff", "--dais-aura-2": "#d28a48",
      "--bk-sky": "radial-gradient(90% 46% at 50% 56%, rgba(100,150,210,.34) 0%, rgba(55,85,125,.14) 40%, transparent 72%), radial-gradient(130% 96% at 50% 4%, #26394d 0%, #182532 40%, #0c131b 70%, #05080c 100%), linear-gradient(180deg, #111b27 0%, #0a121a 58%, #05080c 100%)",
      "--bk-aurora": "radial-gradient(60% 40% at 30% 30%, rgba(80,160,255,.18), transparent 70%), radial-gradient(50% 38% at 72% 26%, rgba(255,150,80,.12), transparent 72%)",
      "--bk-wall": "#0d141b", "--bk-tower": "#121b24",
      "--bk-horizon": "radial-gradient(72% 100% at 50% 100%, rgba(120,175,230,.28), rgba(210,120,60,.12) 50%, transparent 78%)",
      "--bk-glow": "rgba(120,175,230,.25)",
      "--bk-window": "#ffc06e",
      "--bk-rays": "repeating-linear-gradient(99deg, rgba(140,190,255,.06) 0 22px, transparent 22px 92px)",
      "--bk-fog": "radial-gradient(120% 80% at 50% 100%, rgba(120,140,160,.2), rgba(80,90,110,.08) 45%, transparent 72%)",
      "--moon": "radial-gradient(circle at 40% 36%, #f7fbff, #c8d8e8 58%, #8298aa 100%)",
      "--moon-glow": "0 0 55px 16px rgba(180,215,255,.28), 0 0 130px 55px rgba(210,130,70,.1)",
      "--vignette": "rgba(2,4,7,.54)"
    })
  }),
  Object.freeze({
    id: "void",
    label: "Void",
    tokens: Object.freeze({
      "--sheen": "190,130,255",
      "--brass": "#8d5bd6", "--brass-hi": "#d8b8ff", "--brass-lo": "#37204f", "--gold": "#b98cff",
      "--text": "#eee4ff", "--muted": "#8d76a6", "--parchment-edge": "#5c3a82",
      "--console-edge-soft": "rgba(145,90,220,.34)",
      "--surface-hi": "#1d1430", "--surface-lo": "#0a0712",
      "--btn-hi": "#271943", "--btn-lo": "#0d0818",
      "--console-hi": "#201533", "--console-lo": "#0a0712",
      "--parch-hi": "#261842", "--parch-lo": "#100a1d",
      "--pill-text": "#dccaf4", "--chip-base": "rgba(16,8,28,.7)",
      "--body-bg": "radial-gradient(circle at 50% 20%, rgba(105,55,170,.26), transparent 46%), radial-gradient(circle at 50% 116%, rgba(6,4,14,.72), transparent 62%), repeating-linear-gradient(92deg, rgba(210,180,255,.03) 0 3px, transparent 3px 9px), linear-gradient(180deg, #100a1d, #030207)",
      "--menu-bg-image": "url(./assets/theme-bgs/void.png)",
      "--tile-light": "#67537e", "--tile-dark": "#372c48", "--tile-stroke": "rgba(5,2,10,.7)", "--tile-hover": "#8369a0",
      "--tile-side-a": "#251a36", "--tile-side-b": "#120b1f",
      "--board-aura": "#b77cff", "--board-aura-op": ".26",
      "--dais-stone-1": "#55416c", "--dais-stone-2": "#332443", "--dais-stone-3": "#1a1027",
      "--dais-side-l-1": "#251a32", "--dais-side-l-2": "#0e0718", "--dais-side-r-1": "#1a1027", "--dais-side-r-2": "#07030c",
      "--dais-aura-1": "#c392ff", "--dais-aura-2": "#6f42c8",
      "--bk-sky": "radial-gradient(90% 46% at 50% 56%, rgba(130,70,220,.38) 0%, rgba(70,35,130,.16) 40%, transparent 72%), radial-gradient(130% 96% at 50% 4%, #23133d 0%, #160c2a 40%, #0a0614 70%, #030207 100%), linear-gradient(180deg, #10081f 0%, #090512 58%, #030207 100%)",
      "--bk-aurora": "radial-gradient(60% 40% at 30% 30%, rgba(170,90,255,.22), transparent 70%), radial-gradient(50% 38% at 72% 26%, rgba(80,180,255,.12), transparent 72%)",
      "--bk-wall": "#0b0614", "--bk-tower": "#12091f",
      "--bk-horizon": "radial-gradient(72% 100% at 50% 100%, rgba(150,90,255,.32), rgba(80,45,150,.12) 50%, transparent 78%)",
      "--bk-glow": "rgba(150,90,255,.26)",
      "--bk-window": "#dfb5ff",
      "--bk-rays": "repeating-linear-gradient(99deg, rgba(180,120,255,.06) 0 22px, transparent 22px 92px)",
      "--bk-fog": "radial-gradient(120% 80% at 50% 100%, rgba(110,80,160,.18), rgba(60,35,100,.08) 45%, transparent 72%)",
      "--moon": "radial-gradient(circle at 40% 36%, #fff6ff, #d5b8ff 58%, #8b5dd8 100%)",
      "--moon-glow": "0 0 55px 16px rgba(190,140,255,.32), 0 0 130px 55px rgba(120,70,220,.16)",
      "--vignette": "rgba(2,1,5,.58)"
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
