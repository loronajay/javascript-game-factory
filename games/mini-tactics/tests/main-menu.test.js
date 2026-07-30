import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("page shell exposes the arcade back link in the standard top-left chrome", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const layoutCss = readFileSync(new URL("../styles/layout.css", import.meta.url), "utf8");

  assert.match(
    html,
    /<a\s+[^>]*href="\.\.\/\.\.\/grid\.html"[^>]*class="back-link"[^>]*>\s*&larr;\s*Arcade\s*<\/a>/,
  );
  assert.match(layoutCss, /\.back-link\s*\{[\s\S]*?position:\s*fixed;/);
  assert.match(layoutCss, /\.back-link\s*\{[\s\S]*?top:\s*max\(14px, env\(safe-area-inset-top\)\);/);
  assert.match(layoutCss, /\.back-link\s*\{[\s\S]*?left:\s*max\(16px, env\(safe-area-inset-left\)\);/);
});

test("the tutorial completion route exists but is not advertised on the main menu", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  // The Tutorials entry point is deliberately absent from the main menu. The tutorial
  // subsystem (src/tutorials/basics.js) and its completion screen are still wired, and
  // mainMenuScreen.js binds `startTutorial` optionally (`?.addEventListener`) so the menu
  // works with or without the button. Do not re-add it to satisfy a test — if the button
  // should come back, that is a product decision, not a missing-markup bug.
  assert.doesNotMatch(html, /data-action="startTutorial"/);

  assert.match(html, /data-screen="tutorialComplete"/);
  assert.match(html, /data-action="nextTutorial"[^>]*disabled/);
});
