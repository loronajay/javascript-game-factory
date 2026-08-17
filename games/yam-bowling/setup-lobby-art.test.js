const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function rule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "s"))?.[1] || "";
}

function backgroundAlphas(cssRule) {
  const background = cssRule.match(/background:\s*([^;]+);/s)?.[1] || "";
  return [...background.matchAll(/rgba\([^)]*,\s*(\.?\d+)\)/g)].map((match) => Number(match[1]));
}

test("Exhibition and Online setup screens ship dedicated painted backdrops", () => {
  const html = read("index.html");

  assert.match(
    html,
    /id="setup-screen"[\s\S]*?class="setup-backdrop"[^>]+inner-menus\/locker-room\.webp/,
  );
  assert.match(
    html,
    /id="online-screen"[\s\S]*?class="setup-backdrop"[^>]+inner-menus\/online-lounge\.webp/,
  );
  assert.match(
    html,
    /id="online-lobby-screen"[\s\S]*?class="online-lobby-backdrop"[^>]+inner-menus\/online-lounge\.webp/,
  );
  assert.equal(
    fs.existsSync(path.join(root, "assets/menu-splashes/inner-menus/online-lounge.webp")),
    true,
  );
});

test("setup and waiting-lobby panels stay art-first without backdrop blur", () => {
  const setup = read("styles/setup.css");
  const online = read("styles/online.css");

  for (const [cssRule, label] of [
    [rule(setup, ".setup-screen .panel"), "setup panels"],
    [rule(online, ".online-lobby-card"), "online waiting lobby"],
  ]) {
    const alphas = backgroundAlphas(cssRule);
    assert.ok(alphas.length, `${label} should use an rgba glass background`);
    assert.ok(Math.max(...alphas) <= 0.22, `${label} should not bury its splash art`);
    assert.doesNotMatch(cssRule, /backdrop-filter:\s*[^;]*blur\(/, `${label} should not blur its splash art`);
  }
});

test("the multiplayer setup separates public matchmaking from private rooms", () => {
  const html = read("index.html");
  const online = read("styles/online.css");
  const onlineSection = html.match(/id="online-screen"[\s\S]*?<\/section>\s*<section class="screen online-lobby-screen"/)?.[0] || "";

  assert.equal((onlineSection.match(/class="online-match-route/g) || []).length, 2);
  assert.match(onlineSection, /Public matchmaking/);
  assert.match(onlineSection, /Private room/);
  assert.match(online, /\.online-match-route\s*\{/);
  assert.match(online, /\.online-network-mark\s*\{/);
});
