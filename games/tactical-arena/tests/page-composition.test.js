import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { composePage } from "../src/ui/pageComposer.js";

const rootFile = (path) => new URL(`../${path}`, import.meta.url);

test("index is a small shell that delegates page regions to HTML fragments", () => {
  const html = readFileSync(rootFile("index.html"), "utf8");
  const fragmentSources = [...html.matchAll(/data-fragment-src="([^"]+)"/g)]
    .map((match) => match[1]);

  assert.ok(html.split(/\r?\n/).length < 80, "index.html should remain a document shell");
  assert.deepEqual(fragmentSources, [
    "./html/global-paint-servers.html",
    "./html/app-chrome.html",
    "./html/menu-screens.html",
    "./html/campaign-screen.html",
    "./html/setup-screens.html",
    "./html/outcome-screens.html",
    "./html/match-screen.html",
    "./html/field-manual.html",
    "./html/settings-modal.html",
  ]);
  assert.match(html, /src="\.\/src\/bootstrap\.js"/);
  assert.doesNotMatch(html, /src="\.\/src\/main\.js"/);
});

test("page composition loads in parallel and mounts fragments in document order", async () => {
  const events = [];
  const slots = ["first.html", "second.html"].map((source) => ({
    dataset: { fragmentSrc: source },
    insertAdjacentHTML(position, markup) {
      events.push(["mount", source, position, markup]);
    },
    remove() {
      events.push(["remove", source]);
    },
  }));
  const pending = new Map();
  const fetchImpl = (url) => new Promise((resolve) => {
    pending.set(url.href, resolve);
  });
  const composing = composePage({
    root: { baseURI: "https://example.test/game/", querySelectorAll: () => slots },
    fetchImpl,
  });

  pending.get("https://example.test/game/second.html")({
    ok: true,
    text: async () => "<section>second</section>",
  });
  pending.get("https://example.test/game/first.html")({
    ok: true,
    text: async () => "<section>first</section>",
  });
  await composing;

  assert.deepEqual(events, [
    ["mount", "first.html", "beforebegin", "<section>first</section>"],
    ["remove", "first.html"],
    ["mount", "second.html", "beforebegin", "<section>second</section>"],
    ["remove", "second.html"],
  ]);
});

test("page composition reports the fragment that failed to load", async () => {
  const slot = {
    dataset: { fragmentSrc: "missing.html" },
    insertAdjacentHTML() {},
    remove() {},
  };

  await assert.rejects(
    composePage({
      root: { baseURI: "https://example.test/game/", querySelectorAll: () => [slot] },
      fetchImpl: async () => ({ ok: false, status: 404 }),
    }),
    /missing\.html.*404/,
  );
});
