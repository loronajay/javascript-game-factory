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

function assertGlassSurface(cssRule, label) {
  const alphas = backgroundAlphas(cssRule);
  assert.ok(alphas.length, `${label} should use an rgba glass background`);
  assert.ok(
    Math.max(...alphas) <= 0.5,
    `${label} should stay at or below 50% opacity so its splash art remains visible`,
  );
  assert.match(cssRule, /backdrop-filter:\s*blur\(/, `${label} should preserve readability with blur`);
}

test("painted menu screens use genuinely transparent glass panels", () => {
  const campaign = read("styles/campaign.css");
  const tournament = read("styles/tournament.css");
  const profile = read("styles/profile.css");

  assertGlassSurface(rule(campaign, ".circuit-card"), "circuit cards");
  assertGlassSurface(
    rule(tournament, ".tournament-bracket-board,\n.tournament-stage,\n.tournament-entry"),
    "tournament panels",
  );

  const profileScreen = rule(profile, ".profile-screen");
  const profileGlass = profileScreen.match(/--profile-glass:\s*rgba\([^)]*,\s*(\.?\d+)\)/)?.[1];
  assert.ok(profileGlass, "My Room should define a shared rgba glass surface");
  assert.ok(Number(profileGlass) <= 0.5, "My Room cards should stay at or below 50% opacity");
  assert.match(rule(profile, ".profile-card"), /backdrop-filter:\s*blur\(/);
});

test("full-screen art washes do not bury the painted backdrops", () => {
  const tournament = read("styles/tournament.css");
  const profile = read("styles/profile.css");

  const tournamentWash = backgroundAlphas(rule(tournament, ".tournament-atmosphere"));
  const profileWash = backgroundAlphas(rule(profile, ".profile-room-shade"));

  assert.ok(Math.max(...tournamentWash) <= 0.7, "the tournament atmosphere should leave the stage art visible");
  assert.ok(Math.max(...profileWash) <= 0.6, "the room shade should leave the equipped room visible");
});
