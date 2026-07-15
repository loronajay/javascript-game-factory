import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  getViewportPosture,
  requestMobileFullscreen,
  shouldRequestFullscreen,
} from "../src/ui/mobileViewport.js";

test("compact touch portrait viewports require the landscape gate", () => {
  assert.deepEqual(
    getViewportPosture({ width: 390, height: 844, coarsePointer: true }),
    {
      orientation: "portrait",
      isCompactTouch: true,
      gateVisible: true,
    },
  );
});

test("compact touch landscape viewports are allowed to play", () => {
  assert.deepEqual(
    getViewportPosture({ width: 844, height: 390, coarsePointer: true }),
    {
      orientation: "landscape",
      isCompactTouch: true,
      gateVisible: false,
    },
  );
});

test("compact touch landscape viewports request fullscreen when possible", () => {
  assert.equal(
    shouldRequestFullscreen({
      width: 844,
      height: 390,
      coarsePointer: true,
      fullscreenElement: null,
    }),
    true,
  );
});

test("portrait phones do not request fullscreen behind the rotate gate", () => {
  assert.equal(
    shouldRequestFullscreen({
      width: 390,
      height: 844,
      coarsePointer: true,
      fullscreenElement: null,
    }),
    false,
  );
});

test("desktop and laptop viewports never show the mobile landscape gate", () => {
  assert.equal(
    getViewportPosture({ width: 1024, height: 1366, coarsePointer: false }).gateVisible,
    false,
  );
});

test("the document exposes the mobile playability shell", () => {
  const html = ["index.html", "html/app-chrome.html", "html/field-manual.html"]
    .map((path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8"))
    .join("\n");
  const responsiveCss = ["shell", "touch", "battle", "menus", "performance"]
    .map((name) => readFileSync(new URL(`../styles/responsive/${name}.css`, import.meta.url), "utf8"))
    .join("\n");
  const menusCss = ["shell", "features", "campaign", "polish"]
    .map((name) => readFileSync(new URL(`../styles/screens/${name}.css`, import.meta.url), "utf8"))
    .join("\n");
  const styleCss = ["board", "overlays", "effects", "scene"]
    .map((name) => readFileSync(new URL(`../styles/battle/${name}.css`, import.meta.url), "utf8"))
    .join("\n");

  assert.match(
    html,
    /maximum-scale=1, user-scalable=no/,
    "mobile viewport should prevent accidental double-tap zoom during play",
  );
  assert.match(
    html,
    /class="back-link"[^>]*href="\.\.\/\.\.\/grid\.html"|href="\.\.\/\.\.\/grid\.html"[^>]*class="back-link"/,
    "every screen needs a return-to-arcade link",
  );
  assert.match(html, /id="landscapeGate"/, "portrait phones need a rotate gate");
  assert.match(
    html,
    /class="ref-card manual-card"/,
    "the Field Manual shell should have its own fixed-size card class",
  );
  assert.match(
    styleCss,
    /\.manual-card\s*\{[^}]*height:\s*min\(640px,\s*88vh\)/,
    "the Field Manual card should hold a fixed height so Codex unit changes do not recenter the menu",
  );
  assert.match(
    styleCss,
    /#refBody\s*\{[^}]*display:\s*flex[\s\S]*?flex:\s*1[\s\S]*?min-height:\s*0/,
    "the dynamic Codex mount point must flex inside the fixed manual card instead of clipping overflow",
  );
  assert.match(
    styleCss,
    /\.codex-detail\s*\{[^}]*min-height:\s*0[\s\S]*?overflow-y:\s*auto/,
    "the Codex detail pane should be the vertical scroll container for long unit cards",
  );
  assert.match(
    responsiveCss,
    /\[data-landscape-gate="on"\]\s+\.landscape-gate/,
    "JS-updated viewport state should control the gate",
  );
  assert.match(
    responsiveCss,
    /grid-template-areas:\s*"top top"\s*"stage hud"/,
    "landscape phones should move commands beside the battlefield instead of crushing it vertically",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(orientation: landscape\) and \(max-height: 540px\)[\s\S]*?\.panel\.command-console\s*\{[\s\S]*?overflow-y:\s*auto[\s\S]*?\.actions\s*\{[\s\S]*?overflow-y:\s*auto[\s\S]*?-webkit-overflow-scrolling:\s*touch/,
    "short landscape command panels and long command lists should scroll instead of clipping lower rows",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(orientation: landscape\) and \(max-height: 540px\)[\s\S]*?\.topbar-forecast\s*\{[\s\S]*?\.forecast-toggle-copy\s*\{[\s\S]*?display:\s*none/,
    "short landscape forecast controls should move to a compact topbar switch instead of sitting in the command panel",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(orientation: landscape\) and \(max-height: 540px\)[\s\S]*?#message\s*\{[\s\S]*?pointer-events:\s*none[\s\S]*?top:\s*\.45rem/,
    "mobile ART instruction callouts must not block board targeting taps",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(max-width: 740px\),\s*\(pointer: coarse\) and \(max-height: 540px\)[\s\S]*?\.squad-pickers\s*\{[\s\S]*?grid-template-columns:\s*1fr/,
    "mobile setup should stack squad pickers instead of squeezing two squads into cramped columns",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(max-width: 560px\)[\s\S]*?\.roster-grid\s*\{[\s\S]*?display:\s*flex[\s\S]*?\.roster-class-units\s*\{[\s\S]*?display:\s*flex/,
    "narrow roster pickers should use horizontal class rails above the detail pane",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(orientation: landscape\) and \(max-height: 540px\)[\s\S]*?\.roster-grid,\s*\.roster-detail\s*\{[\s\S]*?position:\s*absolute[\s\S]*?inset:\s*0[\s\S]*?\.roster-grid\s*\{[\s\S]*?display:\s*grid[\s\S]*?\.roster-detail\s*\{[\s\S]*?display:\s*none[\s\S]*?\.roster-body\.is-viewing-detail \.roster-grid\s*\{[\s\S]*?display:\s*none[\s\S]*?\.roster-body\.is-viewing-detail \.roster-detail\s*\{[\s\S]*?display:\s*flex/,
    "short landscape roster pickers should use mutually exclusive full-body roster and detail screens",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(orientation: landscape\) and \(max-height: 540px\)[\s\S]*?\.roster-detail-split\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*?\.roster-detail-split \.unit-portrait\.is-hero\s*\{[\s\S]*?display:\s*none/,
    "short landscape roster detail should prioritize unit stats over the large portrait",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(orientation: landscape\) and \(max-height: 540px\)[\s\S]*?\.roster-detail \.stat-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)[\s\S]*?\.roster-detail \.skin-summary\s*\{[\s\S]*?display:\s*none/,
    "short landscape roster detail should spend vertical space on unit stats and kit text, not skin chrome",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(orientation: landscape\) and \(max-height: 540px\)[\s\S]*?\.roster-grid-head\s*\{\s*grid-column:\s*1 \/ -1;\s*display:\s*none;/,
    "short landscape roster grid should not show the Choose Pick toolbar over the unit grid",
  );
  const rosterPickerJs = readFileSync(new URL("../src/ui/rosterPicker.js", import.meta.url), "utf8");
  assert.match(
    rosterPickerJs,
    /detailsOpen\s*=\s*shouldUseSinglePaneRoster\(\)/,
    "short landscape roster taps should open unit details instead of repainting a grid toolbar",
  );
  assert.match(
    rosterPickerJs,
    /dataset\.roster\s*=\s*"browse"/,
    "short landscape details popup needs an explicit Back action",
  );
  assert.match(
    rosterPickerJs,
    /function shouldUseSinglePaneRoster\(\)[\s\S]*?matchMedia\("\(pointer: coarse\) and \(orientation: landscape\) and \(max-height: 540px\)"\)/,
    "single-pane roster behavior should be limited to the short landscape mobile layout",
  );
  assert.match(
    rosterPickerJs,
    /classList\.toggle\("is-viewing-detail",\s*detailsOpen\)/,
    "short landscape roster picker needs explicit browse/detail state so selected unit data remains the primary view",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(orientation: landscape\) and \(max-height: 540px\)[\s\S]*?\.campaign-map\s*\{[\s\S]*?min-height:\s*0/,
    "campaign mobile landscape must not keep a desktop-height map minimum that clips the mission panel",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(orientation: landscape\) and \(max-height: 540px\)[\s\S]*?\.settings-card\s*\{[\s\S]*?height:\s*calc\(var\(--app-height,\s*100vh\) - \.7rem\)[\s\S]*?\.settings-body\s*\{(?=[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\))[\s\S]*?overflow-y:\s*auto/,
    "settings should compact into two columns and scroll internally on mobile landscape",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(orientation: landscape\) and \(max-height: 540px\)[\s\S]*?\.skin-gallery-card\s*\{[\s\S]*?height:\s*calc\(var\(--app-height,\s*100vh\) - \.7rem\)[\s\S]*?\.skin-gallery-detail \.unit-portrait\.is-skin-detail\s*\{[\s\S]*?height:\s*clamp\(8rem,\s*48vh,\s*13rem\)/,
    "skin view should use the live viewport and smaller detail art in short landscape",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(orientation: landscape\) and \(max-height: 540px\)[\s\S]*?\.draft-formation-board\s*\{[\s\S]*?min-height:\s*0[\s\S]*?height:\s*clamp\(11rem,\s*54vh,\s*15rem\)[\s\S]*?\.draft-formation-card \.roster-foot\s*\{[\s\S]*?padding:\s*\.45rem \.7rem/,
    "formation editor should bound the board height and keep footer buttons reachable",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\)[\s\S]*?\.roster-card\s*\{[\s\S]*?var\(--app-height,\s*100vh\)/,
    "touch roster modals should size to the live viewport height instead of overflowing mobile browser chrome",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(orientation: landscape\) and \(max-height: 540px\)[\s\S]*?\.roster-head \.ref-head-title\s*\{[\s\S]*?margin-bottom:\s*0[\s\S]*?\.roster-head \.ref-close\s*\{[\s\S]*?min-height:\s*34px/,
    "short landscape roster headers should compact the inherited desktop title row and close button",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(orientation: landscape\) and \(max-height: 540px\)[\s\S]*?\.roster-body\s*\{[\s\S]*?flex:\s*1 1 0[\s\S]*?min-height:\s*0/,
    "short landscape roster bodies should take the remaining modal height instead of being squeezed by chrome",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(orientation: landscape\) and \(max-height: 540px\)[\s\S]*?\.roster-foot\s*\{[\s\S]*?min-height:\s*48px[\s\S]*?\.roster-foot \.menu-btn\s*\{[\s\S]*?min-height:\s*36px/,
    "short landscape roster footers should keep actions reachable without consuming the picker body",
  );
  assert.match(
    menusCss,
    /\.roster-body\s*\{[^}]*min-height:\s*0/,
    "the roster modal body must be allowed to shrink so its internal panes can scroll",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\)[\s\S]*?button\s*\{[\s\S]*?min-height: 44px/,
    "touch targets need a comfortable minimum button height on coarse pointers",
  );

  // Unit touch target = the unit's own tile diamond (see unitRenderer.js), so a
  // tall figurine that overhangs tiles behind it never steals their taps.
  assert.match(
    readFileSync(new URL("../src/ui/unitRenderer.js", import.meta.url), "utf8"),
    /class:\s*"unit-hit"/,
    "units need a board-sized touch target that does not steal taps from nearby floor tiles",
  );

  const mainJs = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(
    mainJs,
    /const requestAppFullscreen = \(\) => \{[\s\S]*?requestMobileFullscreen/,
    "the app-level fullscreen handler should call the Fullscreen API helper",
  );
  assert.match(
    mainJs,
    /addEventListener\("click", requestAppFullscreen, \{ capture: true \}\)/,
    "the app should request mobile fullscreen from taps anywhere in the app, not just match start",
  );
  assert.match(
    mainJs,
    /applyMobileViewport\(\)/,
    "the app should track viewport posture from boot",
  );
});

test("requestMobileFullscreen calls the Fullscreen API only for playable phone landscape", async () => {
  let requested = false;
  const root = {
    requestFullscreen: async (options) => {
      requested = options?.navigationUI === "hide";
    },
  };

  const ok = await requestMobileFullscreen({
    documentRef: {
      documentElement: root,
      fullscreenElement: null,
    },
    windowRef: {
      innerWidth: 844,
      innerHeight: 390,
      matchMedia: () => ({ matches: true }),
      navigator: { maxTouchPoints: 1 },
    },
  });

  assert.equal(ok, true);
  assert.equal(requested, true);
});
