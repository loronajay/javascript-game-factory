import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, finish } from "./harness.js";

import {
  DEFAULT_THEME,
  THEMES,
  THEME_TOKENS,
  themeById,
  themeIds,
  themeSwatch,
} from "../scripts/assets/theme-catalog.js";
import { createPreferencesStore, DEFAULT_MOTION, MOTION_LEVELS } from "../scripts/store/preferences.js";
import { createMemoryStorage } from "../scripts/store/local-storage.js";

suite("themes — the customization layer, which is chrome and must stay that way");

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gameCss = fs.readFileSync(path.join(gameRoot, "styles", "game.css"), "utf8");
const menuCss = fs.readFileSync(path.join(gameRoot, "styles", "menu.css"), "utf8");
const customizeCss = fs.readFileSync(path.join(gameRoot, "styles", "customize.css"), "utf8");
const onlineCss = fs.readFileSync(path.join(gameRoot, "styles", "online.css"), "utf8");
const html = fs.readFileSync(path.join(gameRoot, "index.html"), "utf8");

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

test("every theme is uniquely identified and carries the copy the picker needs", () => {
  const ids = THEMES.map((theme) => theme.id);
  assertEqual(new Set(ids).size, ids.length, "an id is what a saved preference stores");
  for (const theme of THEMES) {
    assert(theme.label, `${theme.id} has no label`);
    assert(theme.blurb, `${theme.id} has no blurb`);
  }
});

test("every theme names every token, and no token the map does not know about", () => {
  // A MISSING TOKEN DOES NOT FAIL LOUDLY. The tokens are written onto one shared
  // element, so a theme that leaves one out simply inherits whatever the last
  // theme left there — and the cabinet comes out as two palettes at once, which
  // reads as a rendering bug rather than as a missing value.
  for (const theme of THEMES) {
    for (const token of THEME_TOKENS) {
      assert(theme.tokens[token], `${theme.id} does not name ${token}`);
    }
    for (const token of Object.keys(theme.tokens)) {
      assert(THEME_TOKENS.includes(token), `${theme.id} names ${token}, which no rule reads`);
    }
  }
});

test("the three triples really are triples, because a hairline is built out of them", () => {
  // `rgb(var(--ink-rgb) / 0.16)` only parses if the value is space-separated
  // channels. A `#hex` here would take out every derived hairline, dim label and
  // soft fill in the cabinet at once, and none of them would fall back — they
  // would simply fail to parse and vanish.
  for (const theme of THEMES) {
    for (const token of ["--ink-rgb", "--brass-rgb", "--shade-rgb"]) {
      const value = theme.tokens[token];
      assert(
        /^\d{1,3} \d{1,3} \d{1,3}$/.test(value),
        `${theme.id} ${token} is "${value}", which is not "R G B"`,
      );
    }
  }
});

test("the default theme exists, and an unknown id falls back to it rather than throwing", () => {
  assert(themeIds().includes(DEFAULT_THEME));
  assertEqual(themeById("chrome-plated").id, DEFAULT_THEME);
  assertEqual(themeById(undefined).id, DEFAULT_THEME);
});

test("a swatch is read off the theme's own tokens, so a picker cannot advertise a colour it will not wear", () => {
  for (const theme of THEMES) {
    const swatch = themeSwatch(theme.id);
    assertEqual(swatch.room, theme.tokens["--room"], `${theme.id} room swatch`);
    assertEqual(swatch.panel, theme.tokens["--panel-soft"], `${theme.id} panel swatch`);
    assertEqual(swatch.ember, theme.tokens["--ember"], `${theme.id} ember swatch`);
    assertEqual(swatch.brass, `rgb(${theme.tokens["--brass-rgb"]})`, `${theme.id} brass swatch`);
  }
});

// ---------------------------------------------------------------------------
// The stylesheet agrees with the catalog
// ---------------------------------------------------------------------------

test("the stylesheet's own defaults ARE the default theme, value for value", () => {
  // `:root` carries a full set of defaults so that a cabinet whose scripts have
  // not run yet — or have failed — is still coherent rather than unstyled. That
  // is only true while they stay in step with the catalog, and nothing about a
  // drifted default is visible in normal play: `ui/theme.js` writes over them
  // on the first frame every time.
  const declared = rootTokens(gameCss);
  const theme = themeById(DEFAULT_THEME);
  for (const token of THEME_TOKENS) {
    assert(token in declared, `styles/game.css :root does not declare ${token}`);
    assertEqual(
      normalize(declared[token]),
      normalize(theme.tokens[token]),
      `styles/game.css :root ${token} has drifted off the ${DEFAULT_THEME} theme`,
    );
  }
});

test("every derived token really is derived, so a theme moves the whole cabinet at once", () => {
  // These are the ones that make a theme fourteen values instead of a
  // stylesheet. If one of them is ever written as a literal it will keep working
  // — in exactly one theme — and quietly stop tracking the other seven.
  const declared = rootTokens(gameCss);
  const DERIVED = {
    "--ink": "--ink-rgb",
    "--ink-dim": "--ink-rgb",
    "--ink-faint": "--ink-rgb",
    "--panel-line": "--ink-rgb",
    "--line": "--ink-rgb",
    "--line-strong": "--ink-rgb",
    "--fill-faint": "--ink-rgb",
    "--fill": "--ink-rgb",
    "--fill-hover": "--ink-rgb",
    "--fill-strong": "--ink-rgb",
    "--brass": "--brass-rgb",
    "--brass-line": "--brass-rgb",
    "--brass-wash": "--brass-rgb",
    "--glow": "--brass-rgb",
    "--glass": "--shade-rgb",
    "--scrim": "--shade-rgb",
  };
  for (const [token, source] of Object.entries(DERIVED)) {
    assert(token in declared, `styles/game.css :root does not declare ${token}`);
    assert(
      declared[token].includes(`var(${source})`),
      `${token} is a literal — it will only ever be right in one theme`,
    );
  }
});

test("no rule outside the token map hardcodes a colour, bar the documented handful", () => {
  // THE GUARD THAT KEEPS THE THEME HONEST. A theme reaches everything only for
  // as long as nothing in the stylesheets writes its own colour, and a single
  // hardcoded panel is invisible in the theme it was authored in and glaring in
  // the other seven.
  //
  // The exceptions are the things a theme deliberately does not own, and each
  // one is argued where it is written:
  //   the fire stops   the magma ball's trail, which the HUD has to match
  //   the neon marks   the X, the O and HORSE's letters, painted by `render/`
  //   #fff             ink sitting ON an accent, not on a surface
  //   the index card   a piece of paper taped to a painted wall (menu.css)
  //   the mode lobbies  floor tic-tac-toe and HORSE keep their own cyan, for
  //                    the same reason the marks do — see the note in online.css
  const ALLOWED = new Set([
    "#fff0bd", "#ff6a12", "#6b4534",
    "#ff4fd8", "#28d8ff",
    "#fff",
    "#f4ead6", "#e6d8bd", "#3a2a20",
    "#53f6ff", "#d9efff", "#9bb8cc", "#101824",
  ]);
  const SHEETS = [
    ["game.css", gameCss],
    ["menu.css", menuCss],
    ["customize.css", customizeCss],
    ["online.css", onlineCss],
  ];
  for (const [name, css] of SHEETS) {
    const body = name === "game.css" ? css.slice(css.indexOf("}", css.indexOf(":root {"))) : css;
    for (const match of stripComments(body).matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      assert(ALLOWED.has(match[0].toLowerCase()), `styles/${name} hardcodes ${match[0]} instead of using a token`);
    }
  }
});

// ---------------------------------------------------------------------------
// A theme is chrome
// ---------------------------------------------------------------------------

test("the theme never reaches the court", () => {
  // The whole contract. If a renderer, the sim or an effect ever read a theme,
  // two runs in two cabinets would stop being the same run — and one board would
  // stop meaning one thing, exactly the reason rooms are cosmetic.
  for (const layer of ["sim", "effects", "render"]) {
    for (const name of fs.readdirSync(path.join(gameRoot, "scripts", layer))) {
      const code = stripComments(fs.readFileSync(path.join(gameRoot, "scripts", layer, name), "utf8"));
      assert(!code.includes("theme"), `scripts/${layer}/${name} reads a theme`);
    }
  }
});

test("neither the theme nor the motion level is part of a run", () => {
  const preferences = createPreferencesStore({ storage: createMemoryStorage() });
  preferences.setTheme("arcade");
  preferences.setMotion("calm");
  const snapshot = preferences.snapshot();
  assert(!("themeId" in snapshot), "a theme must not travel with a run");
  assert(!("motion" in snapshot), "a motion level must not travel with a run");
  assertEqual(preferences.themeId, "arcade", "the theme is still remembered, just not by the run");
  assertEqual(preferences.motion, "calm");
});

test("a stored theme that no longer names anything degrades to the default", () => {
  const storage = createMemoryStorage({
    "miniHoops.preferences.v1": JSON.stringify({ themeId: "retired-cabinet", motion: "strobe" }),
  });
  const preferences = createPreferencesStore({ storage });
  assertEqual(preferences.themeId, DEFAULT_THEME);
  assertEqual(preferences.motion, DEFAULT_MOTION);
  assert(MOTION_LEVELS.includes(preferences.motion));
});

// ---------------------------------------------------------------------------
// The markup the pickers are built into
// ---------------------------------------------------------------------------

test("both theme pickers have a container, and the compact one asks for the compact shape", () => {
  // `ui/theme.js` renders into every `[data-theme-picker]` there is, so a picker
  // that lost its container does not throw — it silently stops existing.
  assert(html.includes('data-theme-picker="full"'), "the Customize screen has no theme gallery");
  assert(html.includes('data-theme-picker="compact"'), "the setup screen has no cabinet strip");
  assert(html.includes('id="customizeScreen"'), "there is no Customize screen");
  assert(html.includes('data-intent="toggle-motion"'), "the motion switch is unreachable");
});

test("the calm setting has rules to apply, in both of the places stillness is decided", () => {
  // The manual switch and `prefers-reduced-motion` are two doors into the same
  // room, and the rule blocks are duplicated because a selector list cannot span
  // a media query and an attribute selector. Duplicated rules drift, so both
  // halves are checked here rather than only the one that was written last.
  assert(menuCss.includes("prefers-reduced-motion"), "the OS setting stops being honoured");
  for (const selector of [".marquee-drift", ".marquee-backdrop", ".marquee-bulbs"]) {
    assert(
      menuCss.includes(`:root[data-motion="calm"] ${selector}`),
      `${selector} keeps moving when the player has asked for calm`,
    );
  }
});

/** The `--name: value` pairs declared in the stylesheet's one `:root` block. */
function rootTokens(css) {
  const open = css.indexOf(":root {");
  const body = css.slice(open + ":root {".length, css.indexOf("}", open));
  const tokens = {};
  for (const line of stripComments(body).split(";")) {
    const at = line.indexOf(":");
    if (at < 0) continue;
    const name = line.slice(0, at).trim();
    if (name.startsWith("--")) tokens[name] = line.slice(at + 1).trim();
  }
  return tokens;
}

/** A CSS value and its JavaScript twin differ only in how they wrap. */
function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

finish();
