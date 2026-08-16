const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("the title enters a dedicated circuit registration screen", () => {
  const html = read("index.html");
  const bindings = read("input/bindings.mjs");

  for (const id of [
    "circuit-button",
    "circuit-screen",
    "circuit-back",
    "circuit-division-name",
    "circuit-progress",
    "circuit-roster",
    "circuit-opponent-art",
    "circuit-opponent-name",
    "circuit-difficulty",
    "circuit-achievement-title",
    "start-circuit-match",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} should exist`);
  }
  assert.match(bindings, /circuitScreen\.open\(\)/);
});

test("Circuit and Online are both gated by the real Factory account session", () => {
  const html = read("index.html");
  const game = read("game.js");
  const bindings = read("input/bindings.mjs");
  const onlineSession = read("online/online-session.mjs");

  for (const id of ["circuit-button", "online-button"]) {
    const button = html.match(new RegExp(`<button[^>]*id=["']${id}["'][^>]*>`, "i"))?.[0] || "";
    assert.match(button, /data-factory-account-feature/);
  }
  assert.match(game, /createYamAccountAccess/);
  assert.match(game, /accountAccess\.syncControls/);
  assert.match(game, /accountAccess\.isEligible\(\)\s*&&\s*onlineClient\.resumeSavedSession\(\)/);
  assert.match(bindings, /accountAccess\.requireFactoryAccount\(\)/);
  assert.match(onlineSession, /accountAccess\.requireFactoryAccount\(\)/);
});

test("a failed campaign sync is status copy, never a repurposed match button", () => {
  const html = read("index.html");
  const screen = read("ui/circuit-screen.mjs");

  assert.match(html, /id=["']circuit-sync-status["']/);
  assert.match(screen, /circuit-sync-status/);
  assert.doesNotMatch(screen, /button\.textContent\s*=\s*["']Factory profile unavailable["']/);
});

test("campaign owns circuit unlocks without absorbing tournaments or loadout rooms", () => {
  const html = read("index.html");
  const core = read("campaign-core.js");
  const screen = read("ui/circuit-screen.mjs");

  assert.ok(html.indexOf("campaign-core.js") < html.indexOf("game.js"));
  assert.match(screen, /campaignProgress\.claimCircuitClear\(/);
  assert.doesNotMatch(screen, /recordMatchResult\(/);
  assert.match(screen, /session\.campaignMatch/);
  assert.match(screen, /matchRuntime\.startMatch\(\)/);
  assert.doesNotMatch(core, /TOURNAMENT_(?:MATCHES|REWARDS)|equipSkin|equipGlobalSlot|player-room|locker-room/i);
  assert.doesNotMatch(screen, /equipSkin|equipGlobalSlot|player-room|locker-room/i);
});

test("campaign artwork and modules ship in the runtime", () => {
  const manifest = JSON.parse(read("runtime-assets.json"));
  assert.ok(manifest.include.includes("campaign-core.js"));
  assert.ok(manifest.include.includes("assets/menu-splashes/**/*.webp"));
  assert.equal(
    fs.existsSync(path.join(root, "assets/menu-splashes/inner-menus/registration-counter.webp")),
    true,
  );
});

test("the circuit has a dedicated short-landscape composition", () => {
  const mobile = read("styles/mobile-landscape.css");
  assert.match(mobile, /\.circuit-layout\s*\{[^}]*grid-template-columns:/s);
  assert.match(mobile, /\.circuit-faceoff\s*\{[^}]*height:/s);
  assert.match(mobile, /\.circuit-roster-entry\s*\{[^}]*height:/s);
});

test("registration panels preserve the painted venue behind the interface", () => {
  const css = read("styles/campaign.css");
  const cardRule = css.match(/\.circuit-card\s*\{[^}]*\}/s)?.[0] || "";
  assert.match(cardRule, /rgba\(18,19,25,\.6\)/);
  assert.match(cardRule, /backdrop-filter:\s*blur\(8px\)/);
  assert.doesNotMatch(cardRule, /rgba\([^)]*,\.(?:9\d|100)\)/);
});
