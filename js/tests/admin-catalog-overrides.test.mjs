import test from "node:test";
import assert from "node:assert/strict";

import { applyCabinetOverrides, normalizeGameEntry } from "../arcade-catalog.mjs";

// applyCabinetOverrides is the ONLY place admin-authored data touches the arcade grid.
// The tests below are the guarantee that a mistake in the console — or a stale row, or a
// hostile one — cannot break a cabinet. They are deliberately about what the function
// REFUSES to do, not just what it does.

function catalog() {
  return [
    normalizeGameEntry("tactical-arena", {
      title: "Tactical Arena", order: 1, status: "Release candidate",
      description: "A full tactics game.", categories: ["Strategy", "RPG"],
      dimensions: ["2d"], play_modes: ["solo", "local", "online"],
    }),
    normalizeGameEntry("sumorai", {
      title: "Sumorai", order: 4, tagline: "One hit, one kill.",
      description: "A one-hit fighting game.", categories: ["Fighting", "Action"],
      dimensions: ["2d"], play_modes: ["solo", "local", "online"],
    }),
    normalizeGameEntry("creature-battler", { title: "Creature Battler", order: 8 }, "creature-battle"),
  ];
}

test("a catalog with no overrides is returned untouched", () => {
  const games = catalog();
  assert.deepEqual(applyCabinetOverrides(games, []), games);
  assert.deepEqual(applyCabinetOverrides(games, undefined), games);
});

// The single most important guarantee: an override can never change where a card points.
// If it could, one bad row would send players to a dead path or the wrong game.
test("overrides can never change a cabinet's href, slug, or preview image", () => {
  const [original] = catalog().filter((game) => game.slug === "creature-battler");
  const merged = applyCabinetOverrides(catalog(), [{
    slug: "creature-battler",
    title: "Hijacked",
    // Every one of these is a field the function must ignore.
    href: "https://evil.example/",
    previewImage: "https://evil.example/x.png",
    path: "somewhere-else",
  }]);

  const result = merged.find((game) => game.slug === "creature-battler");
  assert.equal(result.href, original.href, "href comes from the catalog, never from an override");
  assert.equal(result.href, "games/creature-battle/index.html");
  assert.equal(result.previewImage, original.previewImage);
  assert.equal(result.slug, "creature-battler");
  assert.equal(result.title, "Hijacked", "presentation fields DO apply");
});

// A row for a slug that is not in the catalog must be ignored rather than rendered, so a
// typo or a cabinet that was removed from ARCADE_GAME_SLUGS cannot produce a broken card.
test("an override for an unknown cabinet never adds a card to the grid", () => {
  const merged = applyCabinetOverrides(catalog(), [
    { slug: "not-a-real-game", title: "Ghost Cabinet" },
    { slug: "", title: "Nameless" },
  ]);

  assert.equal(merged.length, 3);
  assert.equal(merged.some((game) => game.slug === "not-a-real-game"), false);
});

test("null and absent fields inherit from game.json instead of blanking the card", () => {
  const merged = applyCabinetOverrides(catalog(), [{
    slug: "sumorai",
    title: null,
    tagline: "",
    statusLabel: null,
    sortOrder: null,
    featured: null,
  }]);

  const sumorai = merged.find((game) => game.slug === "sumorai");
  assert.equal(sumorai.title, "Sumorai");
  assert.equal(sumorai.tagline, "One hit, one kill.");
  assert.equal(sumorai.order, 4);
  assert.equal(sumorai.featured, false);
});

test("hiding a cabinet removes only its grid card, leaving the rest of the catalog intact", () => {
  const merged = applyCabinetOverrides(catalog(), [{ slug: "sumorai", hidden: true }]);

  assert.equal(merged.length, 2);
  assert.equal(merged.some((game) => game.slug === "sumorai"), false);
  assert.equal(merged.some((game) => game.slug === "tactical-arena"), true);
});

test("a sort order override re-sorts the grid", () => {
  const merged = applyCabinetOverrides(catalog(), [{ slug: "sumorai", sortOrder: 0 }]);
  assert.equal(merged[0].slug, "sumorai");
});

test("admin metadata overrides can update catalog copy, tags, format, and play modes", () => {
  const merged = applyCabinetOverrides(catalog(), [{
    slug: "sumorai",
    description: "Updated cabinet description.",
    categories: ["Arcade", "Fighting"],
    dimensions: ["2d", "3d"],
    playModes: ["online"],
    previewVideo: "grid-previews/sumorai.webm",
  }]);

  const sumorai = merged.find((game) => game.slug === "sumorai");
  assert.equal(sumorai.description, "Updated cabinet description.");
  assert.deepEqual(sumorai.categories, ["Arcade", "Fighting"]);
  assert.deepEqual(sumorai.dimensions, ["2d", "3d"]);
  assert.deepEqual(sumorai.playModes, ["online"]);
  assert.equal(sumorai.previewVideo, "grid-previews/sumorai.webm");
});

test("video overrides accept local catalog clips but refuse remote media", () => {
  const local = applyCabinetOverrides(catalog(), [{
    slug: "sumorai", previewVideo: "grid-previews/sumorai.webm",
  }]).find((game) => game.slug === "sumorai");
  assert.equal(local.previewVideo, "grid-previews/sumorai.webm");

  const remote = applyCabinetOverrides(catalog(), [{
    slug: "sumorai", previewVideo: "https://tracker.example/sumorai.mp4",
  }]).find((game) => game.slug === "sumorai");
  assert.equal(remote.previewVideo, undefined);
});

test("empty or invalid metadata overrides inherit the shipped game.json values", () => {
  const original = catalog().find((game) => game.slug === "sumorai");
  const merged = applyCabinetOverrides(catalog(), [{
    slug: "sumorai",
    description: "",
    categories: [],
    dimensions: ["sideways"],
    playModes: ["lan-party"],
  }]);

  const sumorai = merged.find((game) => game.slug === "sumorai");
  assert.equal(sumorai.description, original.description);
  assert.deepEqual(sumorai.categories, original.categories);
  assert.deepEqual(sumorai.dimensions, original.dimensions);
  assert.deepEqual(sumorai.playModes, original.playModes);
});

test("explicit false is honoured for featured, but an absent value is not", () => {
  const featured = catalog().map((game) => ({ ...game, featured: true }));

  const cleared = applyCabinetOverrides(featured, [{ slug: "sumorai", featured: false }]);
  assert.equal(cleared.find((game) => game.slug === "sumorai").featured, false);

  const untouched = applyCabinetOverrides(featured, [{ slug: "sumorai", title: "Renamed" }]);
  assert.equal(untouched.find((game) => game.slug === "sumorai").featured, true);
});

// The grid calls this with whatever /site-config returned, including nothing at all.
// A backend outage must degrade to the file-based catalog, never to an exception.
test("malformed override payloads degrade to the file-based catalog", () => {
  const games = catalog();
  for (const payload of [null, undefined, "not an array", [null], [{}], [{ slug: 42 }]]) {
    const merged = applyCabinetOverrides(games, payload);
    assert.equal(merged.length, 3, `payload ${JSON.stringify(payload)} must not drop cabinets`);
  }
});
