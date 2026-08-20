const CHARACTER_ROOT = new URL(
  "../../assets/characters/maddie-bloom/",
  import.meta.url,
);
const GUARD_REVIEW_ROOT = new URL(
  "../../review/maddie-bloom/sprites/guard-v3/",
  import.meta.url,
);
const GUARD_REVIEW_REVISION = "guard-review-v3";

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`Unable to load ${url}`)), { once: true });
    image.src = url;
  });
}

async function loadAction(entries, root, revision) {
  return Object.fromEntries(await Promise.all(
    Object.entries(entries).map(async ([direction, relativePath]) => {
      const url = new URL(relativePath, root);
      url.searchParams.set("v", String(revision));
      return [direction, await loadImage(url.href)];
    }),
  ));
}

function guardEntriesFor(directions) {
  return Object.fromEntries(directions.map((direction) => [direction, `${direction}.png`]));
}

export async function loadMaddieMatchSet() {
  const manifestUrl = new URL("character.json", CHARACTER_ROOT);
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`Unable to load Maddie manifest (${response.status})`);
  const manifest = await response.json();
  const directions = Object.keys(manifest.actions.idle);
  const [idle, guard] = await Promise.all([
    loadAction(manifest.actions.idle, CHARACTER_ROOT, manifest.assetVersion),
    loadAction(guardEntriesFor(directions), GUARD_REVIEW_ROOT, GUARD_REVIEW_REVISION),
  ]);

  return {
    displayName: manifest.displayName,
    actions: { idle, guard },
  };
}
