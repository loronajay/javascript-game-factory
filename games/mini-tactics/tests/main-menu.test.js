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

test("main menu exposes tutorials and a tutorial completion route", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /data-action="startTutorial"[^>]*>\s*Tutorials\s*<\/button>/);
  assert.match(html, /data-screen="tutorialComplete"/);
  assert.match(html, /data-action="nextTutorial"[^>]*disabled/);
});
