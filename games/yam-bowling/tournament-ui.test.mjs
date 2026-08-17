import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { tournamentBracketMarkup } from "./ui/tournament-screen.mjs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const assets = {
  bowlerBySlug(slug) {
    return {
      "daisy-monroe": { name: "Daisy Monroe" },
      "lumi-vega": { name: "Lumi Vega" },
      "scarlett-voss": { name: "Scarlett Voss" },
      "reina-sato": { name: "Reina Sato" },
    }[slug];
  },
  characterPortrait(slug) {
    return `/portraits/${slug}.webp`;
  },
  storedSkinId() {
    return "classic";
  },
};

const state = {
  status: "open",
  completedRoundIndexes: [0],
  event: {
    rounds: [
      { index: 0, name: "Opening Round", opponentSlug: "lumi-vega" },
      { index: 1, name: "Semifinal", opponentSlug: "scarlett-voss" },
      { index: 2, name: "Championship Final", opponentSlug: "reina-sato" },
    ],
  },
};

test("the tournament renders an actual connected elimination route", () => {
  const markup = tournamentBracketMarkup(state, assets, "daisy-monroe");

  assert.equal((markup.match(/class="tournament-matchup /g) || []).length, 3);
  assert.equal((markup.match(/class="tournament-bracket-connector/g) || []).length, 3);
  assert.match(markup, /data-round="0"[^>]*is-cleared/);
  assert.match(markup, /data-round="1"[^>]*is-current/);
  assert.match(markup, /data-round="2"[^>]*is-locked/);
  assert.match(markup, /Daisy Monroe/);
  assert.match(markup, /Lumi Vega/);
  assert.match(markup, /Scarlett Voss/);
  assert.match(markup, /Reina Sato/);
  assert.match(markup, /tournament-champion-destination/);
  assert.match(markup, /Crown the champion/);
});

test("the tournament owns a prestigious presentation instead of inheriting the circuit composition", () => {
  const html = read("./index.html");
  const css = read("./styles/tournament.css");
  const screenSource = read("./ui/tournament-screen.mjs");
  const section = html.match(/<section class="screen tournament-screen"[\s\S]*?<\/section>\s*<section class="screen setup-screen/)?.[0] || "";

  assert.ok(section, "the dedicated tournament section should exist");
  assert.doesNotMatch(section, /circuit-(?:layout|card|event|roster|faceoff|header)/);
  assert.match(section, /assets\/menu-splashes\/inner-menus\/tournament-registration\.webp/);
  assert.match(section, /id="tournament-bracket"/);
  assert.match(section, /class="tournament-stage"/);
  assert.match(section, /class="tournament-entry"/);
  assert.match(css, /\.tournament-bracket-track\s*\{/);
  assert.match(css, /\.tournament-bracket-connector\s*\{/);
  assert.match(css, /\.tournament-champion-destination\s*\{/);
  assert.match(screenSource, /bracketScroll\.scrollLeft/, "a narrow bracket should open on the current round");
});
