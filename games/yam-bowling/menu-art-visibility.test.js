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

function assertArtFirstSurface(cssRule, label) {
  const alphas = backgroundAlphas(cssRule);
  assert.ok(alphas.length, `${label} should use an rgba glass background`);
  assert.ok(
    Math.max(...alphas) <= 0.22,
    `${label} should stay at or below 22% opacity so its splash art remains obvious`,
  );
  assert.doesNotMatch(cssRule, /backdrop-filter:\s*[^;]*blur\(/, `${label} must not blur away the splash art`);
}

test("painted menu screens use genuinely transparent glass panels", () => {
  const campaign = read("styles/campaign.css");
  const tournament = read("styles/tournament.css");
  const profile = read("styles/profile.css");

  assertArtFirstSurface(rule(campaign, ".circuit-card"), "circuit cards");
  assertArtFirstSurface(
    rule(tournament, ".tournament-bracket-board,\n.tournament-stage,\n.tournament-entry"),
    "tournament panels",
  );

  const profileScreen = rule(profile, ".profile-screen");
  const profileGlass = profileScreen.match(/--profile-glass:\s*rgba\([^)]*,\s*(\.?\d+)\)/)?.[1];
  assert.ok(profileGlass, "My Room should define a shared rgba glass surface");
  assert.ok(Number(profileGlass) <= 0.22, "My Room cards should stay at or below 22% opacity");
  assert.doesNotMatch(rule(profile, ".profile-card"), /backdrop-filter:\s*[^;]*blur\(/);
});

test("room and circuit panels use a consistent fifteen-percent tint", () => {
  const campaign = read("styles/campaign.css");
  const profile = read("styles/profile.css");

  assert.match(
    rule(campaign, ".circuit-card"),
    /background:\s*rgba\(8,\s*9,\s*13,\s*\.15\)/,
    "circuit panels should retain a subtle dark surface over the artwork",
  );
  assert.match(
    rule(profile, ".profile-screen"),
    /--profile-glass:\s*rgba\(8,\s*9,\s*13,\s*\.15\)/,
    "My Room panels should share the same subtle dark surface",
  );
});

test("room and circuit backdrops show the complete splash artwork", () => {
  const campaign = read("styles/campaign.css");
  const profile = read("styles/profile.css");

  assert.match(rule(campaign, ".circuit-backdrop"), /object-fit:\s*contain/, "the circuit splash should not be cropped");
  assert.match(rule(profile, ".profile-room-art"), /object-fit:\s*contain/, "the equipped room splash should not be cropped");
  assert.match(rule(profile, ".public-profile-room-art"), /object-fit:\s*contain/, "public room splashes should not be cropped");
});

test("full-screen art washes do not bury the painted backdrops", () => {
  const campaign = read("styles/campaign.css");
  const tournament = read("styles/tournament.css");
  const profile = read("styles/profile.css");

  const circuitWash = backgroundAlphas(rule(campaign, ".circuit-vignette"));
  const tournamentWash = backgroundAlphas(rule(tournament, ".tournament-atmosphere"));
  const profileWash = backgroundAlphas(rule(profile, ".profile-room-shade"));

  assert.ok(Math.max(...circuitWash) <= 0.3, "the circuit wash should leave the registration art obvious");
  assert.ok(Math.max(...tournamentWash) <= 0.3, "the tournament atmosphere should leave the stage art obvious");
  assert.ok(Math.max(...profileWash) <= 0.3, "the room shade should leave the equipped room obvious");
});
