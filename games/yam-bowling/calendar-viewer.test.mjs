import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  CALENDAR_PAGES,
  MONTH_PAGES,
  pageById,
  pageImages,
  pageIndexById,
  preloadTargets,
} from "./calendar/calendar-manifest.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/* --- the manifest ---------------------------------------------------------------------- */

test("the calendar runs cover, twelve months in order, back cover", () => {
  assert.deepEqual(
    CALENDAR_PAGES.map((entry) => entry.id),
    ["cover", ...MONTHS, "back-cover"],
  );
  assert.equal(MONTH_PAGES.length, 12);
});

test("every month pairs its own artwork with its own grid", () => {
  // The one mismatch this whole feature cannot ship with: February's art over March's grid.
  for (const [index, id] of MONTHS.entries()) {
    const entry = pageById(id);
    assert.equal(entry.kind, "month");
    assert.equal(entry.monthNumber, index + 1);
    assert.match(entry.artwork, new RegExp(`/${id}-art\\.webp$`));
    assert.match(entry.grid, new RegExp(`/${id}-grid\\.webp$`));
  }
});

test("every month names a distinct featured bowler", () => {
  const slugs = MONTH_PAGES.map((entry) => entry.bowlerSlug);
  assert.equal(new Set(slugs).size, 12);
  for (const entry of MONTH_PAGES) {
    assert.ok(entry.bowlerName.length > 0, `${entry.id} has no bowler name`);
    assert.match(entry.bowlerSlug, /^[a-z]+(-[a-z]+)*$/);
  }
});

test("the featured bowlers are all on the canon roster", () => {
  // The calendar sells the cabinet's characters; a name here that no bowler answers to
  // would be a printed product referring to somebody who does not exist.
  const animationCore = readFileSync(join(HERE, "animation-core.js"), "utf8");
  for (const entry of MONTH_PAGES) {
    assert.ok(
      animationCore.includes(`"${entry.bowlerName}", "${entry.bowlerSlug}"`),
      `${entry.bowlerName} (${entry.bowlerSlug}) is not in CANON_ROSTER`,
    );
  }
});

test("covers are single sheets and months are two", () => {
  assert.deepEqual(pageImages(pageById("cover")), [pageById("cover").image]);
  assert.deepEqual(pageImages(pageById("back-cover")), [pageById("back-cover").image]);
  const june = pageById("june");
  assert.deepEqual(pageImages(june), [june.artwork, june.grid]);
});

test("every image the manifest names exists on disk as WebP", () => {
  const paths = CALENDAR_PAGES.flatMap((entry) => [...pageImages(entry), entry.thumb]);
  assert.equal(paths.length, 14 * 2 + 12); // 14 thumbs + 14 covers/arts + 12 grids
  for (const relative of paths) {
    assert.match(relative, /\.webp$/, `${relative} is not WebP`);
    const onDisk = join(HERE, "calendar", relative);
    assert.ok(existsSync(onDisk), `missing asset: ${relative}`);
  }
});

test("no calendar art is a placeholder or generated stand-in", () => {
  // Acceptance criterion: the viewer ships the approved artwork only.
  for (const entry of CALENDAR_PAGES) {
    for (const src of [...pageImages(entry), entry.thumb]) {
      assert.doesNotMatch(src, /placeholder|sample|draft|temp|mock/i, `${src} looks provisional`);
    }
  }
});

test("preloading covers the current page and its neighbours, and nothing else", () => {
  // Adjacent only: the full set is several megabytes, and eagerly loading it would cost
  // more than it saves on a page most visitors scroll past.
  const atJanuary = preloadTargets(pageIndexById("january"));
  assert.ok(atJanuary.includes(pageById("cover").image));
  assert.ok(atJanuary.includes(pageById("january").artwork));
  assert.ok(atJanuary.includes(pageById("february").grid));
  assert.ok(!atJanuary.includes(pageById("march").artwork));

  // The ends do not run off the array.
  assert.equal(preloadTargets(0).length, 3);
  assert.equal(preloadTargets(CALENDAR_PAGES.length - 1).length, 3);
});

/* --- the viewer ------------------------------------------------------------------------ */

// A DOM small enough to drive the viewer headlessly. It covers what the viewer actually
// touches: element creation, class lists, dataset, listeners and innerHTML.
function createStubDom() {
  const listeners = new Map();
  let nextId = 0;

  function makeNode(tag = "div") {
    const node = {
      tagName: tag.toUpperCase(),
      children: [],
      dataset: {},
      style: {},
      _html: "",
      _class: new Set(),
      _attrs: {},
      disabled: false,
      textContent: "",
      title: "",
      type: "",
      get innerHTML() { return this._html; },
      set innerHTML(value) { this._html = String(value); this.children = []; },
      get className() { return [...this._class].join(" "); },
      set className(value) {
        this._class = new Set(String(value).split(/\s+/).filter(Boolean));
      },
      classList: {
        add: (...names) => names.forEach((name) => node._class.add(name)),
        remove: (...names) => names.forEach((name) => node._class.delete(name)),
        toggle: (name, force) => {
          const on = force === undefined ? !node._class.has(name) : force;
          if (on) node._class.add(name); else node._class.delete(name);
          return on;
        },
        contains: (name) => node._class.has(name),
      },
      setAttribute(name, value) { this._attrs[name] = String(value); },
      getAttribute(name) { return this._attrs[name] ?? null; },
      append(...nodes) { this.children.push(...nodes); },
      addEventListener(type, handler) {
        const key = `${node._id}:${type}`;
        listeners.set(key, [...(listeners.get(key) || []), handler]);
      },
      removeEventListener(type, handler) {
        const key = `${node._id}:${type}`;
        listeners.set(key, (listeners.get(key) || []).filter((fn) => fn !== handler));
      },
      querySelector: (selector) => registry.find(selector) || null,
      querySelectorAll: (selector) => registry.findAll(selector),
      focus() {},
    };
    node._id = `n${nextId += 1}`;
    return node;
  }

  // The viewer builds its shell with one innerHTML assignment, so selectors resolve against
  // a table of nodes we hand back rather than a parsed tree.
  const nodes = {};
  const registry = {
    find(selector) { return nodes[selector]?.[0] || null; },
    findAll(selector) { return nodes[selector] || []; },
  };

  for (const selector of [
    ".cal-object", ".cal-stack", ".cal-flip", ".cal-title", ".cal-sub", ".cal-rail",
  ]) {
    nodes[selector] = [makeNode()];
  }
  nodes[".cal-step"] = [makeNode("button"), makeNode("button")];
  nodes[".cal-step"][0].dataset.step = "-1";
  nodes[".cal-step"][1].dataset.step = "1";
  nodes[".cal-chip"] = [];

  const document = {
    createElement: (tag) => makeNode(tag),
  };

  function fire(node, type, event = {}) {
    (listeners.get(`${node._id}:${type}`) || []).forEach((handler) => handler(event));
  }

  return { document, nodes, registry, makeNode, fire };
}

async function mountViewer({ reducedMotion = false } = {}) {
  const dom = createStubDom();
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = dom.document;
  globalThis.window = { setTimeout: (fn) => { fn(); return 0; } };
  globalThis.Image = class { set src(_value) {} };

  const mount = dom.makeNode();
  // The rail is appended as real chip nodes; expose them the way the viewer expects.
  const railAppend = dom.nodes[".cal-rail"][0].append.bind(dom.nodes[".cal-rail"][0]);
  dom.nodes[".cal-rail"][0].append = (...chips) => {
    railAppend(...chips);
    dom.nodes[".cal-chip"] = chips;
  };

  const { createCalendarViewer } = await import("./calendar/calendar-viewer.mjs");
  const viewer = createCalendarViewer({ mount, reducedMotion, onChange: () => {} });

  const restore = () => {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  };
  return { dom, viewer, mount, restore };
}

test("the viewer opens on the closed cover", async () => {
  const { dom, viewer, restore } = await mountViewer();
  try {
    assert.equal(viewer.getState().page.id, "cover");
    // Closed: no month geometry, so the object is not marked open.
    assert.ok(!dom.nodes[".cal-object"][0].classList.contains("is-open"));
    assert.equal(dom.nodes[".cal-title"][0].textContent, "Front cover");
    // Previous is unavailable at the first page.
    assert.equal(dom.nodes[".cal-step"][0].disabled, true);
    assert.equal(dom.nodes[".cal-step"][1].disabled, false);
  } finally { restore(); }
});

test("opening the cover reveals January artwork above January's grid", async () => {
  const { dom, viewer, restore } = await mountViewer();
  try {
    viewer.next();
    const state = viewer.getState();
    assert.equal(state.page.id, "january");
    assert.ok(dom.nodes[".cal-object"][0].classList.contains("is-open"));

    const html = dom.nodes[".cal-stack"][0].innerHTML;
    // Order matters: the artwork half is painted before the grid half, which is what puts
    // it above the binding in the hanging calendar.
    const artAt = html.indexOf("january-art.webp");
    const gridAt = html.indexOf("january-grid.webp");
    assert.ok(artAt >= 0 && gridAt >= 0, "both January images render");
    assert.ok(artAt < gridAt, "artwork renders above the grid");
    assert.ok(html.includes("cal-binding"), "the binding renders between the two halves");
    assert.ok(html.indexOf("cal-half-art") < html.indexOf("cal-binding"));
    assert.ok(html.indexOf("cal-binding") < html.indexOf("cal-half-grid"));
  } finally { restore(); }
});

test("every month in sequence shows its own pairing", async () => {
  const { dom, viewer, restore } = await mountViewer();
  try {
    for (const id of MONTHS) {
      viewer.next();
      assert.equal(viewer.getState().page.id, id);
      const html = dom.nodes[".cal-stack"][0].innerHTML;
      assert.ok(html.includes(`${id}-art.webp`), `${id} artwork`);
      assert.ok(html.includes(`${id}-grid.webp`), `${id} grid`);
      // and nobody else's
      for (const other of MONTHS.filter((month) => month !== id)) {
        assert.ok(!html.includes(`${other}-art.webp`), `${id} must not show ${other} art`);
        assert.ok(!html.includes(`${other}-grid.webp`), `${id} must not show ${other} grid`);
      }
    }
    assert.equal(viewer.getState().page.id, "december");
  } finally { restore(); }
});

test("navigation stops at both ends instead of wrapping", async () => {
  const { dom, viewer, restore } = await mountViewer();
  try {
    assert.equal(viewer.prev(), false, "cannot go back from the cover");
    assert.equal(viewer.getState().index, 0);

    viewer.goTo(CALENDAR_PAGES.length - 1);
    assert.equal(viewer.getState().page.id, "back-cover");
    assert.equal(viewer.next(), false, "cannot go past the back cover");
    assert.equal(dom.nodes[".cal-step"][1].disabled, true);
  } finally { restore(); }
});

test("a month can be selected directly, forwards or backwards", async () => {
  const { viewer, restore } = await mountViewer();
  try {
    viewer.goTo(pageIndexById("october"));
    assert.equal(viewer.getState().page.id, "october");
    viewer.goTo(pageIndexById("march"));
    assert.equal(viewer.getState().page.id, "march");
    // Out-of-range requests clamp rather than throw.
    viewer.goTo(999);
    assert.equal(viewer.getState().page.id, "back-cover");
    viewer.goTo(-5);
    assert.equal(viewer.getState().page.id, "cover");
  } finally { restore(); }
});

test("keyboard navigation moves, and Home/End jump to the covers", async () => {
  const { dom, viewer, restore } = await mountViewer();
  try {
    const object = dom.nodes[".cal-object"][0];
    const press = (key) => dom.fire(object, "keydown", { key, preventDefault() {} });

    press("ArrowRight");
    assert.equal(viewer.getState().page.id, "january");
    press("ArrowDown");
    assert.equal(viewer.getState().page.id, "february");
    press("ArrowLeft");
    assert.equal(viewer.getState().page.id, "january");
    press("End");
    assert.equal(viewer.getState().page.id, "back-cover");
    press("Home");
    assert.equal(viewer.getState().page.id, "cover");
    // An unrelated key is ignored.
    press("a");
    assert.equal(viewer.getState().page.id, "cover");
  } finally { restore(); }
});

test("touch swipe pages, and a short drag does not", async () => {
  const { dom, viewer, restore } = await mountViewer();
  try {
    const object = dom.nodes[".cal-object"][0];
    const swipe = (dx, dy) => {
      dom.fire(object, "touchstart", { changedTouches: [{ clientX: 200, clientY: 200 }] });
      dom.fire(object, "touchend", { changedTouches: [{ clientX: 200 + dx, clientY: 200 + dy }] });
    };

    swipe(-120, 0);
    assert.equal(viewer.getState().page.id, "january");
    swipe(0, -120);
    assert.equal(viewer.getState().page.id, "february");
    swipe(120, 0);
    assert.equal(viewer.getState().page.id, "january");
    // Below the threshold: a tap-like drag must not page.
    swipe(-12, 4);
    assert.equal(viewer.getState().page.id, "january");
  } finally { restore(); }
});

test("visible buttons work, so navigation never requires a swipe", async () => {
  const { dom, viewer, restore } = await mountViewer();
  try {
    dom.fire(dom.nodes[".cal-step"][1], "click", {});
    assert.equal(viewer.getState().page.id, "january");
    dom.fire(dom.nodes[".cal-step"][0], "click", {});
    assert.equal(viewer.getState().page.id, "cover");

    // One chip per page, each labelled.
    assert.equal(dom.nodes[".cal-chip"].length, CALENDAR_PAGES.length);
    dom.fire(dom.nodes[".cal-chip"][7], "click", {});
    assert.equal(viewer.getState().page.id, CALENDAR_PAGES[7].id);
  } finally { restore(); }
});

test("reduced motion navigates without running the page-turn animation", async () => {
  const { dom, viewer, restore } = await mountViewer({ reducedMotion: true });
  try {
    viewer.goTo(pageIndexById("may"));
    assert.equal(viewer.getState().page.id, "may");
    // The content is correct and the flip layer was never armed.
    assert.ok(dom.nodes[".cal-stack"][0].innerHTML.includes("may-art.webp"));
    assert.equal(dom.nodes[".cal-flip"][0].innerHTML, "");
    assert.ok(!dom.nodes[".cal-flip"][0].classList.contains("is-turning"));
  } finally { restore(); }
});

test("with motion allowed the turn is armed with the outgoing sheet and its hinge", async () => {
  const { dom, viewer, restore } = await mountViewer({ reducedMotion: false });
  try {
    viewer.goTo(pageIndexById("june"));
    viewer.goTo(pageIndexById("july"));
    // window.setTimeout is synchronous in the stub, so the flip has already been cleaned up;
    // what matters is that the hinge was tagged from the *outgoing* page's geometry.
    assert.equal(dom.nodes[".cal-flip"][0].dataset.kind, "month");
  } finally { restore(); }
});
