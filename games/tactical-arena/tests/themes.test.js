// Theme registry guard — mirrors the boardSprites/portraits pattern: the theme
// data model is pure, so we can enforce its contract headlessly. The rules:
// every theme id is unique, the default theme leans on the stylesheet (empty
// token map, so style.css stays the single source of truth), and every OTHER
// palette overrides the FULL token set so switching themes never leaks a stray
// color from the previous palette.
import test from "node:test";
import assert from "node:assert/strict";
import {
  THEMES,
  THEME_TOKEN_KEYS,
  DEFAULT_THEME_ID,
  THEME_STORAGE_KEY,
  getTheme,
  normalizeThemeId,
  applyTheme,
  loadSavedThemeId,
  saveThemeId
} from "../src/ui/themes.js";

function fakeRoot() {
  const props = new Map();
  return {
    props,
    dataset: {},
    style: {
      setProperty: (key, value) => props.set(key, value),
      removeProperty: (key) => props.delete(key)
    }
  };
}

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value))
  };
}

test("registry shape: unique ids, labels, default first", () => {
  assert.ok(THEMES.length >= 2, "need a real palette list");
  const ids = THEMES.map((theme) => theme.id);
  assert.deepEqual(ids, [
    "moonlit",
    "war-table",
    "emberfall",
    "verdant",
    "frostguard",
    "sunspire",
    "stormforge",
    "void"
  ]);
  assert.equal(new Set(ids).size, ids.length, "theme ids must be unique");
  assert.equal(THEMES[0].id, DEFAULT_THEME_ID, "default theme leads the list");
  for (const theme of THEMES) {
    assert.ok(theme.label?.length > 0, `${theme.id} needs a label`);
    assert.equal(typeof theme.tokens, "object");
  }
});

test("default theme defers to the stylesheet (empty token map)", () => {
  assert.equal(Object.keys(getTheme(DEFAULT_THEME_ID).tokens).length, 0);
});

test("every non-default theme overrides the full token set", () => {
  const canonical = [...THEME_TOKEN_KEYS].sort();
  for (const theme of THEMES) {
    if (theme.id === DEFAULT_THEME_ID) continue;
    assert.deepEqual(
      Object.keys(theme.tokens).sort(),
      canonical,
      `${theme.id} must define exactly THEME_TOKEN_KEYS`
    );
  }
});

test("token values are non-empty strings and --sheen is an RGB triple", () => {
  for (const theme of THEMES) {
    for (const [key, value] of Object.entries(theme.tokens)) {
      assert.ok(typeof value === "string" && value.trim().length > 0, `${theme.id} ${key}`);
    }
    const sheen = theme.tokens["--sheen"];
    if (sheen !== undefined) {
      assert.match(sheen, /^\d{1,3},\d{1,3},\d{1,3}$/, `${theme.id} --sheen must be "r,g,b"`);
    }
  }
});

test("every non-default theme points at a matching menu background asset path", () => {
  for (const theme of THEMES) {
    if (theme.id === DEFAULT_THEME_ID) continue;
    assert.equal(
      theme.tokens["--menu-bg-image"],
      `url(./assets/theme-bgs/${theme.id}.png)`,
      `${theme.id} should use assets/theme-bgs/${theme.id}.png`
    );
  }
});

test("normalizeThemeId: known ids pass, junk falls back to default", () => {
  for (const theme of THEMES) assert.equal(normalizeThemeId(theme.id), theme.id);
  assert.equal(normalizeThemeId("nonsense"), DEFAULT_THEME_ID);
  assert.equal(normalizeThemeId(null), DEFAULT_THEME_ID);
  assert.equal(normalizeThemeId(undefined), DEFAULT_THEME_ID);
});

test("applyTheme sets the palette's tokens and tags the root", () => {
  const root = fakeRoot();
  const warm = THEMES.find((theme) => theme.id !== DEFAULT_THEME_ID);
  const applied = applyTheme(warm.id, root);
  assert.equal(applied.id, warm.id);
  assert.equal(root.dataset.theme, warm.id);
  assert.equal(root.props.size, Object.keys(warm.tokens).length);
  assert.equal(root.props.get("--tile-light"), warm.tokens["--tile-light"]);
  assert.equal(root.props.get("--menu-bg-image"), `url(./assets/theme-bgs/${warm.id}.png)`);
});

test("applyTheme back to default clears every override", () => {
  const root = fakeRoot();
  const warm = THEMES.find((theme) => theme.id !== DEFAULT_THEME_ID);
  applyTheme(warm.id, root);
  applyTheme(DEFAULT_THEME_ID, root);
  assert.equal(root.props.size, 0, "no residue from the previous palette");
  assert.equal(root.dataset.theme, DEFAULT_THEME_ID);
});

test("applyTheme with an unknown id applies the default", () => {
  const root = fakeRoot();
  const applied = applyTheme("nope", root);
  assert.equal(applied.id, DEFAULT_THEME_ID);
  assert.equal(root.dataset.theme, DEFAULT_THEME_ID);
});

test("save/load roundtrip through injected storage", () => {
  const storage = fakeStorage();
  const warm = THEMES.find((theme) => theme.id !== DEFAULT_THEME_ID);
  saveThemeId(warm.id, storage);
  assert.equal(storage.data.get(THEME_STORAGE_KEY), warm.id);
  assert.equal(loadSavedThemeId(storage), warm.id);
});

test("loading missing/corrupt/throwing storage falls back to default", () => {
  assert.equal(loadSavedThemeId(fakeStorage()), DEFAULT_THEME_ID);
  assert.equal(loadSavedThemeId(fakeStorage({ [THEME_STORAGE_KEY]: "garbage" })), DEFAULT_THEME_ID);
  const broken = { getItem: () => { throw new Error("denied"); } };
  assert.equal(loadSavedThemeId(broken), DEFAULT_THEME_ID);
  assert.doesNotThrow(() => saveThemeId("moonlit", { setItem: () => { throw new Error("denied"); } }));
});
