import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCatalogFacets,
  filterArcadeCatalog,
  parsePlayerRange,
} from "../arcade-catalog-query.mjs";

const games = [
  {
    slug: "runner",
    title: "Neon Runner",
    tagline: "Run the line.",
    description: "A local and online platform race.",
    categories: ["Action", "Platformer"],
    dimensions: ["2d"],
    playModes: ["solo", "local", "online"],
    players: "1-2",
    order: 2,
  },
  {
    slug: "maze",
    title: "Night Maze",
    tagline: "Find the exit.",
    description: "A first-person facility chase.",
    categories: ["Action", "Horror"],
    dimensions: ["3d"],
    playModes: ["solo", "online"],
    players: "1-8",
    order: 1,
  },
  {
    slug: "bowling",
    title: "Yam Bowling",
    tagline: "Find the pocket.",
    description: "Arcade and full 3D bowling.",
    categories: ["Arcade", "Sports"],
    dimensions: ["2d", "3d"],
    playModes: ["solo", "local", "online"],
    players: "1-2",
    order: 3,
  },
];

test("parsePlayerRange accepts the catalog's compact player labels", () => {
  assert.deepEqual(parsePlayerRange("1-2"), { min: 1, max: 2 });
  assert.deepEqual(parsePlayerRange("2"), { min: 2, max: 2 });
  assert.deepEqual(parsePlayerRange("1-8 players"), { min: 1, max: 8 });
});

test("filterArcadeCatalog combines search, category, dimension, mode, and party size", () => {
  const result = filterArcadeCatalog(games, {
    search: "bowling pocket",
    category: "sports",
    dimension: "3d",
    mode: "local",
    players: "2",
  });

  assert.deepEqual(result.map((game) => game.slug), ["bowling"]);
});

test("search covers title, tagline, description, and category metadata", () => {
  assert.deepEqual(
    filterArcadeCatalog(games, { search: "facility" }).map((game) => game.slug),
    ["maze"],
  );
  assert.deepEqual(
    filterArcadeCatalog(games, { search: "platformer" }).map((game) => game.slug),
    ["runner"],
  );
});

test("dimension filters include hybrid cabinets in both 2D and 3D results", () => {
  assert.deepEqual(
    filterArcadeCatalog(games, { dimension: "2d" }).map((game) => game.slug),
    ["runner", "bowling"],
  );
  assert.deepEqual(
    filterArcadeCatalog(games, { dimension: "3d" }).map((game) => game.slug),
    ["maze", "bowling"],
  );
});

test("sort supports factory order and alphabetical order without mutating input", () => {
  assert.deepEqual(
    filterArcadeCatalog(games, { sort: "factory" }).map((game) => game.slug),
    ["maze", "runner", "bowling"],
  );
  assert.deepEqual(
    filterArcadeCatalog(games, { sort: "title" }).map((game) => game.slug),
    ["runner", "maze", "bowling"],
  );
  assert.deepEqual(games.map((game) => game.slug), ["runner", "maze", "bowling"]);
});

test("buildCatalogFacets returns stable category counts and format counts", () => {
  const facets = buildCatalogFacets(games);

  assert.deepEqual(facets.categories, [
    { value: "Action", count: 2 },
    { value: "Arcade", count: 1 },
    { value: "Horror", count: 1 },
    { value: "Platformer", count: 1 },
    { value: "Sports", count: 1 },
  ]);
  assert.deepEqual(facets.dimensions, [
    { value: "2d", count: 2 },
    { value: "3d", count: 2 },
  ]);
});
