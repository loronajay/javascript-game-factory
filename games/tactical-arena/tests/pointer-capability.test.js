import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";

import { isCoarsePointer, matchesCoarseQuery } from "../src/ui/pointerCapability.js";

// The packaged Android WebView: no coarse-pointer media feature, but real touch.
const webView = (extraMatches = []) => ({
  matchMedia: (query) => ({ matches: extraMatches.includes(query) }),
  navigator: { maxTouchPoints: 5 },
});
const desktop = (extraMatches = []) => ({
  matchMedia: (query) => ({ matches: extraMatches.includes(query) }),
  navigator: { maxTouchPoints: 0 },
});
const phoneBrowser = (extraMatches = []) => ({
  matchMedia: (query) => ({ matches: ["(pointer: coarse)", ...extraMatches].includes(query) }),
  navigator: { maxTouchPoints: 5 },
});

test("touch detection survives a WebView that refuses to report pointer: coarse", () => {
  assert.equal(isCoarsePointer(webView()), true, "the packaged app is a touch device even without the media feature");
  assert.equal(isCoarsePointer(phoneBrowser()), true);
  assert.equal(isCoarsePointer(desktop()), false);
  assert.equal(isCoarsePointer(undefined), false);
});

test("coarse-scoped media queries keep the touch fallback and still apply their own conditions", () => {
  const short = "(orientation: landscape) and (max-height: 540px)";

  assert.equal(matchesCoarseQuery(short, webView([short])), true, "short landscape in the packaged app");
  assert.equal(matchesCoarseQuery(short, webView([])), false, "touch, but not a short landscape viewport");
  assert.equal(matchesCoarseQuery(short, desktop([short])), false, "a small desktop window is not a touch device");
  assert.equal(matchesCoarseQuery(null, webView([])), true, "no extra condition means plain touch detection");
});

// A regression guard for the whole class of bug: a bare matchMedia("(pointer: coarse)")
// in JS is dead code in the shipped app. The stylesheets are exempt — the mobile build
// strips the condition out of the CSS (mobile/tactical-arena/scripts/enable-touch-css.mjs),
// which is what makes the media feature safe to rely on there and not here.
test("no source module gates behaviour on pointer: coarse without the touch fallback", () => {
  const root = new URL("../src/", import.meta.url);
  const offenders = [];

  const walk = (dir, prefix = "") => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        walk(new URL(`${entry.name}/`, dir), `${name}/`);
        continue;
      }
      if (!entry.name.endsWith(".js") || entry.name === "pointerCapability.js") continue;
      const source = readFileSync(new URL(entry.name, dir), "utf8");
      if (!/pointer:\s*coarse/.test(source)) continue;
      // Fine either way: it delegates to the shared helper, or it does the same
      // matchMedia-OR-maxTouchPoints test itself.
      if (/pointerCapability\.js/.test(source) || /maxTouchPoints/.test(source)) continue;
      offenders.push(name);
    }
  };
  walk(root);

  assert.deepEqual(
    offenders,
    [],
    "these gates are silently off in the packaged Android app; use pointerCapability.js instead",
  );
});
